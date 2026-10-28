import type { Participant, Sequence } from '../../model.ts';
import { ARROWS, DOWN, LEFT, RIGHT, canvas, type Canvas } from './canvas.ts';
import { cellWidth } from './cells.ts';
import { lineWidth, type Line, type Seg } from './graph.ts';
import { edgeLook, errorMark, labelLines, nodeLook, type Markers } from './style.ts';
import type { Theme } from './theme.ts';

interface Col {
  node: Participant;
  lines: Line[];
  tag?: string;
  w: number;
  x: number;
}

const space: Seg = { text: ' ', token: 'text' };
const spaced = (marks: Seg[]): Seg[] => marks.flatMap((m) => [space, m]);

function order(d: Sequence): Participant[] {
  const first = new Map(d.nodes.map((n, i) => [n.id, i]));
  const at = (n: Participant): number => first.get(n.id) ?? Infinity;
  const items = (g: number | undefined): { at: number; nodes: Participant[] }[] => {
    const own = d.nodes.filter((n) => n.group === g).map((n) => ({ at: at(n), nodes: [n] }));
    const sub = d.groups
      .map((grp, i) => ({ grp, i }))
      .filter(({ grp }) => grp.parent === g)
      .map(({ i }) => {
        const nodes = items(i).flatMap((it) => it.nodes);
        return { at: Math.min(Infinity, ...nodes.map(at)), nodes };
      })
      .filter((it) => it.nodes.length);
    return [...own, ...sub].sort((a, b) => a.at - b.at);
  };
  return items(undefined).flatMap((it) => it.nodes);
}

const writeLine = (c: Canvas, x: number, y: number, line: Line): void => {
  let cx = x;
  for (const s of line) {
    c.text(cx, y, s.text, s.token);
    cx += cellWidth(s.text);
  }
};

export function drawSequence(d: Sequence, theme: Theme, mark: Markers, maxLabel: number): Canvas {
  const ascii = theme.ascii;
  const tight = maxLabel <= 10;
  const GAP = tight ? 1 : 2;
  const cols: Col[] = order(d).map((node) => {
    const look = nodeLook(node.role);
    const head: Seg[] = node.role === 'error' ? [{ text: errorMark(theme), token: 'error' }] : [];
    const lines = [
      ...labelLines(node.label, maxLabel, look.label, mark({ type: 'node', id: node.id }), head),
      ...(node.note ? labelLines(node.note, maxLabel, 'note') : []),
    ];
    const tag = maxLabel > 10 ? (node.icon ?? node.kind) : undefined;
    const inner = Math.max(...lines.map(lineWidth), tag ? cellWidth(tag) + 2 : 0);
    return { node, lines, w: inner + (tight ? 2 : 4), x: 0, ...(tag ? { tag } : {}) };
  });
  const index = new Map(cols.map((c, i) => [c.node.id, i]));
  const labels = d.edges.map((e) => {
    const look = edgeLook(e.role, e.arrow);
    const head: Seg[] = e.role === 'error' ? [{ text: errorMark(theme), token: 'error' }] : [];
    const token = e.role === 'muted' ? 'muted' : e.role === 'error' ? 'error' : 'label';
    const marks = mark({ type: 'edge', index: e.index });
    const lines = e.label
      ? labelLines(e.label, maxLabel, token, marks, head)
      : marks.length
        ? [[...head, ...marks]]
        : [];
    return { lines, look };
  });

  const gaps = cols.slice(1).map((c, i) => Math.ceil((cols[i].w + c.w) / 2) + GAP);
  d.edges.forEach((e, k) => {
    const a = index.get(e.from);
    const b = index.get(e.to);
    if (a === undefined || b === undefined || a === b) return;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const need = Math.max(0, ...labels[k].lines.map(lineWidth)) + (tight ? 3 : 4);
    let have = 0;
    for (let i = lo; i < hi; i++) have += gaps[i];
    if (have < need) gaps[hi - 1] += need - have;
  });
  const groupDepth = Math.max(0, ...d.groups.map((_, i) => depthOf(d, i) + 1));
  const left = 1;
  cols.forEach((c, i) => {
    c.x = i === 0 ? left + Math.floor(c.w / 2) : cols[i - 1].x + gaps[i - 1];
  });
  const selfRoom = Math.max(
    0,
    ...d.edges.map((e, k) => {
      const i = index.get(e.from);
      return e.from === e.to && i === cols.length - 1 ? 5 + Math.max(0, ...labels[k].lines.map(lineWidth)) : 0;
    }),
  );
  const lastCol = cols.at(-1);
  const rightEdge = lastCol ? Math.max(lastCol.x + Math.ceil(lastCol.w / 2), lastCol.x + selfRoom) + 1 : 0;

  const c = canvas();
  const headerTop = groupDepth;
  const headH = Math.max(...cols.map((col) => col.lines.length)) + 2;
  for (const col of cols) {
    const look = nodeLook(col.node.role);
    const bx = col.x - Math.floor(col.w / 2);
    c.box(bx, headerTop, col.w, headH, look.border, look.token);
    if (col.tag) c.text(bx + 2, headerTop, ` ${col.tag} `, 'tag');
    col.lines.forEach((line, i) => writeLine(c, col.x - Math.floor(lineWidth(line) / 2), headerTop + 1 + i, line));
  }

  const starts = new Map<number, number[]>();
  const ends = new Map<number, number[]>();
  d.phases.forEach((p, pi) => {
    if (!p.edges.length) return;
    const first = Math.min(...p.edges);
    const last = Math.max(...p.edges);
    starts.set(first, [...(starts.get(first) ?? []), pi]);
    ends.set(last, [...(ends.get(last) ?? []), pi]);
  });
  const phaseDepth = (pi: number): number => {
    let n = 0;
    for (let at = d.phases[pi].parent; at !== undefined; at = d.phases[at].parent) n++;
    return n;
  };
  const phaseTop = new Map<number, number>();
  const frames: { pi: number; top: number; bottom: number }[] = [];
  let y = headerTop + headH + 1;
  const rows: { k: number; y: number }[] = [];
  d.edges.forEach((e, k) => {
    for (const pi of (starts.get(k) ?? []).sort((a, b) => phaseDepth(a) - phaseDepth(b))) {
      phaseTop.set(pi, y);
      y += 2;
    }
    const lines = labels[k].lines;
    const self = e.from === e.to;
    rows.push({ k, y });
    y += self ? Math.max(2, lines.length + 1) : lines.length + 1;
    y += 1;
    for (const pi of (ends.get(k) ?? []).sort((a, b) => phaseDepth(b) - phaseDepth(a))) {
      frames.push({ pi, top: phaseTop.get(pi) ?? y, bottom: y });
      y += 2;
    }
  });
  const bottom = y - 1;

  for (const col of cols)
    c.path(
      [
        { x: col.x, y: headerTop + headH },
        { x: col.x, y: bottom },
      ],
      'dotted',
      'line',
    );
  for (const col of cols)
    c.arms(col.x, headerTop + headH - 1, DOWN, nodeLook(col.node.role).border, nodeLook(col.node.role).token);

  for (const { k, y: top } of rows) {
    const e = d.edges[k];
    const a = index.get(e.from);
    const b = index.get(e.to);
    if (a === undefined || b === undefined) continue;
    const { lines, look } = labels[k];
    const xa = cols[a].x;
    const xb = cols[b].x;
    if (a === b) {
      const yb = top + Math.max(1, lines.length);
      c.path(
        [
          { x: xa, y: top },
          { x: xa + 3, y: top },
          { x: xa + 3, y: yb },
          { x: xa + 1, y: yb },
        ],
        look.kind,
        look.token,
      );
      c.text(xa + 1, yb, ARROWS[LEFT][ascii ? 1 : 0], look.token);
      lines.forEach((line, i) => writeLine(c, xa + 5, top + i, line));
      continue;
    }
    const arrowY = top + lines.length;
    const dir = xb > xa ? 1 : -1;
    c.path(
      [
        { x: xa, y: arrowY },
        { x: xb - dir, y: arrowY },
      ],
      look.kind,
      look.token,
    );
    c.text(xb - dir, arrowY, ARROWS[dir > 0 ? RIGHT : LEFT][ascii ? 1 : 0], look.token);
    if (e.arrow === '<->') c.text(xa + dir, arrowY, ARROWS[dir > 0 ? LEFT : RIGHT][ascii ? 1 : 0], look.token);
    const near = cols[a + dir]?.x ?? xb;
    const widest = Math.max(0, ...lines.map(lineWidth));
    const mid = widest <= Math.abs(near - xa) - 4 ? Math.floor((xa + near) / 2) : Math.floor((xa + xb) / 2);
    lines.forEach((line, i) => writeLine(c, mid - Math.floor(lineWidth(line) / 2), top + i, line));
  }

  for (const f of frames) {
    const p = d.phases[f.pi];
    const inset = phaseDepth(f.pi) * 2;
    const x0 = left - 1 + inset;
    const x1 = rightEdge + 1 - inset;
    c.box(x0, f.top, x1 - x0 + 1, f.bottom - f.top + 1, 'round', 'group');
    const marks = p.id === undefined ? [] : spaced(mark({ type: 'edges', id: p.id }));
    writeLine(c, x0 + 2, f.top, [{ text: ` ${p.label}`, token: 'group' }, ...marks, space]);
  }

  d.groups.forEach((g, gi) => {
    const members = cols.filter((col) => inGroup(d, col.node.group, gi));
    const firstCol = members[0];
    const lastMember = members.at(-1);
    if (!firstCol || !lastMember) return;
    const row = depthOf(d, gi);
    const x0 = firstCol.x - Math.floor(firstCol.w / 2);
    const x1 = lastMember.x - Math.floor(lastMember.w / 2) + lastMember.w - 1;
    const title = ` ${g.label} `;
    const line = ascii ? '-' : '─';
    const fill = Math.max(0, x1 - x0 - 2 - cellWidth(title));
    c.text(x0, row, `${ascii ? '+' : '╭'}${line}${title}${line.repeat(fill)}${ascii ? '+' : '╮'}`, 'group');
  });
  return c;
}

function depthOf(d: Sequence, g: number): number {
  let n = 0;
  for (let at = d.groups[g]?.parent; at !== undefined; at = d.groups[at]?.parent) n++;
  return n;
}

function inGroup(d: Sequence, g: number | undefined, target: number): boolean {
  for (let at = g; at !== undefined; at = d.groups[at]?.parent) if (at === target) return true;
  return false;
}

export function sequenceList(d: Sequence, theme: Theme, mark: Markers): Line[] {
  const label = (id: string): string => d.nodes.find((n) => n.id === id)?.label ?? id;
  return d.edges.map((e, i): Line => {
    const look = edgeLook(e.role, e.arrow);
    const arrow =
      e.arrow === '-->'
        ? theme.ascii
          ? '..>'
          : '╌▶'
        : e.arrow === '<->'
          ? theme.ascii
            ? '<->'
            : '◀─▶'
          : theme.ascii
            ? '->'
            : '─▶';
    return [
      { text: `${i + 1}. `, token: 'note' },
      { text: label(e.from), token: 'label' },
      { text: ` ${arrow} `, token: look.token },
      { text: label(e.to), token: 'label' },
      ...(e.label ? [{ text: `: ${e.label}`, token: 'note' as const }] : []),
      ...spaced(mark({ type: 'edge', index: e.index })),
    ];
  });
}
