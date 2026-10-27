// Lays out and draws a causal-loop diagram: variables joined by curved, signed links, with
// each named feedback loop marked at its centre by a circular arrow and its R or B number.
//
// A layered layout would rank the variables and turn every loop into a back edge, so this
// type has its own: a small deterministic force layout, seeded on a circle in loop order.
// Links curve so that loops read as loops: a two-variable loop draws as a lens, and the
// links of a longer loop bow outward from its centre.
import type { Diagram, DiagramEdge } from '../model.ts';
import { drawText, edgeSvg, markers, measureText, type Box } from './graph.ts';
import { arrowhead, esc, HEAD, n, roleAttr, type Rendered } from '../render/svg.ts';
import { textWidth } from '../text/measure.ts';

const MARGIN = 20;
const PAD_X = 14;
const PAD_Y = 8;
const MAX_LABEL = 130;
// The length the layout aims for between linked variables.
const LINK = 200;
const ITERATIONS = 400;
const LOOP_R = 12;
// How far a loop's variables keep from its centre.
const LOOP_ROOM = 110;

interface P {
  x: number;
  y: number;
}

export function renderCausalLoop(d: Diagram, refMarkers: Map<string, string>, domId: string): Rendered {
  const texts = d.nodes.map((node) => measureText(node, MAX_LABEL));
  const size = texts.map((t) => ({ w: Math.ceil(t.w + 2 * PAD_X), h: Math.ceil(t.h + 2 * PAD_Y) }));
  const pos = layout(d, size);
  const at = new Map(d.nodes.map((node, i) => [node.id, i]));

  // Normalise into the frame, leaving room for loop marks and curved links.
  const minX = Math.min(...pos.map((p, i) => p.x - size[i].w / 2));
  const minY = Math.min(...pos.map((p, i) => p.y - size[i].h / 2));
  const pad = MARGIN + 34;
  for (const p of pos) {
    p.x += pad - minX;
    p.y += pad - minY;
  }
  const boxes = new Map<string, Box>(d.nodes.map((node, i) => [node.id, { x: pos[i].x - size[i].w / 2, y: pos[i].y - size[i].h / 2, w: size[i].w, h: size[i].h }]));

  const centre = mean(pos);
  const loopCentre = d.loops.map((l) => mean(l.nodes.map((id) => pos[at.get(id)!])));
  const twoWay = (e: DiagramEdge) => d.edges.some((o) => o.from === e.to && o.to === e.from);

  // Each link bends to one side: two-way pairs to their left, so the pair forms a lens; a
  // link in a longer loop away from that loop's centre; any other away from the middle.
  const out: string[] = [];
  const marks: string[] = [];
  const anchors = new Map<number, { x: number; y: number }>();
  const extent = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const grow = (x: number, y: number, r = 0) => {
    extent.x0 = Math.min(extent.x0, x - r);
    extent.y0 = Math.min(extent.y0, y - r);
    extent.x1 = Math.max(extent.x1, x + r);
    extent.y1 = Math.max(extent.y1, y + r);
  };
  const edgeSvgs: string[] = [];
  // Points along every link and beside every sign, which loop marks must keep clear of.
  const obstacles: P[] = [];
  for (const e of d.edges) {
    const a = pos[at.get(e.from)!];
    const b = pos[at.get(e.to)!];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const left = { x: dy / len, y: -dx / len };
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    let side: number;
    let bow: number;
    if (twoWay(e)) {
      side = 1;
      // A lens bulges enough to hold its loop's mark, and no more however far apart its ends.
      bow = Math.min(0.62, 130 / len);
    } else {
      const k = d.loops.findIndex((l) => l.nodes.length > 2 && l.edges.includes(e.index));
      const from = k >= 0 ? loopCentre[k] : centre;
      const away = (mid.x - from.x) * left.x + (mid.y - from.y) * left.y;
      side = away >= 0 ? 1 : -1;
      bow = k >= 0 ? 0.3 : 0.16;
    }
    const c = { x: mid.x + left.x * side * bow * len, y: mid.y + left.y * side * bow * len };
    const s = toBoundary(a, c, boxes.get(e.from)!, 3);
    const tip = toBoundary(b, c, boxes.get(e.to)!, 3);
    const tx = tip.x - c.x;
    const ty = tip.y - c.y;
    const tl = Math.hypot(tx, ty) || 1;
    const end = { x: tip.x - (tx / tl) * (HEAD - 1), y: tip.y - (ty / tl) * (HEAD - 1) };
    const path = `M${n(s.x)},${n(s.y)}Q${n(c.x)},${n(c.y)} ${n(end.x)},${n(end.y)}`;
    grow(c.x, c.y);

    // The polarity sits by the arrowhead, on the outside of the curve.
    const q = (t: number): P => ({ x: (1 - t) * (1 - t) * s.x + 2 * t * (1 - t) * c.x + t * t * tip.x, y: (1 - t) * (1 - t) * s.y + 2 * t * (1 - t) * c.y + t * t * tip.y });
    const near = q(0.8);
    const sign = { x: near.x + left.x * side * 12, y: near.y + left.y * side * 12 };
    grow(sign.x, sign.y, 8);
    for (let t = 0; t <= 1; t += 0.04) obstacles.push(q(t));
    obstacles.push(sign);
    let extra = '';
    if (e.attrs.delay === 'yes') {
      // The standard delay mark: two short bars across the middle of the link.
      const m = q(0.5);
      const ux = (tip.x - s.x) / (Math.hypot(tip.x - s.x, tip.y - s.y) || 1);
      const uy = (tip.y - s.y) / (Math.hypot(tip.x - s.x, tip.y - s.y) || 1);
      const bar = (o: number) => `M${n(m.x + ux * o - uy * 7)},${n(m.y + uy * o + ux * 7)}L${n(m.x + ux * o + uy * 7)},${n(m.y + uy * o - ux * 7)}`;
      extra = `<path class="pr-delay" d="${bar(-2.5)}${bar(2.5)}"/>`;
    }
    const svg = edgeSvg(e, { d: path, sx: s.x, sy: s.y, sdx: s.x - c.x, sdy: s.y - c.y, ex: tip.x, ey: tip.y, edx: tx, edy: ty }, false);
    edgeSvgs.push(extra ? svg.replace(/<\/g>$/, `${extra}</g>`) : svg);
    marks.push(`<g class="pr-edge-label pr-polarity-mark" data-edge="${e.index}"${roleAttr(e.role)}><text class="pr-polarity" x="${n(sign.x)}" y="${n(sign.y)}" dy="0.35em">${e.label === '-' ? '−' : '+'}</text></g>`);
    anchors.set(e.index, { x: q(0.5).x, y: q(0.5).y });
  }

  // Loop marks: a circular arrow turning the way the loop runs, its number inside, its name
  // below. Each goes where it has the most room near the loop's centre, clear of links,
  // variables and the marks already placed.
  const taken: Box[] = [...boxes.values()];
  const loopSvgs = d.loops.map((l, k) => {
    const pts = l.nodes.map((id) => pos[at.get(id)!]);
    const nameW = textWidth(l.name, 11) + 6;
    const mw = Math.max(2 * LOOP_R + 6, nameW);
    const mh = 2 * LOOP_R + 20;
    let best = { score: -Infinity, p: loopCentre[k] };
    for (let dx = -84; dx <= 84; dx += 6) {
      for (let dy = -84; dy <= 84; dy += 6) {
        if (dx * dx + dy * dy > 84 * 84) continue;
        const c = { x: loopCentre[k].x + dx, y: loopCentre[k].y + dy };
        const box = { x: c.x - mw / 2, y: c.y - LOOP_R - 3, w: mw, h: mh };
        let room = Math.min(...obstacles.map((o) => distToBox(o, box)), ...taken.map((b) => gapBetween(b, box)));
        room = Math.min(room, 24);
        const inside = pts.length < 3 || insidePolygon(c, pts) ? 0 : 10;
        const score = room - Math.hypot(dx, dy) * 0.08 - inside;
        if (score > best.score) best = { score, p: c };
      }
    }
    const p = best.p;
    taken.push({ x: p.x - mw / 2, y: p.y - LOOP_R - 3, w: mw, h: mh });
    // Two-variable loops draw as a lens that runs clockwise; longer ones run as their nodes do.
    const clockwise = pts.length === 2 ? true : signedArea(pts) > 0;
    const a0 = -Math.PI / 2 + 0.5;
    const a1 = a0 + Math.PI * 1.6;
    const px = (a: number) => p.x + LOOP_R * Math.cos(clockwise ? a : Math.PI - a);
    const py = (a: number) => p.y + LOOP_R * Math.sin(clockwise ? a : Math.PI - a);
    const sweep = clockwise ? 1 : 0;
    const tdx = clockwise ? -Math.sin(a1) : Math.sin(a1);
    const tdy = Math.cos(a1);
    grow(p.x - mw / 2, p.y - LOOP_R - 3);
    grow(p.x + mw / 2, p.y - LOOP_R - 3 + mh);
    return `<g class="pr-loop" data-loop="${esc(l.label)}" data-kind="${l.kind}"><path class="pr-loop-arc" d="M${n(px(a0))},${n(py(a0))}A${LOOP_R},${LOOP_R} 0 1 ${sweep} ${n(px(a1))},${n(py(a1))}"/><path class="pr-loop-head" d="${arrowhead(px(a1) + tdx * 3, py(a1) + tdy * 3, tdx, tdy)}"/><text class="pr-loop-label" x="${n(p.x)}" y="${n(p.y)}" dy="0.35em">${esc(l.label)}</text><text class="pr-loop-name" x="${n(p.x)}" y="${n(p.y + LOOP_R + 14)}">${esc(l.name)}</text></g>`;
  });

  const nodeSvgs = d.nodes.map((node, i) => {
    const b = boxes.get(node.id)!;
    grow(b.x, b.y);
    grow(b.x + b.w, b.y + b.h);
    const attrs = ` data-node="${esc(node.id)}" id="${domId}-node-${esc(node.id)}"${roleAttr(node.role)}`;
    let body = `<rect class="pr-box pr-variable" x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="${n(Math.min(b.h / 2, 14))}"/>`;
    if (node.role === 'error') body += `<rect class="pr-hatch-fill" x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="${n(Math.min(b.h / 2, 14))}" fill="url(#${domId}-hatch)"/>`;
    body += drawText(texts[i], b.x + b.w / 2, b.y + b.h / 2);
    return `<g class="pr-node"${attrs}>${body}</g>`;
  });

  // Shift so the drawing starts at the margin.
  const sx = MARGIN - extent.x0;
  const sy = MARGIN - extent.y0;
  const width = Math.ceil(extent.x1 - extent.x0 + 2 * MARGIN);
  const height = Math.ceil(extent.y1 - extent.y0 + 2 * MARGIN);
  out.push(`<svg class="pr-svg pr-causal-loop" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">`);
  out.push(`<defs><pattern id="${domId}-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" class="pr-hatch"/></pattern></defs>`);
  out.push(`<g transform="translate(${n(sx)},${n(sy)})">`);
  out.push(...loopSvgs, ...edgeSvgs, ...nodeSvgs, ...marks);
  out.push(...markers(d, boxes, anchors, refMarkers));
  out.push('</g></svg>');
  return { svg: out.join(''), width, height };
}

// Force-directed placement: linked variables pull towards LINK apart, all variables push
// apart, and boxes never overlap. Each named loop also inflates: its variables are pushed
// out to at least LOOP_ROOM from its centre, and other variables are kept out of the
// middle, so every loop stays open around room for its mark. Seeded on a circle in loop
// order, so the result is the same every time and loops start out round.
function layout(d: Diagram, size: { w: number; h: number }[]): P[] {
  const count = d.nodes.length;
  if (!count) return [];
  const index = new Map(d.nodes.map((node, i) => [node.id, i]));
  const order: number[] = [];
  for (const l of d.loops) for (const id of l.nodes) if (!order.includes(index.get(id)!)) order.push(index.get(id)!);
  d.nodes.forEach((_, i) => order.includes(i) || order.push(i));
  const radius = Math.max(LINK * 0.6, (LINK * count) / (2 * Math.PI));
  const pos: P[] = new Array(count);
  order.forEach((i, k) => {
    const a = Math.PI + (2 * Math.PI * k) / count;
    pos[i] = { x: radius * Math.cos(a), y: radius * Math.sin(a) };
  });
  const links = new Set<string>();
  for (const e of d.edges) links.add([index.get(e.from)!, index.get(e.to)!].sort((a, b) => a - b).join(','));
  const pairs = [...links].map((k) => k.split(',').map(Number));
  const loops = d.loops.map((l) => l.nodes.map((id) => index.get(id)!));

  for (let it = 0; it < ITERATIONS; it++) {
    const heat = (LINK / 4) * (1 - it / ITERATIONS) + 0.5;
    const force = pos.map(() => ({ x: 0, y: 0 }));
    const push = (i: number, from: P, f: number) => {
      const dx = pos[i].x - from.x;
      const dy = pos[i].y - from.y;
      const dist = Math.hypot(dx, dy) || 0.01;
      force[i].x += (dx / dist) * f;
      force[i].y += (dy / dist) * f;
    };
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const dx = pos[j].x - pos[i].x;
        const dy = pos[j].y - pos[i].y;
        const dist = Math.hypot(dx, dy) || 0.01;
        let f = (LINK * LINK) / dist / 2;
        // Boxes that come within a gap of each other push hard.
        const gapX = Math.abs(dx) - (size[i].w + size[j].w) / 2;
        const gapY = Math.abs(dy) - (size[i].h + size[j].h) / 2;
        if (gapX < 64 && gapY < 64) f += 4 * (64 - Math.max(gapX, gapY));
        push(i, pos[j], f);
        push(j, pos[i], f);
      }
    }
    for (const [i, j] of pairs) {
      const dist = Math.hypot(pos[j].x - pos[i].x, pos[j].y - pos[i].y);
      const f = (dist * dist) / LINK;
      push(i, pos[j], -f);
      push(j, pos[i], -f);
    }
    for (const members of loops) {
      const c = mean(members.map((i) => pos[i]));
      for (let i = 0; i < count; i++) {
        const reach = Math.hypot(size[i].w, size[i].h) / 2;
        const dist = Math.hypot(pos[i].x - c.x, pos[i].y - c.y);
        const room = members.includes(i) ? LOOP_ROOM : LOOP_ROOM + reach;
        if (dist < room) push(i, c, 3 * (room - dist));
      }
    }
    for (let i = 0; i < count; i++) {
      // A little gravity keeps unlinked variables from drifting off.
      force[i].x -= pos[i].x * 0.02;
      force[i].y -= pos[i].y * 0.02;
      const f = Math.hypot(force[i].x, force[i].y) || 1;
      const step = Math.min(f, heat);
      pos[i].x += (force[i].x / f) * step;
      // Labels are wide, so space vertically counts for more: squash the pull a little.
      pos[i].y += (force[i].y / f) * step * 0.85;
    }
  }
  return pos;
}

// Where the ray from a box's centre towards p leaves the box, plus a gap.
function toBoundary(centre: P, p: P, b: Box, gap: number): P {
  const dx = p.x - centre.x;
  const dy = p.y - centre.y;
  const t = Math.min(dx ? (b.w / 2 + gap) / Math.abs(dx) : Infinity, dy ? (b.h / 2 + gap) / Math.abs(dy) : Infinity);
  return { x: centre.x + dx * Math.min(t, 1), y: centre.y + dy * Math.min(t, 1) };
}

// Distance from a point to a box; zero inside it.
function distToBox(p: P, b: Box): number {
  const dx = Math.max(b.x - p.x, 0, p.x - b.x - b.w);
  const dy = Math.max(b.y - p.y, 0, p.y - b.y - b.h);
  return Math.hypot(dx, dy);
}

// The gap between two boxes; negative when they overlap.
function gapBetween(a: Box, b: Box): number {
  const gx = Math.max(a.x - b.x - b.w, b.x - a.x - a.w);
  const gy = Math.max(a.y - b.y - b.h, b.y - a.y - a.h);
  return gx < 0 && gy < 0 ? Math.max(gx, gy) : Math.hypot(Math.max(gx, 0), Math.max(gy, 0));
}

function insidePolygon(p: P, ps: P[]): boolean {
  let inside = false;
  for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) {
    if (ps[i].y > p.y !== ps[j].y > p.y && p.x < ((ps[j].x - ps[i].x) * (p.y - ps[i].y)) / (ps[j].y - ps[i].y) + ps[i].x) inside = !inside;
  }
  return inside;
}

function mean(ps: P[]): P {
  return { x: ps.reduce((s, p) => s + p.x, 0) / (ps.length || 1), y: ps.reduce((s, p) => s + p.y, 0) / (ps.length || 1) };
}

// Positive when the points run clockwise on screen.
function signedArea(ps: P[]): number {
  let a = 0;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    const q = ps[(i + 1) % ps.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a;
}

