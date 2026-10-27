// Draws a tradeoffs table: options against criteria, each cell a property whose role says how
// it compares. direction=right puts options across the top; direction=down puts them down
// the side. The recommended option ({role=focus}) is outlined as chosen, and groups of
// criteria draw as labelled bands.
//
// Options, criteria and cells are each a .pr-node, so steps, hovers and print markers address
// them as usual (a cell as `option.criterion`). A cell carries data-in="option criterion" so
// that highlighting its option or criterion keeps it in view.
import type { Diagram, DiagramNode, Property } from '../model.ts';
import { markers, type Box } from './graph.ts';
import { textWidth, wrap } from '../text/measure.ts';
import { esc, n, roleAttr, textBlock, type Rendered } from '../render/svg.ts';

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
  node: DiagramNode;
  lines: string[];
  // Index into Diagram.groups for a criterion in a category, else -1.
  group: number;
}

export function renderTradeoffs(d: Diagram, refMarkers: Map<string, string>, domId: string): Rendered {
  const byId = new Map(d.nodes.map((node) => [node.id, node]));
  const optionIds = new Set(d.props.map((p) => p.node));
  const criterionIds = new Set(d.props.map((p) => p.key));
  const item = (node: DiagramNode, max: number, bold: boolean): Item => ({ node, lines: wrap(node.label, FONT, max, bold ? 'sans600' : 'sans500'), group: -1 });
  const across = (d.direction ?? 'right') === 'right';
  const options = d.nodes.filter((node) => optionIds.has(node.id) && !criterionIds.has(node.id));
  const criteria = d.nodes.filter((node) => criterionIds.has(node.id));
  const cell = (o: string, c: string): Property | undefined => d.props.find((p) => p.node === o && p.key === c);

  // Columns and rows: options across and criteria down, or the other way round.
  const cols = (across ? options : criteria).map((node) => item(node, MAX_HEAD, true));
  const rows = (across ? criteria : options).map((node) => item(node, MAX_ROW_HEAD, false));
  for (const it of [...cols, ...rows]) if (criterionIds.has(it.node.id)) it.group = it.node.group;
  const at = (r: Item, c: Item): Property | undefined => (across ? cell(c.node.id, r.node.id) : cell(r.node.id, c.node.id));
  const valueLines = (p: Property | undefined): string[] => (p?.value ? wrap(p.value, CELL_FONT, MAX_CELL) : ['—']);
  const lineW = (lines: string[], size: number, face: 'sans400' | 'sans500' | 'sans600' = 'sans400') => Math.max(0, ...lines.map((l) => textWidth(l, size, face)));

  // Sizes.
  const headW = Math.ceil(Math.max(80, ...rows.map((r) => lineW(r.lines, FONT, 'sans500'))) + 2 * PAD_X);
  const colW = cols.map((c) => Math.ceil(Math.max(MIN_COL, lineW(c.lines, FONT, 'sans600'), ...rows.map((r) => lineW(valueLines(at(r, c)), CELL_FONT) + MARK + 6)) + 2 * PAD_X));
  const headH = Math.max(0, ...cols.map((c) => c.lines.length)) * LINE + 2 * PAD_Y + 2;
  const rowH = rows.map((r) => Math.max(r.lines.length * LINE, ...cols.map((c) => valueLines(at(r, c)).length * LINE)) + 2 * PAD_Y);

  // Bands: a category's band label takes a row of its own when criteria run down the side,
  // and a strip above the headers when they run across.
  const bandAbove = !across && cols.some((c) => c.group >= 0) ? BAND : 0;
  const top = MARGIN + bandAbove;
  const rowY: number[] = [];
  const bandRows: { group: number; y: number }[] = [];
  let y = top + headH;
  rows.forEach((r, i) => {
    if (r.group >= 0 && (i === 0 || rows[i - 1].group !== r.group)) {
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
  out.push(`<svg class="pr-svg pr-tradeoffs" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">`);
  out.push(`<defs><pattern id="${domId}-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" class="pr-hatch"/></pattern></defs>`);

  // Category bands, behind everything.
  for (const b of bandRows) {
    const members = rows.filter((r) => r.group === b.group);
    const last = rows.indexOf(members[members.length - 1]);
    out.push(`<g class="pr-group pr-band"><rect x="${MARGIN}" y="${n(b.y)}" width="${n(x - MARGIN)}" height="${n(rowY[last] + rowH[last] - b.y)}" rx="6"/><text x="${n(MARGIN + 10)}" y="${n(b.y + 17)}">${esc(d.groups[b.group].label)}</text></g>`);
  }
  if (bandAbove) {
    for (let i = 0; i < cols.length; ) {
      const g = cols[i].group;
      let j = i;
      while (j + 1 < cols.length && cols[j + 1].group === g) j++;
      if (g >= 0) out.push(`<g class="pr-group pr-band"><rect x="${n(colX[i])}" y="${MARGIN}" width="${n(colX[j] + colW[j] - colX[i])}" height="${n(tableBottom - MARGIN)}" rx="6"/><text x="${n(colX[i] + 10)}" y="${MARGIN + 17}">${esc(d.groups[g].label)}</text></g>`);
      i = j + 1;
    }
  }

  // Rule lines between rows.
  const rules = [top + headH, ...rowY.slice(1)].map((ry) => `M${MARGIN},${n(ry)}H${n(x)}`).join('');
  out.push(`<path class="pr-rule" d="${rules}"/>`);

  // Headers: a column's .pr-box spans the whole column and a row's the whole row, so that
  // highlighting an option or criterion outlines everything it covers.
  cols.forEach((c, i) => {
    const node = c.node;
    const box = { x: colX[i], y: top, w: colW[i], h: tableBottom - top };
    boxes.set(node.id, { x: colX[i], y: top, w: colW[i], h: headH });
    const kind = optionIds.has(node.id) ? 'pr-option' : 'pr-criterion';
    out.push(`<g class="pr-node pr-col ${kind}" data-node="${esc(node.id)}" id="${domId}-node-${esc(node.id)}"${roleAttr(node.role)}><rect class="pr-box pr-line-box" x="${n(box.x)}" y="${n(box.y)}" width="${n(box.w)}" height="${n(box.h)}" rx="8"/>${textBlock(c.lines, colX[i] + colW[i] / 2, top + headH / 2, LINE, 'pr-label pr-head')}</g>`);
  });
  rows.forEach((r, i) => {
    const node = r.node;
    boxes.set(node.id, { x: MARGIN, y: rowY[i], w: headW, h: rowH[i] });
    const kind = optionIds.has(node.id) ? 'pr-option' : 'pr-criterion';
    out.push(`<g class="pr-node pr-row ${kind}" data-node="${esc(node.id)}" id="${domId}-node-${esc(node.id)}"${roleAttr(node.role)}><rect class="pr-box pr-line-box" x="${MARGIN}" y="${n(rowY[i])}" width="${n(x - MARGIN)}" height="${n(rowH[i])}" rx="6"/>${textBlock(r.lines, MARGIN + PAD_X, rowY[i] + rowH[i] / 2, LINE, 'pr-label pr-start pr-row-head')}</g>`);
  });

  // Cells.
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
      if (p?.role === 'error') s += `<rect class="pr-hatch-fill" x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="5" fill="url(#${domId}-hatch)"/>`;
      // A favourable value carries a filled dot before it, so it reads in grayscale too.
      const textX = p?.role === 'happy' ? cx + MARK / 2 + 2 : cx;
      if (p?.role === 'happy') s += `<circle class="pr-good" cx="${n(textX - lineW(lines, CELL_FONT) / 2 - MARK / 2 - 2)}" cy="${n(cy - ((lines.length - 1) * LINE) / 2)}" r="3.6"/>`;
      s += textBlock(lines, textX, cy, LINE, 'pr-value');
      out.push(s + '</g>');
    });
  });

  out.push(...markers(d, boxes, new Map(), refMarkers));
  out.push('</svg>');
  return { svg: out.join(''), width, height };
}
