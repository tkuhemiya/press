import type { CausalLoop, Link, Loop, NodeId, Polarity, Target } from '../model.ts';
import type { DiagramDef, RenderContext, Rendered } from './diagram.ts';
import type { Fence } from '../parse/grammar.ts';
import type { Reporter } from '../diagnostics.ts';
import { buildGraph, edgeEnds, edgeMembers, header, lean, nodeParts, resolveSteps, toNode } from '../parse/graph.ts';
import { trusted } from '../brand.ts';
import { closest, list } from '../diagnostics.ts';
import {
  edgeItem,
  hatchItems,
  markerItems,
  measureLabel,
  refMarkers,
  textItems,
  type Box,
  nodeTargets,
  edgeTargets,
  type Anchor,
} from './draw.ts';
import { arrowhead, HEAD, n } from '../render/svg.ts';
import { textWidth } from '../text/measure.ts';
import { attr, type Attrs, type Item, type Scene } from '../scene/scene.ts';
import { paintSvg } from '../scene/svg.ts';

export const CAUSAL_LOOP: DiagramDef<'causal-loop'> = {
  type: 'causal-loop',
  name: 'Causal loop',
  build,
  render,
  targets: (d) => [
    ...nodeParts(d.nodes),
    ...d.loops.flatMap((l) => (l.id === undefined ? [] : [{ target: { type: 'edges' as const, id: l.id } }])),
  ],
  ends: (d, edge) => edgeEnds(d.edges, edge),
  members(d, id) {
    const loop = d.loops.find((l) => l.id === id);
    return loop && edgeMembers(d.edges, loop.edges);
  },
  withoutMuted(d, pinned) {
    const steps = d.steps.flatMap((s) => (s.target.type === 'edges' ? [] : [{ ...s, target: s.target }]));
    if (d.loops.length || steps.length < d.steps.length) return undefined;
    const kept = lean({ ...d, steps }, pinned);
    return kept && { ...d, ...kept };
  },
};

function build(fence: Fence, report: Reporter): CausalLoop {
  const { error } = report;
  const delay = (attrs: ReadonlyMap<string, string>, line: number): void => {
    const value = attrs.get('delay');
    if (value !== undefined && value !== 'yes')
      error(
        line,
        `\`delay=${value}\` is not understood.`,
        'Mark a delay with `{delay=yes}`; leave the attribute out when there is none.',
      );
  };
  for (const s of fence.statements) if (s.type !== 'chain' && s.type !== 'loop') delay(s.attrs, s.line);
  const graph = buildGraph(fence, report, {
    label: (id) => id.replace(/_/g, ' '),
    empty: 'Add at least one edge, e.g. `a -> b : label`.',
    chain(s) {
      const ids = s.ends.map((e) => e.node);
      const pair = `${ids[0]} -> ${ids[1]}`;
      if (s.arrows.includes('<->')) {
        error(
          s.line,
          '`<->` is not allowed in a causal loop: a mutual influence is two edges, often with different polarities.',
          `Write each direction on its own line: \`${ids[0]} -> ${ids[1]} : +\` and \`${ids[1]} -> ${ids[0]} : -\`.`,
        );
        return false;
      }
      const self = ids.findIndex((id, i) => i > 0 && id === ids[i - 1]);
      if (self > 0) {
        error(
          s.line,
          `\`${ids[self]}\` cannot influence itself directly in a causal loop.`,
          'Name what carries the effect and route the link through it: `stock -> outflow : +` and `outflow -> stock : -`.',
        );
        return false;
      }
      const { label } = s;
      if (label === undefined) {
        error(
          s.line,
          'Every edge in a causal loop needs a polarity.',
          `Add \`: +\` if the two move the same way, \`: -\` if they move in opposite ways: \`${pair} : +\`.${ids.length > 2 ? ' A polarity is a label, so give each edge of a chain its own line.' : ''}`,
        );
        return false;
      }
      if (label !== '+' && label !== '-') {
        const near = /^(positive|pos|same|s|plus|up|increase)$/i.test(label)
          ? '+'
          : /^(negative|neg|opposite|o|minus|down|decrease|−)$/i.test(label)
            ? '-'
            : undefined;
        error(
          s.line,
          `\`${label}\` is not a polarity. In a causal loop the edge label is \`+\` or \`-\`.`,
          near
            ? `Write \`${pair} : ${near}\`.`
            : 'Use `+` (same direction) or `-` (opposite direction), and put any explanation in the prose.',
        );
        return false;
      }
      delay(s.attrs, s.line);
      return true;
    },
  });
  const nodes = graph.nodes.map(toNode);
  const edges = graph.links.flatMap(({ edge: e, attrs }): Link[] => {
    const polarity: Polarity | undefined = e.label === '+' || e.label === '-' ? e.label : undefined;
    if (!polarity || e.arrow === '<->') return [];
    return [{ ...e, arrow: e.arrow, polarity, delay: attrs.get('delay') === 'yes' }];
  });
  const loops: Loop[] = [];
  for (const s of fence.statements) {
    if (s.type !== 'loop') continue;
    const ids = s.ends;
    const first = ids[0];
    const last = ids[ids.length - 1];
    if (first !== last) {
      error(
        s.line,
        `Loop "${s.name}" does not close: it starts at \`${first}\` and ends at \`${last}\`.`,
        `End the chain where it starts: \`${[...ids, first].join(' -> ')}\`.`,
      );
      continue;
    }
    const known = new Set(nodes.map((node) => node.id));
    const path: Link['index'][] = [];
    let ok = true;
    for (let i = 0; ok && i + 1 < ids.length; i++) {
      const from = ids[i];
      const to = ids[i + 1];
      const missing = [from, to].find((id) => !known.has(id));
      if (missing !== undefined) {
        const near = closest(missing, known);
        error(
          s.line,
          `Loop "${s.name}" names \`${missing}\`, which is not in the diagram.`,
          near ? `Did you mean \`${near}\`?` : `Nodes: ${list(known)}.`,
        );
        ok = false;
        break;
      }
      const e = edges.find((x) => x.from === from && x.to === to);
      if (!e) {
        const out = edges.filter((x) => x.from === from).map((x) => `\`${x.from} -> ${x.to}\``);
        error(
          s.line,
          `Loop "${s.name}" uses \`${from} -> ${to}\`, which is not an edge in the diagram.`,
          out.length
            ? `Edges from \`${from}\`: ${out.join(', ')}. Add the edge, or follow one that exists.`
            : `Add the edge with its polarity: \`${from} -> ${to} : +\`.`,
        );
        ok = false;
        break;
      }
      path.push(e.index);
    }
    const [head, ...rest] = path;
    if (!ok || head === undefined) continue;
    const negatives = path.filter((i) => edges[i]?.polarity === '-').length;
    const reinforcing = negatives % 2 === 0;
    const label = `${reinforcing ? 'R' : 'B'}${loops.filter((l) => l.reinforcing === reinforcing).length + 1}`;
    const loop: Loop = { name: s.name, label, reinforcing, edges: [head, ...rest], line: s.line };
    if (s.id !== undefined) {
      const clash = nodes.some((node) => node.id === s.id) || loops.some((l) => l.id === s.id);
      if (clash)
        error(
          s.line,
          `\`${s.id}\` is already used in this diagram, so it cannot also name a loop.`,
          `Loops, variables and other loops share ids. Rename the loop, e.g. \`loop ${s.id}_loop "${s.name}": …\`.`,
        );
      else loop.id = s.id;
    }
    loops.push(loop);
  }
  const loopIds = new Set(loops.flatMap((l) => l.id ?? []));
  const steps = fence.steps.flatMap((raw): CausalLoop['steps'] => {
    const id = raw.to === undefined && raw.from.key === undefined ? raw.from.node : undefined;
    if (id !== undefined && loopIds.has(id))
      return [{ target: { type: 'edges', id }, caption: raw.caption, line: raw.line }];
    return resolveSteps([raw], nodes, edges, report);
  });
  return { ...header(fence, 'causal-loop'), nodes, edges, groups: graph.groups, steps, loops };
}

const MARGIN = 20;
const PAD_X = 14;
const PAD_Y = 8;
const MAX_LABEL = 130;

const LINK = 200;
const ITERATIONS = 400;
const LOOP_R = 12;

const LOOP_ROOM = 110;

interface P {
  x: number;
  y: number;
}

function render(d: CausalLoop, context: RenderContext): Rendered {
  const { domId } = context;
  const texts = d.nodes.map((node) => measureLabel(node.label, node.note, MAX_LABEL));
  const size = texts.map((t) => ({ w: Math.ceil(t.w + 2 * PAD_X), h: Math.ceil(t.h + 2 * PAD_Y) }));
  const members = d.loops.map((l) => l.edges.flatMap((i) => d.edges[i]?.from ?? []));
  const pos = layout(d, members, size);
  const at = new Map(d.nodes.map((node, i) => [node.id, i]));
  const place = (id: NodeId): P => pos[at.get(id) ?? -1] ?? { x: 0, y: 0 };

  const minX = Math.min(...pos.map((p, i) => p.x - size[i].w / 2));
  const minY = Math.min(...pos.map((p, i) => p.y - size[i].h / 2));
  const pad = MARGIN + 34;
  for (const p of pos) {
    p.x += pad - minX;
    p.y += pad - minY;
  }
  const boxes = new Map<string, Box>(
    d.nodes.map((node, i) => [
      node.id,
      { x: pos[i].x - size[i].w / 2, y: pos[i].y - size[i].h / 2, w: size[i].w, h: size[i].h },
    ]),
  );

  const centre = mean(pos);
  const loopCentre = members.map((ids) => mean(ids.map(place)));
  const twoWay = (e: Link) => d.edges.some((o) => o.from === e.to && o.to === e.from);

  const marks: Item[] = [];
  const anchors = new Map<number, Anchor>();
  const extent = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const grow = (x: number, y: number, r = 0) => {
    extent.x0 = Math.min(extent.x0, x - r);
    extent.y0 = Math.min(extent.y0, y - r);
    extent.x1 = Math.max(extent.x1, x + r);
    extent.y1 = Math.max(extent.y1, y + r);
  };
  const edgeItems: Item[] = [];
  const obstacles: P[] = [];
  for (const e of d.edges) {
    const a = place(e.from);
    const b = place(e.to);
    const boxA = boxes.get(e.from);
    const boxB = boxes.get(e.to);
    if (!boxA || !boxB) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const left = { x: dy / len, y: -dx / len };
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    let side: number;
    let bow: number;
    if (twoWay(e)) {
      side = 1;
      bow = Math.min(0.62, 130 / len);
    } else {
      const k = d.loops.findIndex((l) => l.edges.length > 2 && l.edges.includes(e.index));
      const from = k >= 0 ? loopCentre[k] : centre;
      const away = (mid.x - from.x) * left.x + (mid.y - from.y) * left.y;
      side = away >= 0 ? 1 : -1;
      bow = k >= 0 ? 0.3 : 0.16;
    }
    const c = { x: mid.x + left.x * side * bow * len, y: mid.y + left.y * side * bow * len };
    const s = toBoundary(a, c, boxA, 3);
    const tip = toBoundary(b, c, boxB, 3);
    const tx = tip.x - c.x;
    const ty = tip.y - c.y;
    const tl = Math.hypot(tx, ty) || 1;
    const end = { x: tip.x - (tx / tl) * (HEAD - 1), y: tip.y - (ty / tl) * (HEAD - 1) };
    const path = `M${n(s.x)},${n(s.y)}Q${n(c.x)},${n(c.y)} ${n(end.x)},${n(end.y)}`;
    grow(c.x, c.y);

    const q = (t: number): P => ({
      x: (1 - t) * (1 - t) * s.x + 2 * t * (1 - t) * c.x + t * t * tip.x,
      y: (1 - t) * (1 - t) * s.y + 2 * t * (1 - t) * c.y + t * t * tip.y,
    });
    const near = q(0.8);
    const sign = { x: near.x + left.x * side * 12, y: near.y + left.y * side * 12 };
    grow(sign.x, sign.y, 8);
    for (let t = 0; t <= 1; t += 0.04) obstacles.push(q(t));
    obstacles.push(sign);
    const extra: Item[] = [];
    if (e.delay) {
      const m = q(0.5);
      const ux = (tip.x - s.x) / (Math.hypot(tip.x - s.x, tip.y - s.y) || 1);
      const uy = (tip.y - s.y) / (Math.hypot(tip.x - s.x, tip.y - s.y) || 1);
      const bar = (o: number) =>
        `M${n(m.x + ux * o - uy * 7)},${n(m.y + uy * o + ux * 7)}L${n(m.x + ux * o + uy * 7)},${n(m.y + uy * o - ux * 7)}`;
      extra.push({ type: 'path', cls: 'pr-delay', d: `${bar(-2.5)}${bar(2.5)}` });
    }
    edgeItems.push(
      withItems(
        edgeItem(
          e,
          { d: path, sx: s.x, sy: s.y, sdx: s.x - c.x, sdy: s.y - c.y, ex: tip.x, ey: tip.y, edx: tx, edy: ty },
          false,
        ),
        extra,
      ),
    );
    marks.push({
      type: 'group',
      cls: 'pr-edge-label pr-polarity-mark',
      attrs: [['data-edge', String(e.index)], ...attr('data-role', e.role)],
      items: [
        { type: 'text', cls: 'pr-polarity', x: sign.x, y: sign.y, text: e.polarity === '-' ? '−' : '+', dy: '0.35em' },
      ],
    });
    anchors.set(e.index, { x: q(0.5).x, y: q(0.5).y });
  }

  const taken: Box[] = [...boxes.values()];
  const loopItems = d.loops.map((l, k): Item => {
    const pts = members[k].map(place);
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
    if (l.id !== undefined) boxes.set(l.id, { x: p.x - LOOP_R, y: p.y - LOOP_R, w: 2 * LOOP_R, h: 2 * LOOP_R });
    const named: Attrs =
      l.id === undefined
        ? []
        : [
            ['data-node', l.id],
            ['id', `${domId}-node-${l.id}`],
          ];
    return {
      type: 'group',
      cls: 'pr-loop',
      attrs: [...named, ['data-loop', l.label], ['data-kind', l.reinforcing ? 'R' : 'B']],
      items: [
        {
          type: 'path',
          cls: 'pr-loop-arc',
          d: `M${n(px(a0))},${n(py(a0))}A${LOOP_R},${LOOP_R} 0 1 ${sweep} ${n(px(a1))},${n(py(a1))}`,
        },
        { type: 'path', cls: 'pr-loop-head', d: arrowhead(px(a1) + tdx * 3, py(a1) + tdy * 3, tdx, tdy) },
        { type: 'text', cls: 'pr-loop-label', x: p.x, y: p.y, text: l.label, dy: '0.35em' },
        { type: 'text', cls: 'pr-loop-name', x: p.x, y: p.y + LOOP_R + 14, text: l.name },
      ],
    };
  });

  const nodeItems = d.nodes.map((node, i): Item => {
    const b = boxes.get(node.id) ?? { x: 0, y: 0, w: 0, h: 0 };
    grow(b.x, b.y);
    grow(b.x + b.w, b.y + b.h);
    const r = Math.min(b.h / 2, 14);
    return {
      type: 'group',
      cls: 'pr-node',
      attrs: [['data-node', node.id], ['id', `${domId}-node-${node.id}`], ...attr('data-role', node.role)],
      items: [
        { type: 'rect', cls: 'pr-box pr-variable', ...b, r },
        ...hatchItems(node, b, r),
        ...textItems(texts[i], b.x + b.w / 2, b.y + b.h / 2),
      ],
    };
  });

  const sx = MARGIN - extent.x0;
  const sy = MARGIN - extent.y0;
  const width = Math.ceil(extent.x1 - extent.x0 + 2 * MARGIN);
  const height = Math.ceil(extent.y1 - extent.y0 + 2 * MARGIN);
  const scene: Scene = {
    id: domId,
    cls: 'pr-causal-loop',
    width,
    height,
    hatch: true,
    items: [
      {
        type: 'group',
        attrs: [['transform', `translate(${n(sx)},${n(sy)})`]],
        items: [
          ...loopItems,
          ...edgeItems,
          ...nodeItems,
          ...marks,
          ...markerItems(
            d,
            boxes,
            anchors,
            refMarkers(context, [...nodeTargets(d.nodes), ...edgeTargets(d.edges), ...loopTargets(d.loops)]),
          ),
        ],
      },
    ],
  };
  return { svg: trusted(paintSvg(scene)), width, height, scene };
}

function withItems(item: Item, extra: readonly Item[]): Item {
  return item.type === 'group' ? { ...item, items: [...item.items, ...extra] } : item;
}

function layout(d: CausalLoop, members: NodeId[][], size: { w: number; h: number }[]): P[] {
  const count = d.nodes.length;
  if (!count) return [];
  const index = new Map(d.nodes.map((node, i) => [node.id, i]));
  const of = (id: NodeId): number => index.get(id) ?? -1;
  const order: number[] = [];
  for (const ids of members) for (const id of ids) if (!order.includes(of(id))) order.push(of(id));
  d.nodes.forEach((_, i) => order.includes(i) || order.push(i));
  const radius = Math.max(LINK * 0.6, (LINK * count) / (2 * Math.PI));
  const pos: P[] = Array.from({ length: count });
  order.forEach((i, k) => {
    const a = Math.PI + (2 * Math.PI * k) / count;
    pos[i] = { x: radius * Math.cos(a), y: radius * Math.sin(a) };
  });
  const links = new Set<string>();
  for (const e of d.edges) links.add([of(e.from), of(e.to)].sort((a, b) => a - b).join(','));
  const pairs = [...links].map((k) => k.split(',').map(Number));
  const loops = members.map((ids) => ids.map(of));

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
      force[i].x -= pos[i].x * 0.02;
      force[i].y -= pos[i].y * 0.02;
      const f = Math.hypot(force[i].x, force[i].y) || 1;
      const step = Math.min(f, heat);
      pos[i].x += (force[i].x / f) * step;
      pos[i].y += (force[i].y / f) * step * 0.85;
    }
  }
  return pos;
}

function toBoundary(centre: P, p: P, b: Box, gap: number): P {
  const dx = p.x - centre.x;
  const dy = p.y - centre.y;
  const t = Math.min(dx ? (b.w / 2 + gap) / Math.abs(dx) : Infinity, dy ? (b.h / 2 + gap) / Math.abs(dy) : Infinity);
  return { x: centre.x + dx * Math.min(t, 1), y: centre.y + dy * Math.min(t, 1) };
}

function distToBox(p: P, b: Box): number {
  const dx = Math.max(b.x - p.x, 0, p.x - b.x - b.w);
  const dy = Math.max(b.y - p.y, 0, p.y - b.y - b.h);
  return Math.hypot(dx, dy);
}

function gapBetween(a: Box, b: Box): number {
  const gx = Math.max(a.x - b.x - b.w, b.x - a.x - a.w);
  const gy = Math.max(a.y - b.y - b.h, b.y - a.y - a.h);
  return gx < 0 && gy < 0 ? Math.max(gx, gy) : Math.hypot(Math.max(gx, 0), Math.max(gy, 0));
}

function insidePolygon(p: P, ps: P[]): boolean {
  let inside = false;
  for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) {
    if (
      ps[i].y > p.y !== ps[j].y > p.y &&
      p.x < ((ps[j].x - ps[i].x) * (p.y - ps[i].y)) / (ps[j].y - ps[i].y) + ps[i].x
    )
      inside = !inside;
  }
  return inside;
}

function mean(ps: P[]): P {
  return {
    x: ps.reduce((s, p) => s + p.x, 0) / (ps.length || 1),
    y: ps.reduce((s, p) => s + p.y, 0) / (ps.length || 1),
  };
}

function signedArea(ps: P[]): number {
  let a = 0;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    const q = ps[(i + 1) % ps.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a;
}

function loopTargets(loops: readonly Loop[]): Target[] {
  return loops.flatMap((l) => (l.id === undefined ? [] : [{ type: 'edges', id: l.id }]));
}
