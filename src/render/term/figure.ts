import type { Direction, Node, Tradeoffs } from '../../model.ts';
import type { Figure } from '../../parse/document.ts';
import { view } from '../../diagrams/diagram.ts';
import { htmlInlines } from '../blocks.ts';
import {
  architectureGraph,
  causalLoopGraph,
  decisionTreeGraph,
  directionsFor,
  erGraph,
  loopLegend,
  stateMachineGraph,
  type Ctx,
} from './diagrams.ts';
import { wrapLine } from './flow.ts';
import { drawGraph, type Line, type Seg, type TermGraph } from './graph.ts';
import { inlineLine } from './inline.ts';
import { drawSequence, sequenceList } from './sequence.ts';
import { markers, stepMark, type Markers } from './style.ts';
import { drawTable, type Cell, type Row } from './table.ts';
import { paint, type Theme } from './theme.ts';
import { drawTimeline } from './timeline.ts';

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
  const d = f.diagram;
  const ctx = (maxLabel: number): Ctx => ({ theme, mark, maxLabel });
  const turnable = view(d).turnable();
  const graph = (build: (c: Ctx) => TermGraph, dirs: Direction[]): string[] => {
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
      return graph((c) => architectureGraph(d, c), directionsFor(d.direction, turnable));
    case 'decision-tree':
      return graph((c) => decisionTreeGraph(d, c), directionsFor(d.direction, turnable));
    case 'causal-loop':
      return graph((c) => causalLoopGraph(d, c), ['down', 'right']);
    case 'er':
      return graph((c) => erGraph(d, c), directionsFor(d.direction, true));
    case 'sequence': {
      for (const maxLabel of LABELS) {
        const c = drawSequence(d, theme, mark, maxLabel);
        if (c.width() <= width) return c.render(theme);
      }
      return sequenceList(d, theme, mark).flatMap((l) => legendLines([l], width, theme));
    }
    case 'timeline':
      return drawTimeline(d, theme, mark, width).render(theme);
    case 'tradeoffs':
      return drawTable(tradeoffsTable(d, theme, mark), width).render(theme);
  }
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
  const optionHead = (o: Node): Cell => [
    [
      ...(o.role === 'focus' ? [{ text: theme.ascii ? '* ' : '★ ', token: 'focus-label' as const }] : []),
      { text: o.label, token: o.role === 'focus' ? 'focus-label' : o.role === 'muted' ? 'muted' : 'strong' },
      ...mark({ type: 'node', id: o.id }).flatMap((m) => [space, m]),
    ],
  ];
  const criterionHead = (c: Node): Cell => [
    [
      { text: c.label, token: c.role === 'muted' ? 'muted' : 'label' },
      ...mark({ type: 'node', id: c.id }).flatMap((m) => [space, m]),
    ],
  ];
  const cellOf = (o: Node, c: Node): Cell => {
    const cell = d.cells.find((x) => x.option === o.id && x.criterion === c.id);
    if (!cell) return [[{ text: '–', token: 'note' }]];
    const sign: Seg[] =
      cell.role === 'happy'
        ? [{ text: theme.ascii ? '+ ' : '✓ ', token: 'happy' }]
        : cell.role === 'error'
          ? [{ text: theme.ascii ? 'x ' : '✗ ', token: 'error' }]
          : cell.role === undefined && cell.note
            ? [{ text: theme.ascii ? 'o ' : '○ ', token: 'label' }]
            : [];
    const token =
      cell.role === 'muted' ? 'muted' : cell.role === 'happy' ? 'happy' : cell.role === 'error' ? 'error' : 'label';
    return [
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

export function legendLines(legend: readonly Line[], width: number, theme: Theme): string[] {
  return legend.flatMap((line) =>
    wrapLine(line, width - 3).map((l, i) => (i ? '   ' : '') + l.map((s) => paint(theme, s.token, s.text)).join('')),
  );
}
