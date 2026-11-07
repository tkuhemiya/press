import type { CallStack, Frame, MemoryLayout, NodeId, Slot } from '../../model.ts';
import { canvas, type Canvas } from './canvas.ts';
import { slotWidths } from '../../diagrams/call-stack.ts';
import { cellWidth, splitGraphemes } from './cells.ts';
import type { Line, Seg } from './graph.ts';
import { edgeLook, nodeLook, type Markers } from './style.ts';
import { paint, type Theme } from './theme.ts';

const fit = (text: string, cells: number): string => {
  if (cellWidth(text) <= cells) return text;
  let out = '';
  for (const g of splitGraphemes(text)) {
    if (cellWidth(out + g + '…') > cells) break;
    out += g;
  }
  return out + '…';
};

const writeLine = (c: Canvas, x: number, y: number, line: Line): number => {
  let at = x;
  for (const s of line) {
    c.text(at, y, s.text, s.token);
    at += cellWidth(s.text);
  }
  return at;
};

const marksText = (segs: Seg[]): number => segs.reduce((w, s) => w + 1 + cellWidth(s.text), 0);

const withMarks = (segs: Seg[]): Seg[] => segs.flatMap((m) => [{ text: ' ', token: 'text' as const }, m]);

const render = (lines: Line[], theme: Theme): string[] =>
  lines.map((l) => l.map((s) => paint(theme, s.token, s.text)).join(''));

export function drawCallStack(d: CallStack, theme: Theme, mark: Markers, width: number): string[] {
  const ascii = theme.ascii;
  const returns = new Map<NodeId, string>();
  for (const e of d.edges) if (e.arrow === '-->' && e.label !== undefined) returns.set(e.from, `→ ${e.label}`);
  const need = (f: Frame): number =>
    cellWidth(f.label) + marksText(mark({ type: 'node', id: f.id })) + cellWidth(returns.get(f.id) ?? '') + 6;
  const widths = slotWidths(d.nodes, d.span, need, 5);
  const starts = widths.reduce<number[]>((acc, w) => [...acc, (acc.at(-1) ?? 0) + w], [0]);
  const total = (starts.at(-1) ?? 0) + 1;
  if (total > width) return callTrace(d, theme, mark);

  const c = canvas();
  const x = (t: number): number => starts[t] ?? 0;
  const y = (depth: number): number => depth * 4;
  for (const f of d.nodes) {
    const look = nodeLook(f.role, f.depth === 0);
    const x0 = x(f.start);
    const w = x(f.end) - x0 + (f.open ? 1 : 0);
    c.box(x0, y(f.depth), w, 3, f.cut ? 'dashed' : look.border, look.token);
    const value = returns.get(f.id);
    const room = w - 3 - (value ? cellWidth(value) + 1 : 0) - marksText(mark({ type: 'node', id: f.id }));
    const end = writeLine(c, x0 + 2, y(f.depth) + 1, [
      { text: fit(f.label, Math.max(1, room)), token: look.label },
      ...withMarks(mark({ type: 'node', id: f.id })),
    ]);
    if (value && end + 1 + cellWidth(value) <= x0 + w - 1)
      c.text(x0 + w - 2 - cellWidth(value), y(f.depth) + 1, value, 'note');
  }
  const byId = new Map(d.nodes.map((f) => [f.id, f]));
  for (const e of d.edges) {
    const callee = byId.get(e.arrow === '->' ? e.to : e.from);
    const other = byId.get(e.arrow === '->' ? e.from : e.to);
    if (!callee || !other) continue;
    const look = edgeLook(e.role, e.arrow);
    const unwinds = e.arrow === '-->' && callee.depth - other.depth > 1;
    const at = x(e.at) + (e.arrow === '->' ? 2 : unwinds ? 1 : -2);
    const near = y(other.depth) + 2;
    const far = y(callee.depth);
    const route = unwinds
      ? [
          { x: x(e.at) - 1, y: far + 1 },
          { x: at, y: far + 1 },
          { x: at, y: near },
        ]
      : [
          { x: at, y: near },
          { x: at, y: far },
        ];
    c.path(route, look.kind, look.token);
    const head = e.arrow === '->' ? far - 1 : near + 1;
    c.text(at, head, e.arrow === '->' ? (ascii ? 'v' : '▼') : ascii ? '^' : '▲', look.token);
    writeLine(c, at + 1, head, withMarks(mark({ type: 'edge', index: e.index })));
  }
  return c.render(theme);
}

function callTrace(d: CallStack, theme: Theme, mark: Markers): string[] {
  const byId = new Map(d.nodes.map((f) => [f.id, f]));
  const pad = (depth: number): Seg => ({ text: '  '.repeat(depth), token: 'text' });
  const root = d.nodes.find((f) => f.depth === 0);
  const lines: Line[] = root
    ? [[{ text: root.label, token: nodeLook(root.role).label }, ...withMarks(mark({ type: 'node', id: root.id }))]]
    : [];
  for (const e of d.edges) {
    const look = edgeLook(e.role, e.arrow);
    if (e.arrow === '->') {
      const f = byId.get(e.to);
      if (!f) continue;
      lines.push([
        pad(f.depth),
        { text: theme.ascii ? '-> ' : '↳ ', token: look.token },
        { text: f.label, token: nodeLook(f.role).label },
        ...withMarks([...mark({ type: 'edge', index: e.index }), ...mark({ type: 'node', id: f.id })]),
      ]);
    } else {
      const f = byId.get(e.from);
      if (!f) continue;
      lines.push([
        pad(f.depth),
        { text: theme.ascii ? '<- ' : '↩ ', token: look.token },
        { text: e.label === undefined ? `${f.label} returns` : `${f.label} returns ${e.label}`, token: 'note' },
        ...withMarks(mark({ type: 'edge', index: e.index })),
      ]);
    }
  }
  return render(lines, theme);
}

const pieceLabel = (s: Slot): string => s.name.replace(/_/g, ' ');

export function drawMemory(d: MemoryLayout, theme: Theme, mark: Markers, width: number): string[] {
  const out: string[] = [];
  const byte = width >= 8 * 5 + 1 ? 5 : width >= 8 * 3 + 1 ? 3 : 0;
  for (const b of d.nodes) {
    if (out.length) out.push('');
    const head: Line = [
      { text: b.label, token: nodeLook(b.role).label },
      ...(b.slots.length ? [{ text: `  ${b.size} byte${b.size === 1 ? '' : 's'}`, token: 'note' as const }] : []),
      ...withMarks(mark({ type: 'node', id: b.id })),
    ];
    out.push(...render([head], theme));
    if (!byte) {
      out.push(...render(memoryList(b, mark), theme));
      continue;
    }
    out.push(...memoryGrid(b, byte, theme, mark));
  }
  const lines: Line[] = d.edges.map((e) => {
    const look = edgeLook(e.role, e.arrow);
    const to = e.to.field === undefined ? e.to.entity : `${e.to.entity}.${e.to.field}`;
    return [
      { text: `${e.from.entity}.${e.from.field}`, token: 'label' },
      { text: theme.ascii ? ' --> ' : ' ──▶ ', token: look.token },
      { text: to, token: 'label' },
      ...(e.label === undefined ? [] : [{ text: `  ${e.label}`, token: 'note' as const }]),
      ...withMarks(mark({ type: 'edge', index: e.index })),
    ];
  });
  if (lines.length) out.push('', ...render(lines, theme));
  return out;
}

function memoryList(b: { id: NodeId; slots: Slot[] }, mark: Markers): Line[] {
  return b.slots.map((s) => [
    { text: `${String(s.offset).padStart(3)}  `, token: 'note' },
    { text: pieceLabel(s), token: nodeLook(s.role).label },
    { text: `  ${s.padding ? `padding, ${s.size}` : s.type}`, token: 'note' },
    ...withMarks(mark({ type: 'prop', node: b.id, key: s.name })),
  ]);
}

function memoryGrid(b: { id: NodeId; slots: Slot[]; size: number }, byte: number, theme: Theme, mark: Markers) {
  const c = canvas();
  const rows = Math.ceil(b.size / 8);
  const hidden = new Set<number>();
  for (const s of b.slots) {
    const first = Math.floor(s.offset / 8);
    const last = Math.floor((s.offset + s.size - 1) / 8);
    for (let r = first + 1; r < last; r++) hidden.add(r);
  }
  const rowY = new Map<number, number>();
  let y = 0;
  const breaks: { y: number; bytes: number }[] = [];
  for (let r = 0; r < rows; r++) {
    if (hidden.has(r)) {
      const last = breaks.at(-1);
      if (last && last.y === y) last.bytes += 8;
      else breaks.push({ y, bytes: 8 });
      if (!hidden.has(r + 1)) y += 1;
      continue;
    }
    rowY.set(r, y);
    y += 4;
  }
  for (const br of breaks) c.text(2, br.y, `⋯ ${br.bytes} more bytes`, 'note');
  const legend: Line[] = [];
  for (const s of b.slots) {
    const look = nodeLook(s.role);
    const end = s.offset + s.size;
    const marks = mark({ type: 'prop', node: b.id, key: s.name });
    let labelled = false;
    for (let r = Math.floor(s.offset / 8); r * 8 < end; r++) {
      const ry = rowY.get(r);
      if (ry === undefined) continue;
      const from = Math.max(s.offset, r * 8);
      const to = Math.min(end, (r + 1) * 8);
      const x0 = (from - r * 8) * byte;
      const w = (to - from) * byte + 1;
      c.box(x0, ry, w, 3, s.padding ? 'dotted' : look.border, look.token);
      c.text(x0, ry + 3, String(from), 'note');
      if (labelled) continue;
      labelled = true;
      const name = pieceLabel(s);
      const type = s.padding ? '' : `  ${s.type}`;
      if (cellWidth(name) + marksText(marks) <= w - 2)
        writeLine(c, x0 + 1, ry + 1, [
          { text: name, token: look.label },
          ...(cellWidth(name + type) + marksText(marks) <= w - 2 ? [{ text: type, token: 'note' as const }] : []),
          ...withMarks(marks),
        ]);
      else {
        const n = String(legend.length + 1);
        c.text(x0 + 1, ry + 1, n, 'note');
        legend.push([
          { text: `${n}  `, token: 'note' },
          { text: name, token: look.label },
          { text: `  ${s.padding ? 'padding' : s.type}`, token: 'note' },
          ...withMarks(marks),
        ]);
      }
    }
  }
  const lastRow = rowY.get(Math.floor((b.size - 1) / 8));
  if (lastRow !== undefined) {
    const used = b.size % 8 === 0 ? 8 : b.size % 8;
    const text = String(b.size);
    c.text(Math.max(0, used * byte - cellWidth(text) + 1), lastRow + 3, text, 'note');
  }
  return [...c.render(theme), ...render(legend, theme)];
}
