import type { Cell, GroupId, Node, NodeId, NodeTarget, PropTarget, Step, Tradeoffs } from './model.ts';
import type { DiagramDef, RenderContext, Rendered } from './diagram.ts';
import type { Fence } from './grammar.ts';
import type { Reporter } from './diagnostics.ts';
import { GRAMMARS } from './grammars.ts';
import { buildGraph, header, resolvePartSteps, toNode } from './graph.ts';
import { trusted } from './brand.ts';
import { markers, type Box } from '../diagrams/graph.ts';
import { textWidth, wrap } from '../text/measure.ts';
import { esc, n, roleAttr, textBlock } from '../render/svg.ts';

export const TRADEOFFS: DiagramDef<'tradeoffs'> = {
  type: 'tradeoffs',
  name: 'Tradeoffs',
  grammar: GRAMMARS.tradeoffs,
  build,
  render,
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

interface Item {
  node: Node;
  lines: string[];
  option: boolean;
  group?: GroupId;
}

function render(d: Tradeoffs, context: RenderContext): Rendered {
  const { domId } = context;
  const item = (node: Node, max: number, bold: boolean, option: boolean): Item => {
    const it: Item = { node, lines: wrap(node.label, FONT, max, bold ? 'sans600' : 'sans500'), option };
    if (!option && node.group !== undefined) it.group = node.group;
    return it;
  };
  const across = (d.direction ?? 'right') === 'right';
  const cell = (o: NodeId, c: NodeId): Cell | undefined => d.cells.find((p) => p.option === o && p.criterion === c);

  const cols = across
    ? d.options.map((node) => item(node, MAX_HEAD, true, true))
    : d.criteria.map((node) => item(node, MAX_HEAD, true, false));
  const rows = across
    ? d.criteria.map((node) => item(node, MAX_ROW_HEAD, false, false))
    : d.options.map((node) => item(node, MAX_ROW_HEAD, false, true));
  const at = (r: Item, c: Item): Cell | undefined => (across ? cell(c.node.id, r.node.id) : cell(r.node.id, c.node.id));
  const valueLines = (p: Cell | undefined): string[] => (p?.value ? wrap(p.value, CELL_FONT, MAX_CELL) : ['—']);
  const lineW = (lines: string[], size: number, face: 'sans400' | 'sans500' | 'sans600' = 'sans400') =>
    Math.max(0, ...lines.map((l) => textWidth(l, size, face)));

  const headW = Math.ceil(Math.max(80, ...rows.map((r) => lineW(r.lines, FONT, 'sans500'))) + 2 * PAD_X);
  const colW = cols.map((c) =>
    Math.ceil(
      Math.max(
        MIN_COL,
        lineW(c.lines, FONT, 'sans600'),
        ...rows.map((r) => lineW(valueLines(at(r, c)), CELL_FONT) + MARK + 6),
      ) +
        2 * PAD_X,
    ),
  );
  const headH = Math.max(0, ...cols.map((c) => c.lines.length)) * LINE + 2 * PAD_Y + 2;
  const rowH = rows.map(
    (r) => Math.max(r.lines.length * LINE, ...cols.map((c) => valueLines(at(r, c)).length * LINE)) + 2 * PAD_Y,
  );

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

  const out: string[] = [];
  const boxes = new Map<string, Box>();
  out.push(
    `<svg class="pr-svg pr-tradeoffs" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">`,
  );
  out.push(
    `<defs><pattern id="${domId}-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" class="pr-hatch"/></pattern></defs>`,
  );

  for (const b of bandRows) {
    const last = rows.findLastIndex((r) => r.group === b.group);
    out.push(
      `<g class="pr-group pr-band"><rect x="${MARGIN}" y="${n(b.y)}" width="${n(x - MARGIN)}" height="${n(rowY[last] + rowH[last] - b.y)}" rx="6"/><text x="${n(MARGIN + 10)}" y="${n(b.y + 17)}">${esc(d.categories[b.group].label)}</text></g>`,
    );
  }
  if (bandAbove) {
    for (let i = 0; i < cols.length;) {
      const g = cols[i].group;
      let j = i;
      while (j + 1 < cols.length && cols[j + 1].group === g) j++;
      if (g !== undefined)
        out.push(
          `<g class="pr-group pr-band"><rect x="${n(colX[i])}" y="${MARGIN}" width="${n(colX[j] + colW[j] - colX[i])}" height="${n(tableBottom - MARGIN)}" rx="6"/><text x="${n(colX[i] + 10)}" y="${MARGIN + 17}">${esc(d.categories[g].label)}</text></g>`,
        );
      i = j + 1;
    }
  }

  const rules = [top + headH, ...rowY.slice(1)].map((ry) => `M${MARGIN},${n(ry)}H${n(x)}`).join('');
  out.push(`<path class="pr-rule" d="${rules}"/>`);

  cols.forEach((c, i) => {
    const node = c.node;
    const box = { x: colX[i], y: top, w: colW[i], h: tableBottom - top };
    boxes.set(node.id, { x: colX[i], y: top, w: colW[i], h: headH });
    const kind = c.option ? 'pr-option' : 'pr-criterion';
    out.push(
      `<g class="pr-node pr-col ${kind}" data-node="${esc(node.id)}" id="${domId}-node-${esc(node.id)}"${roleAttr(node.role)}><rect class="pr-box pr-line-box" x="${n(box.x)}" y="${n(box.y)}" width="${n(box.w)}" height="${n(box.h)}" rx="8"/>${textBlock(c.lines, colX[i] + colW[i] / 2, top + headH / 2, LINE, 'pr-label pr-head')}</g>`,
    );
  });
  rows.forEach((r, i) => {
    const node = r.node;
    boxes.set(node.id, { x: MARGIN, y: rowY[i], w: headW, h: rowH[i] });
    const kind = r.option ? 'pr-option' : 'pr-criterion';
    out.push(
      `<g class="pr-node pr-row ${kind}" data-node="${esc(node.id)}" id="${domId}-node-${esc(node.id)}"${roleAttr(node.role)}><rect class="pr-box pr-line-box" x="${MARGIN}" y="${n(rowY[i])}" width="${n(x - MARGIN)}" height="${n(rowH[i])}" rx="6"/>${textBlock(r.lines, MARGIN + PAD_X, rowY[i] + rowH[i] / 2, LINE, 'pr-label pr-start pr-row-head')}</g>`,
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
      const cx = colX[ci] + colW[ci] / 2;
      const cy = rowY[ri] + rowH[ri] / 2;
      let s = `<g class="pr-node pr-cell${p ? '' : ' pr-missing'}" data-node="${esc(id)}" data-in="${esc(o)} ${esc(k)}" id="${domId}-node-${esc(id)}"${roleAttr(p?.role)}>`;
      s += `<rect class="pr-box pr-cell-box" x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="5"/>`;
      if (p?.role === 'error')
        s += `<rect class="pr-hatch-fill" x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="5" fill="url(#${domId}-hatch)"/>`;
      const textX = p?.role === 'happy' ? cx + MARK / 2 + 2 : cx;
      if (p?.role === 'happy')
        s += `<circle class="pr-good" cx="${n(textX - lineW(lines, CELL_FONT) / 2 - MARK / 2 - 2)}" cy="${n(cy - ((lines.length - 1) * LINE) / 2)}" r="3.6"/>`;
      s += textBlock(lines, textX, cy, LINE, 'pr-value');
      out.push(s + '</g>');
    });
  });

  const refs = new Map(
    [
      ...[...d.options, ...d.criteria].map((node) => ({
        name: node.id,
        letter: context.marker({ type: 'node', id: node.id }),
      })),
      ...d.cells.map((c) => ({
        name: `${c.option}.${c.criterion}`,
        letter: context.marker({ type: 'prop', node: c.option, key: c.criterion }),
      })),
    ].flatMap(({ name, letter }) => (letter === undefined ? [] : [[name, letter] as const])),
  );
  out.push(...markers(d, boxes, new Map(), refs));
  out.push('</svg>');
  return { svg: trusted(out.join('')), width, height };
}
