import type { Cell, GroupId, Node, NodeId, NodeTarget, Part, PropTarget, Step, Tradeoffs } from '../model.ts';
import type { DiagramDef, RenderContext, Rendered } from './diagram.ts';
import type { Fence } from '../parse/grammar.ts';
import type { Reporter } from '../diagnostics.ts';
import { buildGraph, header, nodeParts, resolvePartSteps, toNode } from '../parse/graph.ts';
import { trusted } from '../brand.ts';
import { hatchItems, markerItems, refMarkers, type Box, nodeTargets, propTargets } from './draw.ts';
import { textWidth, wrap } from '../text/measure.ts';
import { linesItem, n } from '../render/svg.ts';
import { attr, type Item, type Scene } from '../scene/scene.ts';
import { paintSvg } from '../scene/svg.ts';

export const TRADEOFFS: DiagramDef<'tradeoffs'> = {
  type: 'tradeoffs',
  name: 'Tradeoffs',
  build,
  render,
  targets: (d) => [
    ...nodeParts([...d.options, ...d.criteria]),
    ...d.cells.map((c) => {
      const part: Part = { target: { type: 'prop', node: c.option, key: c.criterion } };
      if (c.role) part.role = c.role;
      return part;
    }),
  ],
  turnable: (d) => d.direction === undefined,
};

function build(fence: Fence, report: Reporter): Tradeoffs {
  const { error, warn } = report;
  const graph = buildGraph(fence, report, {
    label: (id) => id.replace(/_/g, ' '),
    empty: 'Add at least one edge, e.g. `a -> b : label`.',
    chain(s) {
      for (let i = 0; i + 1 < s.ends.length; i++) {
        const from = s.ends[i].node;
        const to = s.ends[i + 1].node;
        error(
          s.line,
          'A tradeoffs table has no edges.',
          `Compare with a cell instead: \`${from}.${to} : value\`, read as "what ${from} offers on ${to}".`,
        );
      }
      return true;
    },
    prop(s, owner, isNew, ensure) {
      if (isNew) delete owner.group;
      const criterion = ensure(s.key, s.line, s.group);
      if (s.group !== undefined && criterion.group === undefined) criterion.group = s.group;
    },
  });
  const { props } = graph;
  const optionIds = new Set(props.map((p) => p.node));
  const criterionIds = new Set(props.map((p) => p.key));
  for (const id of optionIds) {
    const p = props.find((q) => q.key === id);
    if (!p) continue;
    error(
      p.line,
      `\`${id}\` is used both as an option (left of the dot) and as a criterion (right of it).`,
      'Options go on the left, criteria on the right: `option.criterion : value`.',
    );
  }
  for (const node of graph.nodes) {
    if (!optionIds.has(node.id) && !criterionIds.has(node.id))
      warn(
        node.line,
        `\`${node.id}\` is declared but no cell uses it.`,
        `Add a cell such as \`${node.id}.criterion : value\`, or remove the declaration.`,
      );
    if (optionIds.has(node.id) && node.group !== undefined)
      warn(
        node.line,
        `\`${node.id}\` is an option, but groups in a tradeoffs table hold criteria.`,
        'Group criteria into categories; list options outside any group.',
      );
  }
  for (const o of optionIds) {
    const missing = [...criterionIds].filter((c) => !props.some((p) => p.node === o && p.key === c));
    if (!missing.length) continue;
    const last = Math.max(...props.filter((p) => p.node === o).map((p) => p.line));
    warn(
      last,
      `\`${o}\` has no value for ${missing.map((c) => `\`${c}\``).join(', ')}; ${missing.length > 1 ? 'those cells draw' : 'that cell draws'} as a dash.`,
      `Add ${missing.map((c) => `\`${o}.${c} : value\``).join(', ')}, or a value such as \`n/a\` with \`{role=muted}\`.`,
    );
  }

  const steps = resolvePartSteps(fence.steps, graph.nodes, [], { props, keyed: [] }, report).flatMap(
    (s): Step<NodeTarget | PropTarget>[] => (s.target.type === 'edge' ? [] : [{ ...s, target: s.target }]),
  );
  return {
    ...header(fence, 'tradeoffs'),
    options: graph.nodes.filter((node) => optionIds.has(node.id) && !criterionIds.has(node.id)).map(toNode),
    criteria: graph.nodes.filter((node) => criterionIds.has(node.id)).map(toNode),
    categories: graph.groups,
    cells: props.map((p): Cell => {
      const cell: Cell = { option: p.node, criterion: p.key, line: p.line };
      if (p.value !== undefined) cell.value = p.value;
      if (p.note !== undefined) cell.note = p.note;
      if (p.role) cell.role = p.role;
      return cell;
    }),
    steps,
  };
}

const MARGIN = 12;
const FONT = 14;
const LINE = 18;
const CELL_FONT = 13.5;
const PAD_X = 14;
const PAD_Y = 10;
const MAX_HEAD = 150;
const MAX_ROW_HEAD = 190;
const MAX_CELL = 150;
const MIN_COL = 104;
const BAND = 26;
const MARK = 10;
const NOTE_FONT = 11.5;
const NOTE_LINE = 15;

interface Member {
  node: Node;
  lines: string[];
  option: boolean;
  group?: GroupId;
}

const band = (label: string, b: Box): Item => ({
  type: 'group',
  cls: 'pr-group pr-band',
  items: [
    { type: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, r: 6 },
    { type: 'text', x: b.x + 10, y: b.y + 17, text: label },
  ],
});

const nodeGroup = (domId: string, node: Node, cls: string, items: Item[]): Item => ({
  type: 'group',
  cls,
  attrs: [['data-node', node.id], ['id', `${domId}-node-${node.id}`], ...attr('data-role', node.role)],
  items,
});

function render(d: Tradeoffs, context: RenderContext): Rendered {
  const { domId } = context;
  const member = (node: Node, max: number, bold: boolean, option: boolean): Member => {
    const it: Member = { node, lines: wrap(node.label, FONT, max, bold ? 'sans600' : 'sans500'), option };
    if (!option && node.group !== undefined) it.group = node.group;
    return it;
  };
  const across = (context.direction ?? d.direction ?? 'right') === 'right';
  const cell = (o: NodeId, c: NodeId): Cell | undefined => d.cells.find((p) => p.option === o && p.criterion === c);

  const cols = across
    ? d.options.map((node) => member(node, MAX_HEAD, true, true))
    : d.criteria.map((node) => member(node, MAX_HEAD, true, false));
  const rows = across
    ? d.criteria.map((node) => member(node, MAX_ROW_HEAD, false, false))
    : d.options.map((node) => member(node, MAX_ROW_HEAD, false, true));
  const at = (r: Member, c: Member): Cell | undefined =>
    across ? cell(c.node.id, r.node.id) : cell(r.node.id, c.node.id);
  const valueLines = (p: Cell | undefined): string[] => (p?.value ? wrap(p.value, CELL_FONT, MAX_CELL) : ['—']);
  const noteLines = (p: Cell | undefined): string[] => (p?.note ? wrap(p.note, NOTE_FONT, MAX_CELL) : []);
  const cellH = (p: Cell | undefined): number => valueLines(p).length * LINE + noteLines(p).length * NOTE_LINE;
  const lineW = (lines: string[], size: number, face: 'sans400' | 'sans500' | 'sans600' = 'sans400') =>
    Math.max(0, ...lines.map((l) => textWidth(l, size, face)));

  const headW = Math.ceil(Math.max(80, ...rows.map((r) => lineW(r.lines, FONT, 'sans500'))) + 2 * PAD_X);
  const colW = cols.map((c) =>
    Math.ceil(
      Math.max(
        MIN_COL,
        lineW(c.lines, FONT, 'sans600'),
        ...rows.map((r) => lineW(valueLines(at(r, c)), CELL_FONT) + MARK + 6),
        ...rows.map((r) => lineW(noteLines(at(r, c)), NOTE_FONT)),
      ) +
        2 * PAD_X,
    ),
  );
  const headH = Math.max(0, ...cols.map((c) => c.lines.length)) * LINE + 2 * PAD_Y + 2;
  const rowH = rows.map((r) => Math.max(r.lines.length * LINE, ...cols.map((c) => cellH(at(r, c)))) + 2 * PAD_Y);

  const bandAbove = !across && cols.some((c) => c.group !== undefined) ? BAND : 0;
  const top = MARGIN + bandAbove;
  const rowY: number[] = [];
  const bandRows: { group: GroupId; y: number }[] = [];
  let y = top + headH;
  rows.forEach((r, i) => {
    if (r.group !== undefined && (i === 0 || rows[i - 1].group !== r.group)) {
      bandRows.push({ group: r.group, y });
      y += BAND;
    }
    rowY.push(y);
    y += rowH[i];
  });
  const height = Math.ceil(y + MARGIN);
  const colX: number[] = [];
  let x = MARGIN + headW;
  for (const w of colW) {
    colX.push(x);
    x += w;
  }
  const width = Math.ceil(x + MARGIN);
  const tableBottom = y;

  const items: Item[] = [];
  const boxes = new Map<string, Box>();

  for (const b of bandRows) {
    const last = rows.findLastIndex((r) => r.group === b.group);
    items.push(
      band(d.categories[b.group].label, { x: MARGIN, y: b.y, w: x - MARGIN, h: rowY[last] + rowH[last] - b.y }),
    );
  }
  if (bandAbove) {
    for (let i = 0; i < cols.length;) {
      const g = cols[i].group;
      let j = i;
      while (j + 1 < cols.length && cols[j + 1].group === g) j++;
      if (g !== undefined)
        items.push(
          band(d.categories[g].label, {
            x: colX[i],
            y: MARGIN,
            w: colX[j] + colW[j] - colX[i],
            h: tableBottom - MARGIN,
          }),
        );
      i = j + 1;
    }
  }

  const rules = [top + headH, ...rowY.slice(1)].map((ry) => `M${MARGIN},${n(ry)}H${n(x)}`).join('');
  items.push({ type: 'path', cls: 'pr-rule', d: rules });

  cols.forEach((c, i) => {
    const box = { x: colX[i], y: top, w: colW[i], h: tableBottom - top };
    boxes.set(c.node.id, { x: colX[i], y: top, w: colW[i], h: headH });
    items.push(
      nodeGroup(domId, c.node, `pr-node pr-col ${c.option ? 'pr-option' : 'pr-criterion'}`, [
        { type: 'rect', cls: 'pr-box pr-line-box', x: box.x, y: box.y, w: box.w, h: box.h, r: 8 },
        linesItem(c.lines, colX[i] + colW[i] / 2, top + headH / 2, LINE, 'pr-label pr-head'),
      ]),
    );
  });
  rows.forEach((r, i) => {
    boxes.set(r.node.id, { x: MARGIN, y: rowY[i], w: headW, h: rowH[i] });
    items.push(
      nodeGroup(domId, r.node, `pr-node pr-row ${r.option ? 'pr-option' : 'pr-criterion'}`, [
        { type: 'rect', cls: 'pr-box pr-line-box', x: MARGIN, y: rowY[i], w: x - MARGIN, h: rowH[i], r: 6 },
        linesItem(r.lines, MARGIN + PAD_X, rowY[i] + rowH[i] / 2, LINE, 'pr-label pr-start pr-row-head'),
      ]),
    );
  });

  rows.forEach((r, ri) => {
    cols.forEach((c, ci) => {
      const p = at(r, c);
      const [o, k] = across ? [c.node.id, r.node.id] : [r.node.id, c.node.id];
      const id = `${o}.${k}`;
      const b = { x: colX[ci] + 3, y: rowY[ri] + 3, w: colW[ci] - 6, h: rowH[ri] - 6 };
      boxes.set(id, b);
      const lines = valueLines(p);
      const notes = noteLines(p);
      const cx = colX[ci] + colW[ci] / 2;
      const cy = rowY[ri] + rowH[ri] / 2 - (notes.length * NOTE_LINE) / 2;
      const cellItems: Item[] = [
        { type: 'rect', cls: 'pr-box pr-cell-box', x: b.x, y: b.y, w: b.w, h: b.h, r: 5 },
        ...hatchItems({ role: p?.role }, b, 5),
      ];
      const mark = p?.role === 'happy' ? 'pr-good' : notes.length && !p?.role ? 'pr-caveat' : undefined;
      const textX = mark ? cx + MARK / 2 + 2 : cx;
      if (mark)
        cellItems.push({
          type: 'circle',
          cls: mark,
          cx: textX - lineW(lines, CELL_FONT) / 2 - MARK / 2 - 2,
          cy: cy - ((lines.length - 1) * LINE) / 2,
          r: 3.6,
        });
      cellItems.push(linesItem(lines, textX, cy, LINE, 'pr-value'));
      if (notes.length)
        cellItems.push(
          linesItem(
            notes,
            cx,
            cy + ((lines.length + 1) * LINE) / 2 - 2 + ((notes.length - 1) * NOTE_LINE) / 2,
            NOTE_LINE,
            'pr-note pr-cell-note',
          ),
        );
      items.push({
        type: 'group',
        cls: `pr-node pr-cell${p ? '' : ' pr-missing'}`,
        attrs: [
          ['data-node', id],
          ['data-in', `${o} ${k}`],
          ['id', `${domId}-node-${id}`],
          ...attr('data-role', p?.role),
        ],
        items: cellItems,
      });
    });
  });

  const cells = d.cells.map((c) => ({ node: c.option, key: c.criterion }));
  items.push(
    ...markerItems(
      d,
      boxes,
      new Map(),
      refMarkers(context, [...nodeTargets([...d.options, ...d.criteria]), ...propTargets(cells)]),
    ),
  );
  const scene: Scene = { id: domId, cls: 'pr-tradeoffs', width, height, hatch: true, items };
  return { svg: trusted(paintSvg(scene)), width, height, scene };
}
