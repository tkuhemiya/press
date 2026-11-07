import { graphemeWidth, splitGraphemes } from './cells.ts';
import { paint, type Theme, type Token } from './theme.ts';

export type LineKind = 'light' | 'round' | 'heavy' | 'double' | 'dashed' | 'dotted';

export const UP = 1;
export const RIGHT = 2;
export const DOWN = 4;
export const LEFT = 8;

interface Cell {
  ch?: string;
  arms: number;
  kind: LineKind;
  token: Token;
}

export interface Point {
  x: number;
  y: number;
}

const LIGHT = ' │─└││┌├─┘─┴┐┤┬┼';
const ROUND = ' │─╰││╭├─╯─┴╮┤┬┼';
const HEAVY = ' ┃━┗┃┃┏┣━┛━┻┓┫┳╋';
const DOUBLE = ' ║═╚║║╔╠═╝═╩╗╣╦╬';

const table = (kind: LineKind): string =>
  kind === 'heavy' ? HEAVY : kind === 'double' ? DOUBLE : kind === 'light' ? LIGHT : ROUND;

function glyph(arms: number, kind: LineKind, ascii: boolean): string {
  const vertical = (arms & (LEFT | RIGHT)) === 0;
  const horizontal = (arms & (UP | DOWN)) === 0;
  if (ascii) {
    if (horizontal)
      return kind === 'heavy' || kind === 'double' ? '=' : kind === 'dashed' || kind === 'dotted' ? '.' : '-';
    if (vertical) return kind === 'dashed' || kind === 'dotted' ? ':' : '|';
    return '+';
  }
  if (kind === 'dashed' && horizontal) return '╌';
  if (kind === 'dashed' && vertical) return '╎';
  if (kind === 'dotted' && horizontal) return '┈';
  if (kind === 'dotted' && vertical) return '┊';
  return table(kind).charAt(arms) || '┼';
}

export const ARROWS: Record<number, [string, string]> = {
  [UP]: ['▲', '^'],
  [RIGHT]: ['▶', '>'],
  [DOWN]: ['▼', 'v'],
  [LEFT]: ['◀', '<'],
};

export interface Canvas {
  readonly width: () => number;
  readonly height: () => number;
  text(x: number, y: number, text: string, token: Token): void;
  arms(x: number, y: number, arms: number, kind: LineKind, token: Token): void;
  path(points: readonly Point[], kind: LineKind, token: Token): void;
  box(x: number, y: number, w: number, h: number, kind: LineKind, token: Token): void;
  isEmpty(x: number, y: number): boolean;
  hasText(x: number, y: number): boolean;
  blit(other: Canvas, dx: number, dy: number): void;
  cells(): readonly (readonly (Cell | undefined)[])[];
  render(theme: Theme): string[];
}

export function canvas(): Canvas {
  const rows: (Cell | undefined)[][] = [];
  let w = 0;
  const at = (x: number, y: number): Cell => {
    const row = (rows[y] ??= []);
    w = Math.max(w, x + 1);
    return (row[x] ??= { arms: 0, kind: 'light', token: 'line' });
  };
  const get = (x: number, y: number): Cell | undefined => (x < 0 || y < 0 ? undefined : rows[y]?.[x]);
  const self: Canvas = {
    width: () => w,
    height: () => rows.length,
    text(x, y, text, token) {
      let cx = x;
      for (const g of splitGraphemes(text)) {
        const gw = graphemeWidth(g);
        if (gw === 0) continue;
        const cell = at(cx, y);
        cell.ch = g;
        cell.token = token;
        if (gw === 2) {
          const next = at(cx + 1, y);
          next.ch = '';
          next.token = token;
        }
        cx += gw;
      }
    },
    arms(x, y, arms, kind, token) {
      if (x < 0 || y < 0) return;
      const cell = at(x, y);
      if (cell.arms === 0 && cell.ch === undefined) {
        cell.kind = kind;
        cell.token = token;
      }
      cell.arms |= arms;
    },
    path(points, kind, token) {
      for (let i = 0; i + 1 < points.length; i++) {
        const a = points[i];
        const b = points[i + 1];
        const dx = Math.sign(b.x - a.x);
        const dy = Math.sign(b.y - a.y);
        let x = a.x;
        let y = a.y;
        while (x !== b.x || y !== b.y) {
          const out = dx > 0 ? RIGHT : dx < 0 ? LEFT : dy > 0 ? DOWN : UP;
          const back = dx > 0 ? LEFT : dx < 0 ? RIGHT : dy > 0 ? UP : DOWN;
          self.arms(x, y, out, kind, token);
          x += dx;
          y += dy;
          self.arms(x, y, back, kind, token);
        }
      }
    },
    box(x, y, bw, bh, kind, token) {
      self.path(
        [
          { x, y },
          { x: x + bw - 1, y },
          { x: x + bw - 1, y: y + bh - 1 },
          { x, y: y + bh - 1 },
          { x, y },
        ],
        kind,
        token,
      );
    },
    isEmpty: (x, y) => {
      const c = get(x, y);
      return c === undefined || (c.arms === 0 && c.ch === undefined);
    },
    hasText: (x, y) => get(x, y)?.ch !== undefined,
    blit(other, dx, dy) {
      other.cells().forEach((row, y) =>
        row.forEach((c, x) => {
          if (!c || x + dx < 0 || y + dy < 0) return;
          const cell = at(x + dx, y + dy);
          Object.assign(cell, c);
        }),
      );
    },
    cells: () => rows,
    render(theme) {
      return Array.from({ length: rows.length }, (_, y) => {
        const row = rows[y] ?? [];
        let out = '';
        let run = '';
        let runToken: Token = 'text';
        const flush = (): void => {
          out += paint(theme, runToken, run);
          run = '';
        };
        for (let x = 0; x < row.length; x++) {
          const c = row[x];
          const ch = !c ? ' ' : c.ch !== undefined ? c.ch : c.arms ? glyph(c.arms, c.kind, theme.ascii) : ' ';
          const token: Token = c && (c.ch !== undefined || c.arms) ? c.token : 'text';
          if (token !== runToken) {
            flush();
            runToken = token;
          }
          run += ch;
        }
        flush();
        return out.replace(/\s+$/, '');
      });
    },
  };
  return self;
}
