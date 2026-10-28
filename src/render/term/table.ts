import { canvas, type Canvas, type LineKind } from './canvas.ts';
import { wrapLine } from './flow.ts';
import { lineWidth, type Line } from './graph.ts';
import type { Token } from './theme.ts';

export type Cell = Line[];

export type Row = { cells: Cell[] } | { band: Line };

export interface Table {
  head: Cell[];
  rows: Row[];
  align?: ('left' | 'right' | 'center')[];
}

const MIN = 6;

const natural = (cell: Cell): number => Math.max(1, ...cell.map(lineWidth));
const longestWord = (cell: Cell): number =>
  Math.max(1, ...cell.flatMap((l) => l.flatMap((s) => s.text.split(/\s+/).map((w) => w.length))));

function columnWidths(t: Table, width: number): number[] {
  const cols = t.head.length;
  const all = [t.head, ...t.rows.flatMap((r) => ('cells' in r ? [r.cells] : []))];
  const widths = Array.from({ length: cols }, (_, i) => Math.max(...all.map((cells) => natural(cells[i] ?? []))));
  const floor = Array.from({ length: cols }, (_, i) =>
    Math.min(widths[i], Math.max(MIN, Math.min(16, ...all.map((cells) => longestWord(cells[i] ?? []))))),
  );
  const total = (): number => widths.reduce((a, b) => a + b, 0) + 3 * cols + 1;
  while (total() > width) {
    let widest = -1;
    for (let i = 0; i < cols; i++) if (widths[i] > floor[i] && (widest < 0 || widths[i] > widths[widest])) widest = i;
    if (widest < 0) break;
    widths[widest]--;
  }
  return widths;
}

export function drawTable(t: Table, width: number, frame: Token = 'line'): Canvas {
  const widths = columnWidths(t, width);
  const c = canvas();
  const xs = widths.reduce<number[]>((acc, w) => [...acc, (acc.at(-1) ?? 0) + w + 3], [0]);
  const right = xs.at(-1) ?? 0;
  const wrapCell = (cell: Cell, w: number): Line[] => cell.flatMap((l) => wrapLine(l, w));
  const kind: LineKind = 'light';
  let y = 0;
  const rule = (): void => {
    c.path(
      [
        { x: 0, y },
        { x: right, y },
      ],
      kind,
      frame,
    );
    y++;
  };
  const verticals = (from: number, to: number, inner: boolean): void => {
    xs.forEach((x, i) => {
      if (!inner && i > 0 && i < xs.length - 1) return;
      c.path(
        [
          { x, y: from },
          { x, y: to },
        ],
        kind,
        frame,
      );
    });
  };
  const writeRow = (cells: Cell[]): void => {
    const wrapped = cells.map((cell, i) => wrapCell(cell, widths[i] ?? MIN));
    const h = Math.max(1, ...wrapped.map((w) => w.length));
    verticals(y - 1, y + h, true);
    wrapped.forEach((lines, i) => {
      const w = widths[i] ?? MIN;
      lines.forEach((line, k) => {
        const lw = lineWidth(line);
        const align = t.align?.[i] ?? 'left';
        const pad = align === 'right' ? w - lw : align === 'center' ? Math.floor((w - lw) / 2) : 0;
        let x = (xs[i] ?? 0) + 2 + pad;
        for (const s of line) {
          c.text(x, y + k, s.text, s.token);
          x += lineWidth([s]);
        }
      });
    });
    y += h;
  };
  rule();
  writeRow(t.head);
  rule();
  const multi = t.rows.some(
    (r) => 'cells' in r && r.cells.some((cell, i) => wrapCell(cell, widths[i] ?? MIN).length > 1),
  );
  t.rows.forEach((r, i) => {
    const prev = t.rows[i - 1];
    if ('band' in r) {
      if (i > 0) rule();
      verticals(y - 1, y + 1, false);
      let x = 2;
      for (const s of r.band) {
        c.text(x, y, s.text, s.token);
        x += lineWidth([s]);
      }
      y++;
      rule();
      return;
    }
    if (multi && prev && 'cells' in prev) rule();
    writeRow(r.cells);
  });
  rule();
  return c;
}
