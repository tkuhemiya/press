import type { Direction, Group, GroupId, NodeId } from '../../model.ts';
import { cnode, compoundLayout, type CEdge, type CNode } from '../../layout/pele/compound.ts';
import { ARROWS, DOWN, LEFT, RIGHT, UP, canvas, type Canvas, type LineKind, type Point } from './canvas.ts';
import { cellWidth } from './cells.ts';
import { grid, opposite, step, type Dir, type Grid } from './route.ts';
import type { Token } from './theme.ts';

export interface Seg {
  text: string;
  token: Token;
  href?: string;
}

export type Line = readonly Seg[];

export interface TermNode {
  id: NodeId;
  lines: Line[];
  tag?: string;
  border: LineKind;
  token: Token;
  glyph?: Seg;
  group?: GroupId;
  first?: boolean;
  divider?: number;
}

export interface TermEdge {
  from: NodeId;
  to: NodeId;
  both: boolean;
  label: Line[];
  kind: LineKind;
  token: Token;
}

export interface TermGraph {
  nodes: readonly TermNode[];
  edges: readonly TermEdge[];
  groups: readonly Group[];
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const CX = 8;
const CY = 10;
const MARGIN = 3;

export const lineWidth = (l: Line): number => l.reduce((sum, s) => sum + cellWidth(s.text), 0);
const linesWidth = (ls: readonly Line[]): number => Math.max(0, ...ls.map(lineWidth));

const ARM: Record<Dir, number> = { 0: UP, 1: RIGHT, 2: DOWN, 3: LEFT };

function boxSize(n: TermNode): { w: number; h: number } {
  if (n.glyph) return { w: 1, h: 1 };
  const inner = Math.max(linesWidth(n.lines), n.tag ? cellWidth(n.tag) + 2 : 0);
  return { w: inner + 4, h: n.lines.length + 2 + (n.divider === undefined ? 0 : 1) };
}

const writeLine = (c: Canvas, x: number, y: number, line: Line): void => {
  let cx = x;
  for (const s of line) {
    c.text(cx, y, s.text, s.token);
    cx += cellWidth(s.text);
  }
};

interface Placed {
  node: TermNode;
  box: Rect;
  loops: Line[];
  c: CNode;
}

interface Routed {
  edge: TermEdge;
  ce: CEdge;
  label?: Rect;
}

function sideToward(box: Rect, p: Point, across: boolean): Dir {
  const below = p.y >= box.y + box.h;
  const above = p.y < box.y;
  const right = p.x >= box.x + box.w;
  const left = p.x < box.x;
  if (across) {
    if (below) return 2;
    if (above) return 0;
    return right ? 1 : left ? 3 : 2;
  }
  if (right) return 1;
  if (left) return 3;
  return below ? 2 : 0;
}

function sideOf(c: CNode, p: Point): Dir {
  const dx = (p.x - c.x) / Math.max(1, c.w / 2);
  const dy = (p.y - c.y) / Math.max(1, c.h / 2);
  if (Math.abs(dy) >= Math.abs(dx)) return dy > 0 ? 2 : 0;
  return dx > 0 ? 1 : 3;
}

function touches(c: CNode, p: Point): boolean {
  return Math.abs(p.x - c.x) <= c.w / 2 + 1 && Math.abs(p.y - c.y) <= c.h / 2 + 1;
}

function portCells(box: Rect, side: Dir): Point[] {
  if (box.w === 1 && box.h === 1) return [step(box, side)];
  const along = side % 2 === 0;
  const inset = along && box.w >= 7 ? 2 : 1;
  const from = along ? box.x + inset : box.y + 1;
  const to = along ? box.x + box.w - 1 - inset : box.y + box.h - 2;
  const fixed = side === 0 ? box.y - 1 : side === 2 ? box.y + box.h : side === 1 ? box.x + box.w : box.x - 1;
  const out: Point[] = [];
  for (let v = from; v <= to; v++) out.push(along ? { x: v, y: fixed } : { x: fixed, y: v });
  return out;
}

function pickPort(g: Grid, taken: Set<string>, box: Rect, side: Dir, near: Point): Point | undefined {
  const cells = portCells(box, side)
    .filter((p) => g.free(p) && !taken.has(`${p.x},${p.y}`))
    .sort(
      (a, b) => Math.abs(a.x - near.x) + Math.abs(a.y - near.y) - (Math.abs(b.x - near.x) + Math.abs(b.y - near.y)),
    );
  const p = cells[0];
  if (p) taken.add(`${p.x},${p.y}`);
  return p;
}

const centre = (r: Rect): Point => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) });

function straight(a: Point, b: Point): Point[] {
  const out: Point[] = [a];
  let p = a;
  while (p.x !== b.x || p.y !== b.y) {
    p = { x: p.x + Math.sign(b.x - p.x), y: p.x === b.x ? p.y + Math.sign(b.y - p.y) : p.y };
    out.push(p);
  }
  return out;
}

export function drawGraph(g: TermGraph, direction: Direction, ascii: boolean): Canvas {
  const across = direction === 'down';
  const cnodes: CNode[] = g.groups.map((grp) => {
    const c = cnode(0, 0);
    c.isGroup = true;
    c.padX = 2 * CX;
    c.padTop = 3 * CY;
    c.padBottom = 2 * CY;
    c.parent = grp.parent ?? -1;
    return c;
  });
  const base = cnodes.length;
  const placed: Placed[] = g.nodes.map((node, i) => {
    const size = boxSize(node);
    const loops = g.edges.filter((e) => e.from === node.id && e.to === node.id).map((e) => loopLine(e));
    const extra = loops.length ? 2 + linesWidth(loops) : 0;
    const c = cnode((size.w + extra) * CX, size.h * CY, node.group ?? -1);
    c.seq = node.first ? -1 : i;
    c.span = node.glyph ? 0 : (across ? size.w * CX : size.h * CY) - 2 * CX;
    cnodes.push(c);
    return { node, box: { x: 0, y: 0, ...size }, loops, c };
  });
  g.groups.forEach((_, gi) => {
    const firstMember = g.nodes.findIndex((n) => inGroup(g.groups, n.group, gi));
    cnodes[gi].seq = firstMember < 0 ? g.nodes.length : firstMember;
  });
  const index = new Map(placed.map((p, i) => [p.node.id, base + i]));
  const routed: Routed[] = g.edges.flatMap((edge) => {
    const src = index.get(edge.from);
    const dst = index.get(edge.to);
    if (src === undefined || dst === undefined || edge.from === edge.to) return [];
    const lw = edge.label.length ? linesWidth(edge.label) + 2 : 0;
    const ce: CEdge = {
      src,
      dst,
      minlen: 1,
      labelW: lw * CX,
      labelH: edge.label.length * CY,
      route: [],
      labelX: 0,
      labelY: 0,
    };
    return [{ edge, ce }];
  });
  compoundLayout(
    cnodes,
    routed.map((r) => r.ce),
    across ? 'TB' : 'LR',
    { nodeSep: 24, edgeSep: 16, rankSep: 46, portSep: 16, headRoom: 0 },
  );

  for (const p of placed) {
    const loopW = p.c.w / CX - p.box.w;
    p.box.x = Math.round((p.c.x - (loopW * CX) / 2) / CX) - Math.floor(p.box.w / 2);
    p.box.y = Math.round(p.c.y / CY) - Math.floor(p.box.h / 2);
  }
  for (const r of routed) {
    if (!r.edge.label.length) continue;
    const w = linesWidth(r.edge.label);
    const h = r.edge.label.length;
    const cx = Math.round(r.ce.labelX / CX);
    const cy = Math.round(r.ce.labelY / CY);
    r.label = { x: cx - Math.floor(w / 2), y: cy - Math.floor((h - 1) / 2), w, h };
  }

  const frames = frameRects(g.groups, placed);
  const rects = [...placed.map((p) => p.box), ...frames, ...routed.flatMap((r) => (r.label ? [r.label] : []))];
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const dx = MARGIN - minX;
  const dy = MARGIN - minY;
  const shift = (r: Rect): void => {
    r.x += dx;
    r.y += dy;
  };
  placed.forEach((p) => shift(p.box));
  frames.forEach(shift);
  routed.forEach((r) => r.label && shift(r.label));
  const loopW = Math.max(0, ...placed.map((p) => (p.loops.length ? p.box.x + p.box.w + 2 + linesWidth(p.loops) : 0)));
  const width = Math.max(loopW, ...rects.map((r) => r.x + r.w)) + MARGIN + 1;
  const height = Math.max(...rects.map((r) => r.y + r.h)) + MARGIN + 1;

  const net = grid(width, height);
  for (const p of placed) {
    for (let y = p.box.y; y < p.box.y + p.box.h; y++)
      for (let x = p.box.x; x < p.box.x + p.box.w; x++) net.block({ x, y });
    p.loops.forEach((l, i) => {
      for (let x = 0; x < lineWidth(l) + 2; x++) net.block({ x: p.box.x + p.box.w + 1 + x, y: p.box.y + 1 + i });
    });
  }
  for (const r of routed) {
    const l = r.label;
    if (!l) continue;
    for (let y = l.y; y < l.y + l.h; y++) for (let x = l.x - 1; x <= l.x + l.w; x++) net.block({ x, y });
  }
  frames.forEach((f, i) => {
    const title = cellWidth(g.groups[i].label) + 4;
    for (let x = f.x; x < f.x + f.w; x++) {
      const titled = x >= f.x + 2 && x < f.x + 2 + title;
      net.frame({ x, y: f.y }, x === f.x || x === f.x + f.w - 1 || titled ? 'x' : 'h');
      net.frame({ x, y: f.y + f.h - 1 }, x === f.x || x === f.x + f.w - 1 ? 'x' : 'h');
    }
    for (let y = f.y + 1; y < f.y + f.h - 1; y++) {
      net.frame({ x: f.x, y }, 'v');
      net.frame({ x: f.x + f.w - 1, y }, 'v');
    }
  });

  const byId = new Map(placed.map((p) => [p.node.id, p]));
  const toCell = (px: Point): Point => ({ x: Math.round(px.x / CX) + dx, y: Math.round(px.y / CY) + dy });
  const taken = new Set<string>();
  const order = [...routed].sort((a, b) => span(a) - span(b));
  function span(r: Routed): number {
    const a = byId.get(r.edge.from)?.box;
    const b = byId.get(r.edge.to)?.box;
    return a && b ? Math.abs(centre(a).x - centre(b).x) + Math.abs(centre(a).y - centre(b).y) : 0;
  }
  const paths: { r: Routed; points: Point[]; out: Dir; into: Dir; ok: boolean }[] = [];
  for (const r of order) {
    const from = byId.get(r.edge.from);
    const to = byId.get(r.edge.to);
    if (!from || !to) continue;
    const label = r.label;
    const through = label && throughLabel(label, centre(from.box), across);
    const route = r.ce.route;
    const startPx = { x: route[0] ?? from.c.x, y: route[1] ?? from.c.y };
    const endPx = { x: route[route.length - 3] ?? to.c.x, y: route[route.length - 2] ?? to.c.y };
    const outSide =
      through && !touches(from.c, startPx) ? sideToward(from.box, through.entry, across) : sideOf(from.c, startPx);
    const inSide = through && !touches(to.c, endPx) ? sideToward(to.box, through.exit, across) : sideOf(to.c, endPx);
    const start = pickPort(net, taken, from.box, outSide, toCell(startPx));
    const end = pickPort(net, taken, to.box, inSide, toCell(endPx));
    if (!start || !end) continue;
    const into = opposite(inSide);
    const first = step(start, outSide);
    let points: Point[] | undefined;
    if (through) {
      const leg1 = net.route(first, outSide, through.entry, through.dir, true);
      const leg2 = leg1 && net.route(through.exit, through.dir, end, into);
      points = leg1 && leg2 && [start, ...leg1, ...straight(through.entry, through.exit).slice(1, -1), ...leg2];
    } else {
      const leg = net.route(first, outSide, end, into);
      points = leg && [start, ...leg];
    }
    const ok = points !== undefined;
    const drawn = points ?? fallback(start, end, across);
    net.claim(drawn);
    paths.push({ r, points: drawn, out: outSide, into, ok });
  }

  const c = canvas();
  frames.forEach((f, i) => {
    c.box(f.x, f.y, f.w, f.h, 'round', 'group');
    c.text(f.x + 2, f.y, ` ${g.groups[i].label} `, 'group');
  });
  for (const p of placed) drawNode(c, p);
  for (const { r, points, out, into } of paths) {
    const kind = r.edge.kind;
    c.path(points, kind, r.edge.token);
    const first = points[0];
    const last = points.at(-1);
    if (first) {
      if (r.edge.both) c.text(first.x, first.y, ARROWS[ARM[opposite(out)]][ascii ? 1 : 0], r.edge.token);
      else {
        const border = step(first, opposite(out));
        const node = byId.get(r.edge.from);
        if (node && !node.node.glyph) c.arms(border.x, border.y, ARM[out], node.node.border, node.node.token);
        c.arms(first.x, first.y, ARM[opposite(out)], kind, r.edge.token);
      }
    }
    if (last) c.text(last.x, last.y, ARROWS[ARM[into]][ascii ? 1 : 0], r.edge.token);
  }
  for (const { r } of paths) {
    const l = r.label;
    if (!l) continue;
    r.edge.label.forEach((line, i) => {
      const w = lineWidth(line);
      const x = l.x + Math.floor((l.w - w) / 2);
      c.text(x - 1, l.y + i, ' ', 'text');
      writeLine(c, x, l.y + i, line);
      c.text(x + w, l.y + i, ' ', 'text');
    });
  }
  for (const p of placed)
    p.loops.forEach((l, i) => writeLine(c, p.box.x + p.box.w + 1, p.box.y + Math.min(i + 1, p.box.h - 1), l));
  return trimmed(c);
}

function inGroup(groups: readonly Group[], g: GroupId | undefined, target: number): boolean {
  for (let at = g; at !== undefined; at = groups[at].parent) if (at === target) return true;
  return false;
}

function loopLine(e: TermEdge): Line {
  const label = e.label.flat();
  return [{ text: '↺', token: e.token }, ...(label.length ? [{ text: ' ', token: 'text' as const }, ...label] : [])];
}

function throughLabel(l: Rect, from: Point, across: boolean): { entry: Point; exit: Point; dir: Dir } {
  const mid = centre(l);
  if (across) {
    const down = from.y <= mid.y;
    const top = { x: mid.x, y: l.y - 1 };
    const bottom = { x: mid.x, y: l.y + l.h };
    return down ? { entry: top, exit: bottom, dir: 2 } : { entry: bottom, exit: top, dir: 0 };
  }
  const right = from.x <= mid.x;
  const left = { x: l.x - 2, y: mid.y };
  const after = { x: l.x + l.w + 1, y: mid.y };
  return right ? { entry: left, exit: after, dir: 1 } : { entry: after, exit: left, dir: 3 };
}

function fallback(a: Point, b: Point, across: boolean): Point[] {
  const corner = across ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  return [...straight(a, corner), ...straight(corner, b).slice(1)];
}

function frameRects(groups: readonly Group[], placed: readonly Placed[]): Rect[] {
  const rects: (Rect | undefined)[] = groups.map(() => undefined);
  const depth = (i: number): number => {
    let d = 0;
    for (let at = groups[i].parent; at !== undefined; at = groups[at].parent) d++;
    return d;
  };
  const order = groups.map((_, i) => i).sort((a, b) => depth(b) - depth(a));
  for (const gi of order) {
    const inner: Rect[] = [
      ...placed.filter((p) => p.node.group === gi).map((p) => p.box),
      ...groups.flatMap((grp, k) => {
        const r = rects[k];
        return grp.parent === gi && r ? [r] : [];
      }),
    ];
    if (!inner.length) continue;
    const x0 = Math.min(...inner.map((r) => r.x)) - 2;
    const y0 = Math.min(...inner.map((r) => r.y)) - 2;
    const x1 = Math.max(...inner.map((r) => r.x + r.w)) + 2;
    const y1 = Math.max(...inner.map((r) => r.y + r.h)) + 1;
    const titleW = cellWidth(groups[gi].label) + 6;
    rects[gi] = { x: x0, y: y0, w: Math.max(x1 - x0, titleW), h: y1 - y0 + 1 };
  }
  return rects.map((r) => r ?? { x: 0, y: 0, w: 0, h: 0 });
}

function drawNode(c: Canvas, p: Placed): void {
  const { node, box } = p;
  if (node.glyph) {
    c.text(box.x, box.y, node.glyph.text, node.glyph.token);
    return;
  }
  c.box(box.x, box.y, box.w, box.h, node.border, node.token);
  if (node.tag) c.text(box.x + 2, box.y, ` ${node.tag} `, 'tag');
  let y = box.y + 1;
  node.lines.forEach((line, i) => {
    const w = lineWidth(line);
    const centred = node.divider === undefined || i === 0;
    writeLine(c, centred ? box.x + Math.floor((box.w - w) / 2) : box.x + 2, y, line);
    y++;
    if (node.divider === i) {
      c.path(
        [
          { x: box.x, y },
          { x: box.x + box.w - 1, y },
        ],
        node.border,
        node.token,
      );
      y++;
    }
  });
}

function trimmed(c: Canvas): Canvas {
  const rows = c.cells();
  let minX = Infinity;
  let minY = Infinity;
  rows.forEach((row, y) =>
    row.forEach((cell, x) => {
      if (cell && (cell.arms || (cell.ch !== undefined && cell.ch.trim()))) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
      }
    }),
  );
  if (!Number.isFinite(minX)) return c;
  const out = canvas();
  out.blit(c, -minX, -minY);
  return out;
}
