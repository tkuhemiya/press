import { ROLES, type Role } from '../model.ts';
import type { Attrs, Item } from './scene.ts';
import { INK, ROLE } from './tokens.ts';

export type Seg = ['M', number, number] | ['L', number, number] | ['C', ...number[]] | ['Q', ...number[]] | ['Z'];

export interface Stroke {
  stroke?: string;
  sw?: number;
  dash?: number[];
  cap?: 'round' | 'butt';
}

export type Mark =
  | ({ k: 'rect'; x: number; y: number; w: number; h: number; r: number; fill?: string; hatch?: string } & Stroke)
  | ({ k: 'circle'; cx: number; cy: number; r: number; fill?: string } & Stroke)
  | ({ k: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fill?: string } & Stroke)
  | ({ k: 'path'; segs: Seg[]; fill?: string } & Stroke)
  | {
      k: 'text';
      x: number;
      y: number;
      lines: readonly string[];
      lh: number;
      size: number;
      weight: number;
      fill: string;
      anchor: 'middle' | 'start';
      italic?: boolean;
      tracking?: number;
      upper?: boolean;
    };

export type Leaf = Exclude<Item, { type: 'group' }>;

export interface Context {
  classes: ReadonlySet<string>;
  role?: Role;
}

export type Rule = (item: Leaf, ctx: Context) => Mark | undefined;

export const GLYPH_LINE: Stroke = { stroke: INK.ink2, sw: 1.3, cap: 'round' };
export const DASH: Stroke = { dash: [4, 3] };

export const classesOf = (cls: string | undefined): string[] => (cls ? cls.split(' ') : []);

export const roleIn = (attrs: Attrs | undefined): Role | undefined => {
  const value = attrs?.find(([k]) => k === 'data-role')?.[1];
  return ROLES.find((r) => r === value);
};

export function look(item: Leaf, ctx: Context): { has: (c: string) => boolean; within: (c: string) => boolean } {
  const own = new Set(classesOf(item.cls));
  return { has: (c) => own.has(c), within: (c) => ctx.classes.has(c) };
}

export function linesMark(
  item: Extract<Leaf, { type: 'lines' }>,
  style: { size: number; weight: number; fill: string },
  anchor: 'middle' | 'start',
): Mark {
  const top = item.cy - ((item.lines.length - 1) * item.lineHeight) / 2;
  return { k: 'text', x: item.x, y: top + 0.35 * style.size, lines: item.lines, lh: item.lineHeight, anchor, ...style };
}

export function nodeBox(role: Role | undefined, outcome: boolean): { fill: string; stroke: string; sw: number } {
  const base = { fill: outcome ? INK.groupFill : INK.nodeFill, stroke: INK.nodeLine, sw: outcome ? 1.6 : 1.2 };
  if (role === 'focus' || role === 'happy') return { fill: ROLE[role].fill, stroke: ROLE[role].line, sw: 2 };
  if (role === 'error') return { fill: INK.paper, stroke: ROLE.error.line, sw: 1.6 };
  if (role === 'muted') return { ...base, stroke: INK.mutedLine };
  return base;
}

export function edgeLabel(role: Role | undefined): { size: number; weight: number; fill: string } {
  if (role === 'muted') return { size: 12.5, weight: 400, fill: INK.mutedInk };
  if (role) return { size: 12.5, weight: 500, fill: ROLE[role].line };
  return { size: 12.5, weight: 400, fill: INK.ink2 };
}

const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, h: 1, v: 1, C: 6, Q: 4, Z: 0, A: 7 };

export function parsePath(d: string): Seg[] {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const segs: Seg[] = [];
  let x = 0;
  let y = 0;
  let i = 0;
  while (i < tokens.length) {
    const op = tokens[i++];
    const arity = ARITY[op];
    if (arity === undefined) throw new Error(`Path command ${op} is not supported in print yet.`);
    do {
      const v = tokens.slice(i, i + arity).map(Number);
      i += arity;
      if (op === 'A') {
        segs.push(...arcSegs(x, y, v));
        [x, y] = [v[5], v[6]];
      } else {
        if (op === 'M' || op === 'L') [x, y] = [v[0], v[1]];
        else if (op === 'H') x = v[0];
        else if (op === 'h') x += v[0];
        else if (op === 'V') y = v[0];
        else if (op === 'v') y += v[0];
        else if (op === 'C' || op === 'Q') [x, y] = v.slice(-2);
        if (op === 'Z') segs.push(['Z']);
        else if (op === 'H' || op === 'V' || op === 'h' || op === 'v') segs.push(['L', x, y]);
        else if (op === 'M' || op === 'L') segs.push([op, x, y]);
        else if (op === 'C' || op === 'Q') segs.push([op, ...v]);
      }
    } while (arity > 0 && i < tokens.length && !/[A-Za-z]/.test(tokens[i]));
  }
  return segs;
}

const TAU = 2 * Math.PI;

function angleBetween(ux: number, uy: number, vx: number, vy: number): number {
  const cos = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy));
  const angle = Math.acos(Math.max(-1, Math.min(1, cos)));
  return ux * vy - uy * vx < 0 ? -angle : angle;
}

function arcSegs(x1: number, y1: number, [rx0, ry0, degrees, large, sweep, x2, y2]: number[]): Seg[] {
  if (x1 === x2 && y1 === y2) return [];
  if (rx0 === 0 || ry0 === 0) return [['L', x2, y2]];
  const phi = (degrees * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const hx = (x1 - x2) / 2;
  const hy = (y1 - y2) / 2;
  const x1p = cosPhi * hx + sinPhi * hy;
  const y1p = -sinPhi * hx + cosPhi * hy;
  const lambda = (x1p * x1p) / (rx0 * rx0) + (y1p * y1p) / (ry0 * ry0);
  const grow = lambda > 1 ? Math.sqrt(lambda) : 1;
  const rx = rx0 * grow;
  const ry = ry0 * grow;
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;
  const start = angleBetween(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let sweepAngle = angleBetween((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (sweep === 0 && sweepAngle > 0) sweepAngle -= TAU;
  else if (sweep === 1 && sweepAngle < 0) sweepAngle += TAU;
  const count = Math.max(1, Math.ceil(Math.abs(sweepAngle) / (Math.PI / 2) - 1e-9));
  const step = sweepAngle / count;
  const alpha = (4 / 3) * Math.tan(step / 4);
  const toPoint = (px: number, py: number): [number, number] => [
    cosPhi * rx * px - sinPhi * ry * py + cx,
    sinPhi * rx * px + cosPhi * ry * py + cy,
  ];
  return Array.from({ length: count }, (_, k): Seg => {
    const t1 = start + k * step;
    const t2 = t1 + step;
    const [c1x, c1y] = toPoint(Math.cos(t1) - alpha * Math.sin(t1), Math.sin(t1) + alpha * Math.cos(t1));
    const [c2x, c2y] = toPoint(Math.cos(t2) + alpha * Math.sin(t2), Math.sin(t2) - alpha * Math.cos(t2));
    const [ex, ey] = toPoint(Math.cos(t2), Math.sin(t2));
    return ['C', c1x, c1y, c2x, c2y, ex, ey];
  });
}
