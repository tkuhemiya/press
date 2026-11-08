import type { Dependency, Direction, Node, Tradeoffs } from '../../model.ts';
import type { Figure } from '../../parse/document.ts';
import { view } from '../../diagrams/diagram.ts';
import { htmlInlines } from '../blocks.ts';
import {
  c4Graph,
  causalLoopGraph,
  classGraph,
  decisionTreeGraph,
  directionsFor,
  erGraph,
  kindedGraph,
  loopLegend,
  changeToken,
  stateMachineGraph,
  type Ctx,
} from './diagrams.ts';
import { wrapLine } from './flow.ts';
import { drawGraph, drawPanes, type Line, type Seg, type TermGraph } from './graph.ts';
import { inlineLine } from './inline.ts';
import { drawSequence, sequenceList } from './sequence.ts';
import { markers, stepMark, type Markers } from './style.ts';
import { drawTable, type Cell, type Row } from './table.ts';
import { paint, stripAnsi, type Theme, type Token } from './theme.ts';
import { cellWidth } from './cells.ts';
import type { Canvas } from './canvas.ts';
import { splits } from '../../diagrams/diff-view.ts';
import { drawTimeline } from './timeline.ts';
import { drawCallStack, drawMemory } from './stack.ts';
import { renameOf, signed, signedText } from '../../diagrams/sign.ts';

const LABELS = [24, 16, 10];

export interface TermFigure {
  body: string[];
  title?: Line;
  legend: Line[];
}

export function termFigure(f: Figure, theme: Theme, width: number): TermFigure {
  const mark = markers(f, theme);
  const d = f.diagram;
  const legend: Line[] = d.steps.map((s, i) => [
    { text: `${stepMark(i, theme)} `, token: 'marker' },
    ...inlineLine(htmlInlines(s.caption)),
  ]);
  if (d.type === 'causal-loop') legend.push(...loopLegend(d).map((t): Line => [{ text: t, token: 'note' }]));
  const out: TermFigure = { body: body(f, theme, mark, width), legend };
  if (d.title !== undefined) out.title = [{ text: d.title, token: 'title' }];
  return out;
}

function body(f: Figure, theme: Theme, mark: Markers, width: number): string[] {
  const d = signed(f.diagram);
  const ctx = (maxLabel: number): Ctx => ({ theme, mark, maxLabel });
  const turnable = view(d).turnable();
  const split = splits(f.diagram);
  const graph = (build: (c: Ctx) => TermGraph, dirs: Direction[]): string[] => {
    if (split) {
      const tries = LABELS.flatMap((maxLabel) => dirs.map((dir) => drawPanes(build(ctx(maxLabel)), dir, theme.ascii)));
      return choosePanes(tries, width, theme) ?? listOf(build(ctx(LABELS[0])), theme);
    }
    for (const maxLabel of LABELS)
      for (const dir of dirs) {
        const c = drawGraph(build(ctx(maxLabel)), dir, theme.ascii);
        if (c.width() <= width) return c.render(theme);
      }
    return listOf(build(ctx(LABELS[0])), theme);
  };
  switch (d.type) {
    case 'state-machine':
      return graph((c) => stateMachineGraph(d, c), directionsFor(d.direction, turnable));
    case 'architecture':
    case 'data-flow':
    case 'deployment':
      return graph((c) => kindedGraph(d, c), directionsFor(d.direction, turnable));
    case 'c4':
      return graph((c) => c4Graph(d, c), directionsFor(d.direction, turnable));
    case 'decision-tree':
      return graph((c) => decisionTreeGraph(d, c), directionsFor(d.direction, turnable));
    case 'causal-loop':
      return graph((c) => causalLoopGraph(d, c), ['down', 'right']);
    case 'er':
      return graph((c) => erGraph(d, c), directionsFor(d.direction, true));
    case 'class':
      return graph((c) => classGraph(d, c), directionsFor(d.direction, true));
    case 'dependency':
      return drawTable(dependencyTable(d, theme, mark), width).render(theme);
    case 'sequence': {
      if (split) {
        const panes = (maxLabel: number): [Canvas, Canvas] => [
          drawSequence(d, theme, mark, maxLabel, 'before'),
          drawSequence(d, theme, mark, maxLabel, 'after'),
        ];
        const fit = choosePanes(LABELS.map(panes), width, theme);
        if (fit) return fit;
        return sequenceList(d, theme, mark).flatMap((l) => legendLines([l], width, theme));
      }
      for (const maxLabel of LABELS) {
        const c = drawSequence(d, theme, mark, maxLabel);
        if (c.width() <= width) return c.render(theme);
      }
      return sequenceList(d, theme, mark).flatMap((l) => legendLines([l], width, theme));
    }
    case 'timeline': {
      if (split) {
        const half = Math.floor((width - GUTTER.length) / 2);
        const pair = (w: number): [Canvas, Canvas] => [
          drawTimeline(d, theme, mark, w, 'before'),
          drawTimeline(d, theme, mark, w, 'after'),
        ];
        return (
          choosePanes([pair(half), pair(width)], width, theme) ?? drawTimeline(d, theme, mark, width).render(theme)
        );
      }
      return drawTimeline(d, theme, mark, width).render(theme);
    }
    case 'tradeoffs':
      return drawTable(tradeoffsTable(d, theme, mark), width).render(theme);
    case 'call-stack':
      return drawCallStack(d, theme, mark, width);
    case 'memory-layout':
      return drawMemory(d, theme, mark, width);
  }
}

const GUTTER = '   ';

const paneHeads = (theme: Theme): [string, string] => [
  paint(theme, 'removed', `${theme.ascii ? '-' : '−'} Before`),
  paint(theme, 'added', '+ After'),
];

function choosePanes(tries: readonly [Canvas, Canvas][], width: number, theme: Theme): string[] | undefined {
  const beside = tries.find(([b, a]) => b.width() + a.width() + GUTTER.length <= width);
  if (beside) return besideOf(beside, theme);
  const stacked = tries.find(([b, a]) => Math.max(b.width(), a.width()) <= width);
  return stacked ? stackedOf(stacked, theme) : undefined;
}

function besideOf([before, after]: [Canvas, Canvas], theme: Theme): string[] {
  const [bh, ah] = paneHeads(theme);
  const left = [bh, '', ...before.render(theme)];
  const right = [ah, '', ...after.render(theme)];
  const w = before.width();
  const pad = (line: string): string => line + ' '.repeat(Math.max(0, w - cellWidth(stripAnsi(line))));
  return Array.from({ length: Math.max(left.length, right.length) }, (_, i) =>
    `${pad(left[i] ?? '')}${GUTTER}${right[i] ?? ''}`.trimEnd(),
  );
}

function stackedOf([before, after]: [Canvas, Canvas], theme: Theme): string[] {
  const [bh, ah] = paneHeads(theme);
  return [bh, '', ...before.render(theme), '', ah, '', ...after.render(theme)];
}

function listOf(g: TermGraph, theme: Theme): string[] {
  const name = new Map(
    g.nodes.map((n) => [n.id, n.glyph ? n.glyph.text : (n.lines[0]?.map((s) => s.text).join('') ?? n.id)]),
  );
  const arrow = (kind: string, both: boolean): string =>
    `${both ? (theme.ascii ? '<' : '◀') : ''}${kind === 'dashed' || kind === 'dotted' ? (theme.ascii ? '..' : '╌╌') : theme.ascii ? '--' : '──'}${theme.ascii ? '>' : '▶'}`;
  return g.edges.map((e) => {
    const label = e.label.map((l) => l.map((s) => s.text).join('')).join(' ');
    const line: Line = [
      { text: name.get(e.from) ?? e.from, token: 'label' },
      { text: ` ${arrow(e.kind, e.both)} `, token: e.token },
      { text: name.get(e.to) ?? e.to, token: 'label' },
      ...(label ? [{ text: `  ${label}`, token: 'note' as const }] : []),
    ];
    return line.map((s) => paint(theme, s.token, s.text)).join('');
  });
}

function tradeoffsTable(d: Tradeoffs, theme: Theme, mark: Markers): { head: Cell[]; rows: Row[] } {
  const space: Seg = { text: ' ', token: 'text' };
  const optionHead = (o: Node): Cell =>
    headCell(
      o,
      o.role === 'focus' ? 'focus-label' : o.role === 'muted' ? 'muted' : 'strong',
      mark,
      o.role === 'focus' ? [{ text: theme.ascii ? '* ' : '★ ', token: 'focus-label' }] : [],
    );
  const criterionHead = (c: Node): Cell => headCell(c, c.role === 'muted' ? 'muted' : 'label', mark);
  const cellOf = (o: Node, c: Node): Cell => {
    const all = d.cells.filter((x) => x.option === o.id && x.criterion === c.id);
    const cell = all.find((x) => x.change !== 'removed') ?? all[0];
    if (!cell) return [[{ text: '–', token: 'note' }]];
    const old = all.length > 1 ? all.find((x) => x.change === 'removed') : undefined;
    const sign: Seg[] =
      cell.role === 'happy'
        ? [{ text: theme.ascii ? '+ ' : '✓ ', token: 'happy' }]
        : cell.role === 'error'
          ? [{ text: theme.ascii ? 'x ' : '✗ ', token: 'error' }]
          : cell.role === undefined && cell.note
            ? [{ text: theme.ascii ? 'o ' : '○ ', token: 'label' }]
            : [];
    const token =
      changeToken(cell.change) ??
      (cell.role === 'muted' ? 'muted' : cell.role === 'happy' ? 'happy' : cell.role === 'error' ? 'error' : 'label');
    return [
      ...(old ? [[{ text: old.value ?? '', token: 'removed' as const }]] : []),
      [
        ...sign,
        { text: cell.value ?? '', token },
        ...mark({ type: 'prop', node: o.id, key: c.id }).flatMap((m) => [space, m]),
      ],
      ...(cell.note ? [[{ text: cell.note, token: 'note' as const }]] : []),
    ];
  };
  if (d.direction === 'down') {
    return {
      head: [[[]], ...d.criteria.map(criterionHead)],
      rows: d.options.map((o) => ({ cells: [optionHead(o), ...d.criteria.map((c) => cellOf(o, c))] })),
    };
  }
  const rowsFor = (criteria: Node[]): Row[] =>
    criteria.map((c) => ({ cells: [criterionHead(c), ...d.options.map((o) => cellOf(o, c))] }));
  const loose = d.criteria.filter((c) => c.group === undefined);
  const banded = d.categories.flatMap((g, gi): Row[] => {
    const members = d.criteria.filter((c) => c.group === gi);
    return members.length ? [{ band: [{ text: g.label, token: 'heading' }] }, ...rowsFor(members)] : [];
  });
  return { head: [[[]], ...d.options.map(optionHead)], rows: [...rowsFor(loose), ...banded] };
}

function headCell(n: Node, token: Token, mark: Markers, before: Seg[] = []): Cell {
  const space: Seg = { text: ' ', token: 'text' };
  const marks = mark({ type: 'node', id: n.id }).flatMap((m) => [space, m]);
  const was = renameOf(n);
  if (was === undefined) return [[...before, { text: n.label, token: changeToken(n.change) ?? token }, ...marks]];
  return [
    [{ text: signedText(was, 'removed'), token: 'removed' }],
    [...before, { text: signedText(n.label, 'added'), token: 'added' }, ...marks],
  ];
}

function usesOf(edges: Dependency['edges']): { uses: Set<string>; weak: Set<string> } {
  const uses = new Set<string>();
  const weak = new Set<string>();
  for (const e of edges) {
    const add = (from: string, to: string, hollow: boolean): void => {
      const key = `${from}>${to}`;
      if (hollow && !uses.has(key)) weak.add(key);
      else {
        uses.add(key);
        weak.delete(key);
      }
    };
    add(e.from, e.to, e.arrow === '-->');
    if (e.arrow === '<->') add(e.to, e.from, false);
  }
  return { uses, weak };
}

function dependencyTable(d: Dependency, theme: Theme, mark: Markers): { head: Cell[]; rows: Row[] } {
  const before = usesOf(d.edges.filter((e) => e.change !== 'added'));
  const after = usesOf(d.edges.filter((e) => e.change !== 'removed'));
  const glyph = (u: { uses: Set<string>; weak: Set<string> }, key: string): string | undefined =>
    u.uses.has(key) ? (theme.ascii ? '*' : '■') : u.weak.has(key) ? (theme.ascii ? 'o' : '□') : undefined;
  const headOf = (n: Node): Cell =>
    headCell(n, n.role === 'focus' ? 'focus-label' : n.role === 'muted' ? 'muted' : 'strong', mark);
  const markOf = (from: Node, to: Node): Cell => {
    const key = `${from.id}>${to.id}`;
    if (from.id === to.id) return [[{ text: '·', token: 'note' }]];
    const was = glyph(before, key);
    const now = glyph(after, key);
    if (was === now) return [[{ text: now ?? '', token: now === (theme.ascii ? 'o' : '□') ? 'note' : 'label' }]];
    return [
      [
        ...(was === undefined ? [] : [{ text: `−${was}`, token: 'removed' as const }]),
        ...(was !== undefined && now !== undefined ? [{ text: ' ', token: 'text' as const }] : []),
        ...(now === undefined ? [] : [{ text: `+${now}`, token: 'added' as const }]),
      ],
    ];
  };
  return {
    head: [[[{ text: '', token: 'text' }]], ...d.nodes.map(headOf)],
    rows: d.nodes.map((row) => ({ cells: [headOf(row), ...d.nodes.map((col) => markOf(row, col))] })),
  };
}

export function legendLines(legend: readonly Line[], width: number, theme: Theme): string[] {
  return legend.flatMap((line) =>
    wrapLine(line, width - 3).map((l, i) => (i ? '   ' : '') + l.map((s) => paint(theme, s.token, s.text)).join('')),
  );
}
