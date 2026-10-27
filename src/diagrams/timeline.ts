// Lays out and draws a timeline: events on an axis spaced by real time (or evenly, when
// undated), spans as bars beside the axis, groups as bands, and cause edges as arcs.
//
// Across (direction=right), outward from the axis: span lanes, then event cards in lanes,
// each card joined to its dot by a stem. Tick labels and cause arcs sit on the other side.
// Down (direction=down) is the same picture turned: one column of cards, pushed apart where
// they would overlap.
import type { Diagram, DiagramNode, Time } from '../model.ts';
import { drawText, edgeSvg, labelSvg, markers, measureText, type Box, type TextLines } from './graph.ts';
import { textWidth, wrap } from '../text/measure.ts';
import { arrowhead, esc, HEAD, n, roleAttr, type Rendered } from '../render/svg.ts';

const MARGIN = 16;
const MAX_LABEL = 150;
const PAD_X = 12;
const PAD_Y = 8;
const TIME_FONT = 11.5;
const TIME_H = 15;
const CARD_GAP = 12;
const STEM = 16;
// How far a card reaches left of its stem.
const FLAG = 12;
const SPAN_LANE = 12;
const SPAN_H = 6;
const DOT = 4.5;
const GROUP_TITLE = 26;
const GROUP_PAD = 12;
const TICK_GAP_ACROSS = 84;
const TICK_GAP_DOWN = 44;
const LABEL_FONT = 12.5;
const LABEL_LINE = 16;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Event {
  node: DiagramNode;
  // Position along the axis, from 0.
  at: number;
  end?: number;
  time: string;
  text: TextLines;
  w: number;
  h: number;
  // Card box, and the span lane when the event lasts.
  box: Box;
  lane: number;
}

export function renderTimeline(d: Diagram, refMarkers: Map<string, string>, domId: string): Rendered {
  const across = (d.direction ?? 'right') === 'right';
  const dated = d.nodes.some((node) => node.time);
  const sorted = dated
    ? [...d.nodes].filter((node) => node.time).sort((a, b) => a.time!.value - b.time!.value || a.line - b.line)
    : d.nodes;

  const events: Event[] = sorted.map((node) => {
    const text = measureText(node, MAX_LABEL);
    const time = node.time ? formatTime(node.time) : '';
    const w = Math.ceil(Math.max(text.w, textWidth(time, TIME_FONT, 'sans500')) + 2 * PAD_X);
    const h = Math.ceil(text.h + (time ? TIME_H : 0) + 2 * PAD_Y);
    return { node, at: 0, time, text, w, h, box: { x: 0, y: 0, w, h }, lane: -1 };
  });

  // Positions along the axis.
  let length: number;
  let ticks: { at: number; label: string }[] = [];
  if (dated && events.length) {
    const t0 = Math.min(...events.map((e) => e.node.time!.value));
    const t1 = Math.max(...events.map((e) => (e.node.until ?? e.node.time!).value));
    const room = across
      ? events.reduce((s, e) => s + e.w + CARD_GAP, 0) * 1.1
      : events.reduce((s, e) => s + e.h + CARD_GAP, 0);
    length = Math.round(Math.min(across ? 860 : 900, Math.max(across ? 520 : 360, room)));
    const scale = t1 > t0 ? length / (t1 - t0) : 0;
    if (t1 === t0) length = 0;
    for (const e of events) {
      e.at = (e.node.time!.value - t0) * scale;
      if (e.node.until) e.end = (e.node.until.value - t0) * scale;
    }
    if (t1 > t0)
      ticks = makeTicks(
        t0,
        t1,
        events[0].node.time!.form === 'clock',
        Math.floor(length / (across ? TICK_GAP_ACROSS : TICK_GAP_DOWN)),
      ).map((t) => ({ at: (t.value - t0) * scale, label: t.label }));
  } else {
    const step = across
      ? Math.max(0, ...events.map((e) => e.w)) + CARD_GAP * 2
      : Math.max(0, ...events.map((e) => e.h)) + CARD_GAP;
    events.forEach((e, i) => (e.at = i * step));
    length = Math.max(0, events.length - 1) * step;
  }

  // Span lanes: a span takes the first lane where it does not overlap another.
  const laneEnds: number[] = [];
  for (const e of events) {
    if (e.end === undefined) continue;
    let lane = laneEnds.findIndex((end) => end + 6 < e.at);
    if (lane < 0) lane = laneEnds.push(0) - 1;
    laneEnds[lane] = e.end;
    e.lane = lane;
  }
  const spanZone = laneEnds.length ? laneEnds.length * SPAN_LANE + 6 : 0;

  // Cards. Across: lanes outward from the axis. Down: one column, pushed apart.
  const cardH = Math.max(0, ...events.map((e) => e.h));
  let cardLanes = 0;
  if (across) {
    // Each card hangs off its stem like a flag, reaching right. No stem may run through a
    // card: a card that covers another event's stem must sit further out than that event's
    // card, and cards in one lane must not touch. Placed from the latest event back, each
    // card takes the lowest lane that keeps both rules.
    const covers = (c: Event, at: number) => at > c.box.x - 6 && at < c.box.x + c.w + 6;
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      e.box = { x: e.at - FLAG, y: 0, w: e.w, h: e.h };
      const later = events.slice(i + 1);
      let lane = Math.max(0, ...later.filter((o) => covers(e, o.at)).map((o) => o.box.y + 1));
      const below = Math.min(Infinity, ...later.filter((o) => covers(o, e.at)).map((o) => o.box.y));
      const clash = (k: number) =>
        later.some((o) => o.box.y === k && o.box.x < e.box.x + e.w + CARD_GAP && e.box.x < o.box.x + o.w + CARD_GAP);
      while (clash(lane)) lane++;
      // Rare: hemmed in from both sides. Lift the later cards that cover this stem above it.
      if (lane >= below) for (const o of later) if (covers(o, e.at) && o.box.y <= lane) o.box.y = lane + 1;
      e.box.y = lane;
    }
    cardLanes = Math.max(0, ...events.map((e) => e.box.y + 1));
  } else {
    let bottom = -Infinity;
    for (const e of events) {
      const y = Math.max(e.at - e.h / 2, bottom + CARD_GAP);
      e.box = { x: 0, y, w: e.w, h: e.h };
      bottom = y + e.h;
    }
  }

  // Cause edges: arcs on the far side of the axis.
  const byId = new Map(events.map((e) => [e.node.id, e]));
  const edges = d.edges.filter((e) => byId.has(e.from) && byId.has(e.to) && e.from !== e.to);
  const labelBox = (label?: string): [number, number] => {
    if (!label) return [0, 0];
    const lines = wrap(label, LABEL_FONT, 150);
    return [Math.max(...lines.map((l) => textWidth(l, LABEL_FONT))) + 10, lines.length * LABEL_LINE + 4];
  };
  const depth = (a: number, b: number): number => Math.min(96, 30 + Math.abs(b - a) * 0.22);
  const tickW = across ? 0 : Math.max(0, ...ticks.map((t) => textWidth(t.label, TIME_FONT)));
  const tickRoom = ticks.length ? (across ? 26 : tickW + 18) : 8;
  const far = Math.max(
    tickRoom,
    ...edges.map(
      (e) =>
        depth(byId.get(e.from)!.at, byId.get(e.to)!.at) +
        (across ? labelBox(e.label)[1] : labelBox(e.label)[0]) / 2 +
        4,
    ),
  );

  // Groups: bands over their members' time.
  const groupDepth = d.groups.map((g) => {
    let k = 0;
    for (let p = g.parent; p >= 0; p = d.groups[p].parent) k++;
    return k;
  });
  const bands = d.groups.map((g, i) => {
    const members = events.filter((e) => inGroup(d, e.node, i));
    if (!members.length) return undefined;
    const from = Math.min(...members.map((e) => e.at));
    const to = Math.max(...members.map((e) => e.end ?? e.at));
    return {
      label: g.label,
      from: from - GROUP_PAD + groupDepth[i] * 4,
      to: to + GROUP_PAD - groupDepth[i] * 4,
      depth: groupDepth[i],
    };
  });
  // Across, band titles sit above the cards; down, at the band's far end beside its top.
  const groupRoom = bands.some(Boolean) ? GROUP_TITLE + Math.max(0, ...groupDepth) * 16 : 0;

  // Place everything in one frame: `axis` is the axis line's offset across the flow.
  const near = spanZone + STEM;
  let width: number;
  let height: number;
  let origin: number;
  let axis: number;
  if (across) {
    const left = Math.min(0, ...events.map((e) => e.box.x), ...bands.filter(Boolean).map((b) => b!.from));
    const right = Math.max(
      length + 14,
      ...events.map((e) => e.box.x + e.box.w),
      ...bands.filter(Boolean).map((b) => b!.to),
    );
    origin = MARGIN - left;
    axis = MARGIN + groupRoom + cardLanes * (cardH + CARD_GAP) - CARD_GAP + near;
    for (const e of events)
      e.box = { x: origin + e.box.x, y: axis - near - e.box.y * (cardH + CARD_GAP) - e.h, w: e.w, h: e.h };
    width = Math.ceil(origin + right + MARGIN);
    height = Math.ceil(axis + far + MARGIN);
  } else {
    const top = Math.min(0, ...events.map((e) => e.box.y), ...bands.filter(Boolean).map((b) => b!.from));
    const bottom = Math.max(
      length + 14,
      ...events.map((e) => e.box.y + e.box.h),
      ...bands.filter(Boolean).map((b) => b!.to),
    );
    origin = MARGIN - top;
    axis = MARGIN + far;
    const cardsAt = axis + near;
    const cardW = Math.max(0, ...events.map((e) => e.w));
    for (const e of events) e.box = { x: cardsAt, y: origin + e.box.y, w: e.w, h: e.h };
    const titles = Math.max(
      0,
      ...bands.filter(Boolean).map((b) => textWidth(b!.label.toUpperCase(), 10.5, 'sans600') * 1.18 + 28),
    );
    width = Math.ceil(cardsAt + cardW + Math.max(MARGIN, titles + 8));
    height = Math.ceil(origin + bottom + MARGIN);
  }
  // A point `at` along the axis, `off` away from it (positive: towards the cards).
  const pt = (at: number, off: number): [number, number] =>
    across ? [origin + at, axis - off] : [axis + off, origin + at];

  const out: string[] = [];
  out.push(
    `<svg class="pr-svg pr-timeline" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">`,
  );
  out.push(
    `<defs><pattern id="${domId}-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" class="pr-hatch"/></pattern></defs>`,
  );

  // Bands.
  for (const b of bands) {
    if (!b) continue;
    if (across) {
      const y = MARGIN + b.depth * 16;
      out.push(
        `<g class="pr-group pr-band"><rect x="${n(origin + b.from)}" y="${n(y)}" width="${n(b.to - b.from)}" height="${n(axis + 10 - y)}" rx="8"/><text x="${n(origin + b.from + 10)}" y="${n(y + 17)}">${esc(b.label)}</text></g>`,
      );
    } else {
      const x = MARGIN + b.depth * 8;
      out.push(
        `<g class="pr-group pr-band"><rect x="${n(x)}" y="${n(origin + b.from)}" width="${n(width - MARGIN - x)}" height="${n(b.to - b.from)}" rx="8"/><text class="pr-band-end" x="${n(width - MARGIN - 10)}" y="${n(origin + b.from + 17)}">${esc(b.label)}</text></g>`,
      );
    }
  }

  // Axis and ticks.
  const [ax0, ay0] = pt(-8, 0);
  const [ax1, ay1] = pt(length + 14, 0);
  out.push(
    `<g class="pr-axis"><path class="pr-axis-line" d="M${n(ax0)},${n(ay0)}L${n(ax1)},${n(ay1)}"/><path class="pr-axis-head" d="${arrowhead(ax1, ay1, ax1 - ax0, ay1 - ay0)}"/>`,
  );
  // A tick label gives way where an edge leaves or meets the axis.
  const ends = edges.flatMap((e) => [byId.get(e.from)!.at, byId.get(e.to)!.at]);
  for (const t of ticks) {
    const [x, y] = pt(t.at, 0);
    if (ends.some((at) => Math.abs(at - t.at) < (across ? 24 : 10))) {
      out.push(
        across ? `<path class="pr-tick" d="M${n(x)},${n(y)}v4"/>` : `<path class="pr-tick" d="M${n(x)},${n(y)}h-4"/>`,
      );
      continue;
    }
    out.push(
      across
        ? `<path class="pr-tick" d="M${n(x)},${n(y)}v4"/><text class="pr-tick-label" x="${n(x)}" y="${n(y + 17)}">${esc(t.label)}</text>`
        : `<path class="pr-tick" d="M${n(x)},${n(y)}h-4"/><text class="pr-tick-label pr-tick-down" x="${n(x - 9)}" y="${n(y)}" dy="0.35em">${esc(t.label)}</text>`,
    );
  }
  out.push('</g>');

  // Edges.
  const labels: string[] = [];
  const anchors = new Map<number, { x: number; y: number }>();
  for (const e of edges) {
    const a = byId.get(e.from)!.at;
    const b = byId.get(e.to)!.at;
    const k = depth(a, b);
    const [x1, y1] = pt(a, -DOT - 2);
    const [x2, y2] = pt(b, -DOT - 2 - HEAD + 1);
    const [c1x, c1y] = pt(a, -k * 1.33);
    const [c2x, c2y] = pt(b, -k * 1.33);
    const [mx, my] = pt((a + b) / 2, -k);
    const both = e.arrow === '<->';
    const [sx, sy] = both ? pt(a, -DOT - 2 - HEAD + 1) : [x1, y1];
    const tip = pt(b, -DOT - 2);
    const start = pt(a, -DOT - 2);
    out.push(
      edgeSvg(
        e,
        {
          d: `M${n(sx)},${n(sy)}C${n(c1x)},${n(c1y)} ${n(c2x)},${n(c2y)} ${n(x2)},${n(y2)}`,
          sx: start[0],
          sy: start[1],
          sdx: start[0] - sx,
          sdy: start[1] - sy,
          ex: tip[0],
          ey: tip[1],
          edx: tip[0] - x2,
          edy: tip[1] - y2,
        },
        both,
      ),
    );
    if (e.label) {
      const [lw, lh] = labelBox(e.label);
      const [lx, ly] = across ? [mx, my + lh / 2 - 2] : [mx - lw / 2 + 2, my];
      labels.push(labelSvg(e, lx, ly, false));
      anchors.set(e.index, { x: lx - lw / 2 - 4, y: ly });
    } else anchors.set(e.index, { x: mx, y: my });
  }

  // Events.
  for (const e of events) {
    const node = e.node;
    const attrs = ` data-node="${esc(node.id)}" id="${domId}-node-${esc(node.id)}"${roleAttr(node.role)}`;
    const b = e.box;
    const [dx, dy] = pt(e.at, 0);
    let s = `<g class="pr-node pr-event${e.end !== undefined ? ' pr-lasting' : ''}"${attrs}>`;
    const [cx, cy] = across ? [dx, b.y + b.h] : [b.x, Math.min(Math.max(dy, b.y + 10), b.y + b.h - 10)];
    s += `<path class="pr-stem" d="M${n(dx)},${n(dy)}${across ? `V${n(cy)}` : `L${n(cx - 6)},${n(cy)}H${n(cx)}`}"/>`;
    if (e.end !== undefined) {
      const [sx, sy] = pt(e.at, 6 + e.lane * SPAN_LANE + SPAN_H / 2);
      const [ex, ey] = pt(e.end, 6 + e.lane * SPAN_LANE + SPAN_H / 2);
      s += across
        ? `<rect class="pr-span" x="${n(sx)}" y="${n(sy - SPAN_H / 2)}" width="${n(Math.max(SPAN_H, ex - sx))}" height="${SPAN_H}" rx="${SPAN_H / 2}"/>`
        : `<rect class="pr-span" x="${n(sx - SPAN_H / 2)}" y="${n(sy)}" width="${SPAN_H}" height="${n(Math.max(SPAN_H, ey - sy))}" rx="${SPAN_H / 2}"/>`;
    }
    s += `<circle class="pr-event-dot" cx="${n(dx)}" cy="${n(dy)}" r="${DOT}"/>`;
    s += `<rect class="pr-box" x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="8"/>`;
    if (node.role === 'error')
      s += `<rect class="pr-hatch-fill" x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="8" fill="url(#${domId}-hatch)"/>`;
    let top = b.y + PAD_Y;
    if (e.time) {
      s += `<text class="pr-when" x="${n(b.x + PAD_X)}" y="${n(top + TIME_H / 2 - 1)}" dy="0.35em">${esc(e.time)}</text>`;
      top += TIME_H;
    }
    s += drawText(e.text, b.x + PAD_X, top + e.text.h / 2, 'start');
    out.push(s + '</g>');
  }
  out.push(...labels);
  out.push(...markers(d, new Map(events.map((e) => [e.node.id, e.box])), anchors, refMarkers));
  out.push('</svg>');
  return { svg: out.join(''), width, height };
}

function inGroup(d: Diagram, node: DiagramNode, g: number): boolean {
  for (let p = node.group; p >= 0; p = d.groups[p].parent) if (p === g) return true;
  return false;
}

// How a time reads on a card: "14:02", "Mar 2019", "14 Mar 2019, 14:02".
export function formatTime(t: Time): string {
  if (t.form === 'clock') return t.text.replace(/^(\d):/, '0$1:');
  const date = new Date(t.value);
  const y = date.getUTCFullYear();
  const mon = MONTHS[date.getUTCMonth()];
  const day = date.getUTCDate();
  if (t.form === 'year') return String(y);
  if (t.form === 'month') return `${mon} ${y}`;
  if (t.form === 'day') return `${day} ${mon} ${y}`;
  return `${day} ${mon} ${y}, ${t.text.slice(11)}`;
}

// Round times between t0 and t1, at the finest step that leaves at most `most` of them.
function makeTicks(t0: number, t1: number, clock: boolean, most: number): { value: number; label: string }[] {
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const pad = (v: number) => String(v).padStart(2, '0');
  const hm = (v: number) => {
    const d = new Date(v);
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  };
  type Tick = { value: number; label: string };
  // Each candidate step, with its rough length so a far too fine one is skipped unbuilt.
  const fixed = (step: number, label: (v: number) => string) => ({
    step,
    make() {
      const out: Tick[] = [];
      for (let v = Math.ceil(t0 / step) * step; v <= t1; v += step) out.push({ value: v, label: label(v) });
      return out;
    },
  });
  // Steps of whole months, counted from year 0 so that, say, 5-year ticks fall on 2015, 2020.
  const calendar = (months: number, label: (d: Date) => string) => ({
    step: months * 30 * DAY,
    make() {
      const out: Tick[] = [];
      const s = new Date(t0);
      const first =
        s.getUTCFullYear() * 12 + s.getUTCMonth() + (Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), 1) < t0 ? 1 : 0);
      for (let k = Math.ceil(first / months) * months; ; k += months) {
        const v = Date.UTC(Math.floor(k / 12), k % 12, 1);
        if (v > t1) break;
        out.push({ value: v, label: label(new Date(v)) });
      }
      return out;
    },
  });
  const candidates = clock
    ? [5_000, 15_000, 30_000]
        .map((s) => fixed(s, (v) => `${hm(v)}:${pad(new Date(v).getUTCSeconds())}`))
        .concat([1, 2, 5, 10, 15, 30, 60, 120, 180, 360].map((m) => fixed(m * MIN, hm)))
    : [
        ...[1, 2, 3, 6, 12].map((h) => fixed(h * HOUR, hm)),
        ...[1, 2, 7].map((k) =>
          fixed(k * DAY, (v) => `${new Date(v).getUTCDate()} ${MONTHS[new Date(v).getUTCMonth()]}`),
        ),
        calendar(1, (d) => (d.getUTCMonth() ? MONTHS[d.getUTCMonth()] : String(d.getUTCFullYear()))),
        calendar(3, (d) => (d.getUTCMonth() ? MONTHS[d.getUTCMonth()] : String(d.getUTCFullYear()))),
        calendar(6, (d) => (d.getUTCMonth() ? MONTHS[d.getUTCMonth()] : String(d.getUTCFullYear()))),
        ...[1, 2, 5, 10, 20, 50, 100].map((k) => calendar(12 * k, (d) => String(d.getUTCFullYear()))),
      ];
  for (const c of candidates) {
    if ((t1 - t0) / c.step > 2 * most + 2) continue;
    const ticks = c.make();
    if (ticks.length >= 2 && ticks.length <= Math.max(2, most)) return ticks;
  }
  return [];
}
