import type { DatedEvent, Dating, Group, Moment, Node, NodeId, Time, Timeline } from '../model.ts';
import type { DiagramDef, RenderContext, Rendered } from './diagram.ts';
import type { Fence } from '../parse/grammar.ts';
import type { Reporter } from '../diagnostics.ts';
import {
  buildGraph,
  edgeEnds,
  groupDepth,
  header,
  inGroup,
  keepOnly,
  lean,
  nodeParts,
  resolveSteps,
  toNode,
  type DraftNode,
} from '../parse/graph.ts';
import { parseTime } from '../parse/time.ts';
import type { EdgePath } from '../layout/pele/route.ts';
import { trusted } from '../brand.ts';
import {
  edgeItem,
  hatchItems,
  labelItem,
  markerItems,
  measureLabel,
  refMarkers,
  textItems,
  type Anchor,
  type Box,
  type TextLines,
  nodeTargets,
  edgeTargets,
} from './draw.ts';
import { textWidth, wrap } from '../text/measure.ts';
import { arrowhead, HEAD, n } from '../render/svg.ts';
import { attr, type Item, type Scene } from '../scene/scene.ts';
import { paintSvg } from '../scene/svg.ts';
export const TIMELINE: DiagramDef<'timeline'> = {
  type: 'timeline',
  name: 'Timeline',
  build,
  render,
  targets: (d) => nodeParts(d.nodes),
  ends: (d, edge) => edgeEnds(d.edges, edge),
  turnable: (d) => d.direction === undefined && !d.lanes.length,
  withoutMuted(d, pinned) {
    if (d.dating === 'undated') {
      const kept = lean(d, pinned);
      return kept && { ...d, ...kept };
    }
    const kept = lean(d, pinned);
    return kept && { ...d, ...kept };
  },
};

type Dated = DraftNode & { at: Time };

function lanes(fence: Fence, nodes: readonly DraftNode[], { error, warn }: Reporter): Map<NodeId, number> {
  const laneOf = new Map<NodeId, number>();
  if (!fence.lanes.length) return laneOf;
  for (const s of fence.statements) {
    if (s.type === 'loop' || s.lane === undefined) continue;
    if (s.type === 'chain') {
      for (const end of s.ends) if (!laneOf.has(end.node)) laneOf.set(end.node, s.lane);
    } else if (s.type !== 'prop') laneOf.set(s.id, s.lane);
  }
  for (const node of nodes)
    if (!laneOf.has(node.id))
      error(
        node.line,
        `\`${node.id}\` is in no lane, but this timeline has lanes.`,
        `Move its line inside a lane, e.g. \`lane "${fence.lanes[0].label}" {\`. In a timeline with lanes, every event belongs to one.`,
      );
  fence.lanes.forEach((l, i) => {
    if (![...laneOf.values()].includes(i))
      warn(
        l.line,
        `Lane "${l.label}" has no events, so it is not drawn.`,
        'Put its events inside the braces, or delete it.',
      );
  });
  return laneOf;
}
const isDated = (node: DraftNode): node is Dated => node.at !== undefined;

function build(fence: Fence, report: Reporter): Timeline {
  const { error, warn } = report;
  const graph = buildGraph(fence, report, {
    label: (id) => id.replace(/_/g, ' '),
    empty: 'Add an event, e.g. `14:02 deploy: "v2.3 rolls out"`.',
  });
  const top = { ...header(fence, 'timeline'), lanes: fence.lanes.map((l) => ({ ...l })) };
  const laneOf = lanes(fence, graph.nodes, report);
  const laned = <N extends Node>(node: N): N & { lane?: number } => {
    const lane = laneOf.get(node.id);
    return lane === undefined ? node : { ...node, lane };
  };
  if (fence.lanes.length && top.direction === 'down') {
    warn(
      fence.line,
      'A timeline with lanes runs left to right; `direction=down` is ignored.',
      'Delete `direction=down` from the header.',
    );
    delete top.direction;
  }

  const events = [...graph.nodes].sort((a, b) => a.line - b.line);
  for (const node of events)
    if (/^\d{4}(?:-\d{2}){0,2}$/.test(node.id) && !node.at)
      error(
        node.line,
        `\`${node.id}\` looks like a date, so it cannot be an id in a timeline.`,
        `To make it an event, give it an id after the time: \`${node.id} launch: "Label"\`.`,
      );

  const dated = events.filter(isDated);
  const [first] = dated;
  if (!first) {
    for (const e of events)
      if (e.attrs.has('until'))
        error(
          e.line,
          '`until` needs a dated timeline.',
          `Give every event a time, e.g. \`2019 ${e.id}: "${e.label}" {until=2021}\`, or remove \`until\`.`,
        );
    const steps = resolveSteps(fence.steps, graph.nodes, graph.edges, report);
    return {
      ...top,
      dating: 'undated',
      nodes: graph.nodes.map((node) => laned(toNode(node))),
      edges: graph.edges,
      groups: graph.groups,
      steps,
    };
  }

  for (const e of events)
    if (!e.at)
      error(
        e.line,
        `\`${e.id}\` has no time, but other events in this timeline do.`,
        `Give it one, e.g. \`${first.at.text} ${e.id}: "${e.label}"\`. A timeline is either dated or undated throughout.`,
      );
  const dating = datingOf(first.at);
  const odd = dated.find((e) => datingOf(e.at) !== dating);
  const lasting = new Map<Dated, number>();
  if (odd) {
    const kind = (e: Dated) => DATING_NAMES[datingOf(e.at)];
    error(
      odd.line,
      `\`${odd.at.text}\` is a ${kind(odd)}, but \`${first.at.text}\` above is a ${kind(first)}.`,
      'Use one kind throughout: clock times like `14:02`, dates like `2019-03-14` and `2019-03-14T14:02`, or times since the start like `0ms` and `+150ms`.',
    );
  } else {
    const previous = new Map<number | undefined, Dated>();
    for (const e of dated) {
      const prev = previous.get(laneOf.get(e.id));
      if (prev && e.at.value < prev.at.value)
        warn(
          e.line,
          `\`${e.id}\` (${e.at.text}) is earlier than \`${prev.id}\` (${prev.at.text}) above it.`,
          fence.lanes.length
            ? 'Events in a lane are listed in order. Move the line up, or check the time for a typo.'
            : 'Events are listed in order. Move the line up, or check the time for a typo.',
        );
      previous.set(laneOf.get(e.id), e);
      const until = e.attrs.get('until');
      if (until === undefined) continue;
      const t = parseTime(until);
      if ('error' in t)
        error(e.line, `\`until\`: ${t.error}`, `Write it in the same form as the event's time, \`${e.at.text}\`.`);
      else if (t.form !== e.at.form)
        error(
          e.line,
          `\`until=${until}\` is not in the same form as the event's time, \`${e.at.text}\`.`,
          `Write both the same way, e.g. \`${e.at.text} ${e.id}: "${e.label}" {until=${e.at.text}}\` with the end time.`,
        );
      else if (t.value < e.at.value)
        error(
          e.line,
          `\`${e.id}\` ends (${until}) before it starts (${e.at.text}).`,
          'Check the two times; `until` is when the span ends.',
        );
      else lasting.set(e, t.value - e.at.value);
    }
  }

  const steps = resolveSteps(fence.steps, graph.nodes, graph.edges, report);
  const fits = (e: Dated) => datingOf(e.at) === dating;
  const nodes = graph.nodes
    .filter(isDated)
    .filter(fits)
    .map((e): DatedEvent => {
      const event: DatedEvent = { ...laned(toNode(e)), at: e.at };
      const lasts = lasting.get(e);
      if (lasts !== undefined) event.lastsMs = lasts;
      return event;
    });
  const kept = keepOnly({ nodes, edges: graph.edges, groups: graph.groups, steps });
  return { ...top, dating, ...kept };
}

const MARGIN = 16;
const MAX_LABEL = 150;
const PAD_X = 12;
const PAD_Y = 8;
const TIME_FONT = 11.5;
const TIME_H = 15;
const CARD_GAP = 12;
const STEM = 16;

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

interface Card {
  node: Node;
  at: number;
  end?: number;
  time: string;
  text: TextLines;
  w: number;
  h: number;
  box: Box;
  lane: number;
}

interface Band {
  label: string;
  from: number;
  to: number;
  depth: number;
}

function card(node: Node, time: string): Card {
  const text = measureLabel(node.label, node.note, MAX_LABEL);
  const w = Math.ceil(Math.max(text.w, textWidth(time, TIME_FONT, 'sans500')) + 2 * PAD_X);
  const h = Math.ceil(text.h + (time ? TIME_H : 0) + 2 * PAD_Y);
  return { node, at: 0, time, text, w, h, box: { x: 0, y: 0, w, h }, lane: -1 };
}

function render(d: Timeline, context: RenderContext): Rendered {
  if (d.lanes.length) return renderLanes(d, context);
  const { domId } = context;
  const across = (context.direction ?? d.direction ?? 'right') === 'right';

  let events: Card[];
  let length: number;
  let ticks: { at: number; label: string }[] = [];
  if (d.dating !== 'undated' && d.nodes.length) {
    const sorted = [...d.nodes].sort((a, b) => a.at.value - b.at.value || a.line - b.line);
    events = sorted.map((e) => card(e, formatTime(e.at)));
    const t0 = Math.min(...sorted.map((e) => e.at.value));
    const t1 = Math.max(...sorted.map((e) => e.at.value + (e.lastsMs ?? 0)));
    const room = across
      ? events.reduce((s, e) => s + e.w + CARD_GAP, 0) * 1.1
      : events.reduce((s, e) => s + e.h + CARD_GAP, 0);
    length = Math.round(Math.min(across ? 860 : 900, Math.max(across ? 520 : 360, room)));
    const scale = t1 > t0 ? length / (t1 - t0) : 0;
    if (t1 === t0) length = 0;
    sorted.forEach((e, i) => {
      events[i].at = (e.at.value - t0) * scale;
      if (e.lastsMs !== undefined) events[i].end = (e.at.value + e.lastsMs - t0) * scale;
    });
    if (t1 > t0)
      ticks = makeTicks(t0, t1, d.dating, Math.floor(length / (across ? TICK_GAP_ACROSS : TICK_GAP_DOWN))).map((t) => ({
        at: (t.value - t0) * scale,
        label: t.label,
      }));
  } else {
    events = d.nodes.map((node) => card(node, ''));
    const step = across
      ? Math.max(0, ...events.map((e) => e.w)) + CARD_GAP * 2
      : Math.max(0, ...events.map((e) => e.h)) + CARD_GAP;
    events.forEach((e, i) => (e.at = i * step));
    length = Math.max(0, events.length - 1) * step;
  }

  const laneEnds: number[] = [];
  for (const e of events) {
    if (e.end === undefined) continue;
    let lane = laneEnds.findIndex((end) => end + 6 < e.at);
    if (lane < 0) lane = laneEnds.push(0) - 1;
    laneEnds[lane] = e.end;
    e.lane = lane;
  }
  const spanZone = laneEnds.length ? laneEnds.length * SPAN_LANE + 6 : 0;

  const cardH = Math.max(0, ...events.map((e) => e.h));
  let cardLanes = 0;
  if (across) {
    cardLanes = stack(events);
  } else {
    let bottom = -Infinity;
    for (const e of events) {
      const y = Math.max(e.at - e.h / 2, bottom + CARD_GAP);
      e.box = { x: 0, y, w: e.w, h: e.h };
      bottom = y + e.h;
    }
  }

  const byId = new Map(events.map((e) => [e.node.id, e]));
  const arcs = d.edges.flatMap((edge) => {
    const a = byId.get(edge.from);
    const b = byId.get(edge.to);
    return a && b && edge.from !== edge.to ? [{ edge, a: a.at, b: b.at }] : [];
  });
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
    ...arcs.map(({ edge, a, b }) => depth(a, b) + (across ? labelBox(edge.label)[1] : labelBox(edge.label)[0]) / 2 + 4),
  );

  const bands = groupBands(d.groups, events);
  const groupRoom = bands.length ? GROUP_TITLE + Math.max(0, ...d.groups.map((g) => groupDepth(d.groups, g))) * 16 : 0;

  const near = spanZone + STEM;
  let width: number;
  let height: number;
  let origin: number;
  let axis: number;
  if (across) {
    const left = Math.min(0, ...events.map((e) => e.box.x), ...bands.map((b) => b.from));
    const right = Math.max(length + 14, ...events.map((e) => e.box.x + e.box.w), ...bands.map((b) => b.to));
    origin = MARGIN - left;
    axis = MARGIN + groupRoom + cardLanes * (cardH + CARD_GAP) - CARD_GAP + near;
    for (const e of events)
      e.box = { x: origin + e.box.x, y: axis - near - e.box.y * (cardH + CARD_GAP) - e.h, w: e.w, h: e.h };
    width = Math.ceil(origin + right + MARGIN);
    height = Math.ceil(axis + far + MARGIN);
  } else {
    const top = Math.min(0, ...events.map((e) => e.box.y), ...bands.map((b) => b.from));
    const bottom = Math.max(length + 14, ...events.map((e) => e.box.y + e.box.h), ...bands.map((b) => b.to));
    origin = MARGIN - top;
    axis = MARGIN + far;
    const cardsAt = axis + near;
    const cardW = Math.max(0, ...events.map((e) => e.w));
    for (const e of events) e.box = { x: cardsAt, y: origin + e.box.y, w: e.w, h: e.h };
    const titles = Math.max(0, ...bands.map((b) => textWidth(b.label.toUpperCase(), 10.5, 'sans600') * 1.18 + 28));
    width = Math.ceil(cardsAt + cardW + Math.max(MARGIN, titles + 8));
    height = Math.ceil(origin + bottom + MARGIN);
  }
  const pt = (at: number, off: number): [number, number] =>
    across ? [origin + at, axis - off] : [axis + off, origin + at];

  const bandItems = bands.map((b): Item => {
    if (across) {
      const y = MARGIN + b.depth * 16;
      return {
        type: 'group',
        cls: 'pr-group pr-band',
        items: [
          { type: 'rect', x: origin + b.from, y, w: b.to - b.from, h: axis + 10 - y, r: 8 },
          { type: 'text', x: origin + b.from + 10, y: y + 17, text: b.label },
        ],
      };
    }
    const x = MARGIN + b.depth * 8;
    return {
      type: 'group',
      cls: 'pr-group pr-band',
      items: [
        { type: 'rect', x, y: origin + b.from, w: width - MARGIN - x, h: b.to - b.from, r: 8 },
        { type: 'text', cls: 'pr-band-end', x: width - MARGIN - 10, y: origin + b.from + 17, text: b.label },
      ],
    };
  });

  const [ax0, ay0] = pt(-8, 0);
  const [ax1, ay1] = pt(length + 14, 0);
  const ends = arcs.flatMap(({ a, b }) => [a, b]);
  const tickItems = ticks.flatMap((t): Item[] => {
    const [x, y] = pt(t.at, 0);
    const mark: Item = { type: 'path', cls: 'pr-tick', d: across ? `M${n(x)},${n(y)}v4` : `M${n(x)},${n(y)}h-4` };
    if (ends.some((at) => Math.abs(at - t.at) < (across ? 24 : 10))) return [mark];
    const label: Item = across
      ? { type: 'text', cls: 'pr-tick-label', x, y: y + 17, text: t.label }
      : { type: 'text', cls: 'pr-tick-label pr-tick-down', x: x - 9, y, text: t.label, dy: '0.35em' };
    return [mark, label];
  });
  const axisItem: Item = {
    type: 'group',
    cls: 'pr-axis',
    items: [
      { type: 'path', cls: 'pr-axis-line', d: `M${n(ax0)},${n(ay0)}L${n(ax1)},${n(ay1)}` },
      { type: 'path', cls: 'pr-axis-head', d: arrowhead(ax1, ay1, ax1 - ax0, ay1 - ay0) },
      ...tickItems,
    ],
  };

  const edges: Item[] = [];
  const labels: Item[] = [];
  const anchors = new Map<number, Anchor>();
  for (const { edge: e, a, b } of arcs) {
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
    edges.push(
      edgeItem(
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
      labels.push(labelItem(e, lx, ly, 0));
      anchors.set(e.index, { x: lx - lw / 2 - 4, y: ly, w: lw + 8 });
    } else anchors.set(e.index, { x: mx, y: my });
  }

  const eventItems = events.map((e) => {
    const b = e.box;
    const [dx, dy] = pt(e.at, 0);
    const [cx, cy] = across ? [dx, b.y + b.h] : [b.x, Math.min(Math.max(dy, b.y + 10), b.y + b.h - 10)];
    const stem = `M${n(dx)},${n(dy)}${across ? `V${n(cy)}` : `L${n(cx - 6)},${n(cy)}H${n(cx)}`}`;
    return eventItem(e, domId, dx, dy, stem, spanItems(e, pt, across));
  });

  const scene: Scene = {
    id: domId,
    cls: 'pr-timeline',
    width,
    height,
    hatch: true,
    items: [
      ...bandItems,
      axisItem,
      ...edges,
      ...eventItems,
      ...labels,
      ...markerItems(
        d,
        new Map(events.map((e) => [e.node.id, e.box])),
        anchors,
        refMarkers(context, [...nodeTargets(d.nodes), ...edgeTargets(d.edges)]),
      ),
    ],
  };
  return { svg: trusted(paintSvg(scene)), width, height, scene };
}

function stack(events: readonly Card[]): number {
  const covers = (c: Card, at: number) => at > c.box.x - 6 && at < c.box.x + c.w + 6;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    e.box = { x: e.at - FLAG, y: 0, w: e.w, h: e.h };
    const later = events.slice(i + 1);
    let lane = Math.max(0, ...later.filter((o) => covers(e, o.at)).map((o) => o.box.y + 1));
    const below = Math.min(Infinity, ...later.filter((o) => covers(o, e.at)).map((o) => o.box.y));
    const clash = (k: number) =>
      later.some((o) => o.box.y === k && o.box.x < e.box.x + e.w + CARD_GAP && e.box.x < o.box.x + o.w + CARD_GAP);
    while (clash(lane)) lane++;
    if (lane >= below) for (const o of later) if (covers(o, e.at) && o.box.y <= lane) o.box.y = lane + 1;
    e.box.y = lane;
  }
  return Math.max(0, ...events.map((e) => e.box.y + 1));
}

function spanLanes(events: readonly Card[]): number {
  const ends: number[] = [];
  for (const e of events) {
    if (e.end === undefined) continue;
    let lane = ends.findIndex((end) => end + 6 < e.at);
    if (lane < 0) lane = ends.push(0) - 1;
    ends[lane] = e.end;
    e.lane = lane;
  }
  return ends.length;
}

const LANE_GAP = 26;
const LANE_FONT = 12.5;
const UNDATED_STEP = 96;

function renderLanes(d: Timeline, context: RenderContext): Rendered {
  const { domId } = context;
  const laneOf = new Map(d.nodes.map((node) => [node.id, node.lane]));
  const used = d.lanes.flatMap((lane, i) => (d.nodes.some((node) => node.lane === i) ? [{ lane, i }] : []));

  let cards: Card[];
  let length: number;
  let ticks: { at: number; label: string }[] = [];
  if (d.dating !== 'undated' && d.nodes.length) {
    const sorted = [...d.nodes].sort((a, b) => a.at.value - b.at.value || a.line - b.line);
    cards = sorted.map((e) => card(e, formatTime(e.at)));
    const t0 = Math.min(...sorted.map((e) => e.at.value));
    const t1 = Math.max(...sorted.map((e) => e.at.value + (e.lastsMs ?? 0)));
    const room = Math.max(
      0,
      ...used.map(({ i }) => cards.filter((c) => laneOf.get(c.node.id) === i).reduce((s, c) => s + c.w + CARD_GAP, 0)),
    );
    length = Math.round(Math.min(860, Math.max(520, room * 1.1)));
    const scale = t1 > t0 ? length / (t1 - t0) : 0;
    if (t1 === t0) length = 0;
    sorted.forEach((e, k) => {
      cards[k].at = (e.at.value - t0) * scale;
      if (e.lastsMs !== undefined) cards[k].end = (e.at.value + e.lastsMs - t0) * scale;
    });
    if (t1 > t0)
      ticks = makeTicks(t0, t1, d.dating, Math.floor(length / TICK_GAP_ACROSS)).map((t) => ({
        at: (t.value - t0) * scale,
        label: t.label,
      }));
  } else {
    cards = causalOrder(d).map((node) => card(node, ''));
    cards.forEach((c, k) => (c.at = k * UNDATED_STEP));
    length = Math.max(0, cards.length - 1) * UNDATED_STEP;
  }

  const byId = new Map(cards.map((c) => [c.node.id, c]));
  const sameLane = d.edges.filter((e) => e.from !== e.to && laneOf.get(e.from) === laneOf.get(e.to));
  const arcDepth = (a: number, b: number): number => Math.min(44, 22 + Math.abs(b - a) * 0.12);
  const labelH = (label?: string): number => (label ? wrap(label, LABEL_FONT, 150).length * LABEL_LINE + 4 : 0);

  const labelW = Math.max(0, ...used.map(({ lane }) => textWidth(lane.label, LANE_FONT, 'sans600'))) + 28;
  const bandsAll = groupBands(d.groups, cards);
  const groupRoom = bandsAll.length ? GROUP_TITLE : 0;
  const left = Math.min(0, ...cards.map((c) => c.at - FLAG), ...bandsAll.map((b) => b.from));
  const origin = MARGIN + labelW - left;
  const cardH = Math.max(0, ...cards.map((c) => c.h));

  let y = MARGIN + groupRoom;
  const rows = used.map(({ lane, i }) => {
    const mine = cards.filter((c) => laneOf.get(c.node.id) === i);
    const spans = spanLanes(mine);
    const levels = stack(mine);
    const near = (spans ? spans * SPAN_LANE + 6 : 0) + STEM;
    const line = y + levels * (cardH + CARD_GAP) - CARD_GAP + near;
    for (const c of mine)
      c.box = { x: origin + c.box.x, y: line - near - c.box.y * (cardH + CARD_GAP) - c.h, w: c.w, h: c.h };
    const below = Math.max(
      0,
      ...sameLane
        .filter((e) => laneOf.get(e.from) === i)
        .map((e) => {
          const a = byId.get(e.from);
          const b = byId.get(e.to);
          return a && b ? arcDepth(a.at, b.at) + labelH(e.label) / 2 + 4 : 0;
        }),
    );
    const top = y;
    y = line + Math.max(LANE_GAP, below + 12);
    return { lane, i, line, top, mine };
  });
  const lineOf = new Map(rows.map((r) => [r.i, r.line]));
  const lastLine = rows.at(-1)?.line ?? y;
  const bottom = rows.length ? y - Math.max(LANE_GAP, 0) : y;
  const tickY = Math.max(lastLine + 22, bottom);
  const right = Math.max(length + 14, ...cards.map((c) => c.box.x + c.w - origin), ...bandsAll.map((b) => b.to));
  const width = Math.ceil(origin + right + MARGIN);
  const height = Math.ceil(tickY + (ticks.length ? 14 : 0) + MARGIN);

  const bandItems = bandsAll.map((b): Item => {
    const top = MARGIN + b.depth * 16;
    return {
      type: 'group',
      cls: 'pr-group pr-band',
      items: [
        { type: 'rect', x: origin + b.from, y: top, w: b.to - b.from, h: lastLine + 10 - top, r: 8 },
        { type: 'text', x: origin + b.from + 10, y: top + 17, text: b.label },
      ],
    };
  });
  const firstTop = rows[0]?.top ?? MARGIN;
  const tickItems = ticks.flatMap((t): Item[] => [
    { type: 'path', cls: 'pr-grid', d: `M${n(origin + t.at)},${n(firstTop)}V${n(lastLine)}` },
    { type: 'text', cls: 'pr-tick-label', x: origin + t.at, y: tickY, text: t.label },
  ]);
  const laneItems = rows.map((r): Item => {
    const x0 = origin - 8;
    const x1 = origin + length + 14;
    return {
      type: 'group',
      cls: 'pr-lane',
      items: [
        { type: 'text', cls: 'pr-lane-label', x: MARGIN, y: r.line, text: r.lane.label, dy: '0.35em' },
        { type: 'path', cls: 'pr-axis-line', d: `M${n(x0)},${n(r.line)}H${n(x1)}` },
      ],
    };
  });

  const labels: Item[] = [];
  const taken: Box[] = [];
  const anchors = new Map<number, Anchor>();
  const dot = (c: Card): [number, number] => [origin + c.at, lineOf.get(laneOf.get(c.node.id) ?? -1) ?? 0];
  const edges: Item[] = [];
  for (const e of d.edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b || a === b) continue;
    const [ax, ay] = dot(a);
    const [bx, by] = dot(b);
    const both = e.arrow === '<->';
    const gap = DOT + 2;
    let path: EdgePath;
    let mid: [number, number];
    if (ay === by) {
      const k = arcDepth(a.at, b.at);
      const sy = ay + gap;
      const ey = by + gap + HEAD - 1;
      path = {
        d: `M${n(ax)},${n(both ? ey : sy)}C${n(ax)},${n(ay + k * 1.33)} ${n(bx)},${n(by + k * 1.33)} ${n(bx)},${n(ey)}`,
        sx: ax,
        sy,
        sdx: 0,
        sdy: -1,
        ex: bx,
        ey: by + gap,
        edx: 0,
        edy: -1,
      };
      mid = [(ax + bx) / 2, ay + k + labelH(e.label) / 2 - 2];
    } else {
      const dir = Math.sign(by - ay);
      const sy = ay + dir * gap;
      const ey = by - dir * (gap + HEAD - 1);
      const my = (ay + by) / 2;
      path = {
        d: `M${n(ax)},${n(both ? ay + dir * (gap + HEAD - 1) : sy)}C${n(ax)},${n(my)} ${n(bx)},${n(my)} ${n(bx)},${n(ey)}`,
        sx: ax,
        sy,
        sdx: 0,
        sdy: -dir,
        ex: bx,
        ey: by - dir * gap,
        edx: 0,
        edy: dir,
      };
      mid = [(ax + bx) / 2, my];
    }
    edges.push(edgeItem(e, path, both));
    if (e.label) {
      const lw = Math.max(...wrap(e.label, LABEL_FONT, 150).map((l) => textWidth(l, LABEL_FONT)));
      const lh = labelH(e.label);
      const free = (x: number, y: number): boolean =>
        [...cards.map((c) => c.box), ...taken].every(
          (b) => x + lw / 2 + 4 < b.x || x - lw / 2 - 4 > b.x + b.w || y + lh / 2 < b.y || y - lh / 2 > b.y + b.h,
        );
      const along = ay === by ? [0.5] : [0.5, 0.35, 0.65, 0.2, 0.8];
      const spot = along.map((t) => (ay === by ? mid : bezier(ax, ay, bx, by, t))).find(([x, y]) => free(x, y));
      if (spot) mid = spot;
      taken.push({ x: mid[0] - lw / 2 - 4, y: mid[1] - lh / 2, w: lw + 8, h: lh });
      labels.push(labelItem(e, mid[0], mid[1], 0));
      anchors.set(e.index, { x: mid[0] - lw / 2 - 8, y: mid[1], w: lw + 16 });
    } else anchors.set(e.index, { x: mid[0], y: mid[1] });
  }

  const eventItems = rows.flatMap((r) =>
    r.mine.map((c) => {
      const b = c.box;
      const [dx, dy] = dot(c);
      const span: Item[] =
        c.end === undefined
          ? []
          : [
              {
                type: 'rect',
                cls: 'pr-span',
                x: dx,
                y: dy - 6 - c.lane * SPAN_LANE - SPAN_H,
                w: Math.max(SPAN_H, c.end - c.at),
                h: SPAN_H,
                r: SPAN_H / 2,
              },
            ];
      return eventItem(c, domId, dx, dy, `M${n(dx)},${n(dy)}V${n(b.y + b.h)}`, span);
    }),
  );

  const scene: Scene = {
    id: domId,
    cls: 'pr-timeline pr-lanes',
    width,
    height,
    hatch: true,
    items: [
      ...bandItems,
      ...tickItems,
      ...laneItems,
      ...edges,
      ...eventItems,
      ...labels,
      ...markerItems(
        d,
        new Map(cards.map((c) => [c.node.id, c.box])),
        anchors,
        refMarkers(context, [...nodeTargets(d.nodes), ...edgeTargets(d.edges)]),
      ),
    ],
  };
  return { svg: trusted(paintSvg(scene)), width, height, scene };
}

function bezier(ax: number, ay: number, bx: number, by: number, t: number): [number, number] {
  const my = (ay + by) / 2;
  const u = 1 - t;
  const x = u * u * u * ax + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * bx;
  const y = u * u * u * ay + 3 * u * u * t * my + 3 * u * t * t * my + t * t * t * by;
  return [x, y];
}

export function causalOrder(d: Timeline): Moment[] {
  const nodes = [...d.nodes].sort((a, b) => a.line - b.line);
  const before = new Map<NodeId, NodeId[]>(nodes.map((node) => [node.id, []]));
  const lastIn = new Map<number | undefined, NodeId>();
  for (const node of nodes) {
    const prev = lastIn.get(node.lane);
    if (prev !== undefined) before.get(node.id)?.push(prev);
    lastIn.set(node.lane, node.id);
  }
  for (const e of d.edges) if (e.from !== e.to) before.get(e.to)?.push(e.from);
  const placed = new Set<NodeId>();
  const out: Moment[] = [];
  while (out.length < nodes.length) {
    const next =
      nodes.find((node) => !placed.has(node.id) && (before.get(node.id) ?? []).every((id) => placed.has(id))) ??
      nodes.find((node) => !placed.has(node.id));
    if (!next) break;
    placed.add(next.id);
    out.push(next);
  }
  return out;
}

function eventItem(e: Card, domId: string, dx: number, dy: number, stem: string, span: Item[]): Item {
  const node = e.node;
  const b = e.box;
  let top = b.y + PAD_Y;
  const when: Item[] = e.time
    ? [{ type: 'text', cls: 'pr-when', x: b.x + PAD_X, y: top + TIME_H / 2 - 1, text: e.time, dy: '0.35em' }]
    : [];
  if (e.time) top += TIME_H;
  return {
    type: 'group',
    cls: `pr-node pr-event${e.end !== undefined ? ' pr-lasting' : ''}`,
    attrs: [['data-node', node.id], ['id', `${domId}-node-${node.id}`], ...attr('data-role', node.role)],
    items: [
      { type: 'path', cls: 'pr-stem', d: stem },
      ...span,
      { type: 'circle', cls: 'pr-event-dot', cx: dx, cy: dy, r: DOT },
      { type: 'rect', cls: 'pr-box', x: b.x, y: b.y, w: b.w, h: b.h, r: 8 },
      ...hatchItems(node, b, 8),
      ...when,
      ...textItems(e.text, b.x + PAD_X, top + e.text.h / 2, 'start'),
    ],
  };
}

function spanItems(e: Card, pt: (at: number, off: number) => [number, number], across: boolean): Item[] {
  if (e.end === undefined) return [];
  const off = 6 + e.lane * SPAN_LANE + SPAN_H / 2;
  const [sx, sy] = pt(e.at, off);
  const [ex, ey] = pt(e.end, off);
  if (across)
    return [
      {
        type: 'rect',
        cls: 'pr-span',
        x: sx,
        y: sy - SPAN_H / 2,
        w: Math.max(SPAN_H, ex - sx),
        h: SPAN_H,
        r: SPAN_H / 2,
      },
    ];
  return [
    { type: 'rect', cls: 'pr-span', x: sx - SPAN_H / 2, y: sy, w: SPAN_H, h: Math.max(SPAN_H, ey - sy), r: SPAN_H / 2 },
  ];
}

function groupBands(groups: readonly Group[], events: readonly Card[]): Band[] {
  return groups.flatMap((g, i) => {
    const members = events.filter((e) => inGroup(groups, e.node.group, i));
    if (!members.length) return [];
    const depth = groupDepth(groups, g);
    const from = Math.min(...members.map((e) => e.at));
    const to = Math.max(...members.map((e) => e.end ?? e.at));
    return [{ label: g.label, from: from - GROUP_PAD + depth * 4, to: to + GROUP_PAD - depth * 4, depth }];
  });
}

export function formatTime(t: Time): string {
  if (t.form === 'clock') return t.text.replace(/^(\d):/, '0$1:');
  if (t.form === 'elapsed') return formatElapsed(t.value);
  const date = new Date(t.value);
  const y = date.getUTCFullYear();
  const mon = MONTHS[date.getUTCMonth()];
  const day = date.getUTCDate();
  switch (t.form) {
    case 'year':
      return String(y);
    case 'month':
      return `${mon} ${y}`;
    case 'day':
      return `${day} ${mon} ${y}`;
    case 'datetime':
      return `${day} ${mon} ${y}, ${t.text.slice(11)}`;
    default:
      return t.form satisfies never;
  }
}

const DATING_NAMES: Record<Dating, string> = {
  clock: 'clock time',
  calendar: 'date',
  elapsed: 'time since the start',
};

function datingOf(t: Time): Dating {
  if (t.form === 'clock') return 'clock';
  return t.form === 'elapsed' ? 'elapsed' : 'calendar';
}

const ELAPSED_UNITS: [number, string][] = [
  [86_400_000, 'd'],
  [3_600_000, 'h'],
  [60_000, 'min'],
  [1000, 's'],
  [1, 'ms'],
];

function formatElapsed(ms: number): string {
  if (ms === 0) return '0 ms';
  const [size, unit] = ELAPSED_UNITS.find(([u]) => ms >= u) ?? [1, 'ms'];
  return `+${Math.round((ms / size) * 100) / 100} ${unit}`;
}

function elapsedTicks(t0: number, t1: number, most: number): { value: number; label: string }[] {
  const count = Math.max(2, most);
  const p = 10 ** Math.floor(Math.log10((t1 - t0) / count));
  const step = [1, 2, 5, 10].map((k) => k * p).find((s) => (t1 - t0) / s <= count) ?? 10 * p;
  const out: { value: number; label: string }[] = [];
  for (let v = Math.ceil(t0 / step) * step; v <= t1; v += step) out.push({ value: v, label: formatElapsed(v) });
  return out.length >= 2 ? out : [];
}

function makeTicks(t0: number, t1: number, dating: Dating, most: number): { value: number; label: string }[] {
  if (dating === 'elapsed') return elapsedTicks(t0, t1, most);
  const clock = dating === 'clock';
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const pad = (v: number) => String(v).padStart(2, '0');
  const hm = (v: number) => {
    const d = new Date(v);
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  };
  type Tick = { value: number; label: string };
  const fixed = (step: number, label: (v: number) => string) => ({
    step,
    make() {
      const out: Tick[] = [];
      for (let v = Math.ceil(t0 / step) * step; v <= t1; v += step) out.push({ value: v, label: label(v) });
      return out;
    },
  });
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
  const monthOrYear = (d: Date) => (d.getUTCMonth() ? MONTHS[d.getUTCMonth()] : String(d.getUTCFullYear()));
  const candidates = clock
    ? [5_000, 15_000, 30_000]
        .map((s) => fixed(s, (v) => `${hm(v)}:${pad(new Date(v).getUTCSeconds())}`))
        .concat([1, 2, 5, 10, 15, 30, 60, 120, 180, 360].map((m) => fixed(m * MIN, hm)))
    : [
        ...[1, 2, 3, 6, 12].map((h) => fixed(h * HOUR, hm)),
        ...[1, 2, 7].map((k) =>
          fixed(k * DAY, (v) => `${new Date(v).getUTCDate()} ${MONTHS[new Date(v).getUTCMonth()]}`),
        ),
        calendar(1, monthOrYear),
        calendar(3, monthOrYear),
        calendar(6, monthOrYear),
        ...[1, 2, 5, 10, 20, 50, 100].map((k) => calendar(12 * k, (d) => String(d.getUTCFullYear()))),
      ];
  for (const c of candidates) {
    if ((t1 - t0) / c.step > 2 * most + 2) continue;
    const ticks = c.make();
    if (ticks.length >= 2 && ticks.length <= Math.max(2, most)) return ticks;
  }
  return [];
}
