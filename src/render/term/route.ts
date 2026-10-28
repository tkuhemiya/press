import type { Point } from './canvas.ts';

export type Dir = 0 | 1 | 2 | 3;
const DIRS: readonly Dir[] = [0, 1, 2, 3];
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

export const step = (p: Point, d: Dir): Point => ({ x: p.x + DX[d], y: p.y + DY[d] });
export const opposite = (d: Dir): Dir => DIRS[(d + 2) % 4];
const isVertical = (d: Dir): boolean => d % 2 === 0;

type Use = 'h' | 'v' | 'x';

export interface Grid {
  block(p: Point): void;
  frame(p: Point, use: Use): void;
  free(p: Point): boolean;
  claim(path: readonly Point[]): void;
  route(from: Point, out: Dir, to: Point, into: Dir, loose?: boolean): Point[] | undefined;
}

const TURN = 4;
const CROSS = 6;
const FRAME = 2;
const BESIDE = 1;

export function grid(width: number, height: number): Grid {
  const key = (p: Point): number => p.y * width + p.x;
  const inside = (p: Point): boolean => p.x >= 0 && p.y >= 0 && p.x < width && p.y < height;
  const blocked = new Uint8Array(width * height);
  const used = new Map<number, Use>();
  const frames = new Map<number, Use>();

  const enter = (p: Point, d: Dir): number | undefined => {
    if (!inside(p)) return undefined;
    const k = key(p);
    if (blocked[k]) return undefined;
    const axis: Use = isVertical(d) ? 'v' : 'h';
    let cost = 1;
    const u = used.get(k);
    if (u !== undefined) {
      if (u === 'x' || u === axis) return undefined;
      cost += CROSS;
    }
    const f = frames.get(k);
    if (f !== undefined) {
      if (f === 'x' || f === axis) return undefined;
      cost += FRAME;
    }
    const sides = isVertical(d) ? [1, 3] : [0, 2];
    for (const s of sides) {
      const q = step(p, DIRS[s]);
      if (inside(q) && used.get(key(q)) === axis) cost += BESIDE;
    }
    return cost;
  };

  return {
    block(p) {
      if (inside(p)) blocked[key(p)] = 1;
    },
    frame(p, use) {
      if (inside(p)) frames.set(key(p), use);
    },
    free: (p) => inside(p) && !blocked[key(p)] && !used.has(key(p)),
    claim(path) {
      path.forEach((p, i) => {
        const prev = path[i - 1];
        const next = path[i + 1];
        const k = key(p);
        const was = used.get(k);
        const h = (prev && prev.y === p.y) || (next && next.y === p.y);
        const v = (prev && prev.x === p.x) || (next && next.x === p.x);
        const use: Use = was !== undefined || (h && v) || !prev || !next ? 'x' : h ? 'h' : 'v';
        used.set(k, use);
      });
    },
    route(from, out, to, into, loose = false) {
      if (!inside(from) || !inside(to)) return undefined;
      const states = width * height * 4;
      const cost = new Float64Array(states).fill(Infinity);
      const prev = new Int32Array(states).fill(-1);
      const heap: [number, number][] = [];
      const push = (f: number, s: number): void => {
        heap.push([f, s]);
        let i = heap.length - 1;
        while (i > 0) {
          const parent = (i - 1) >> 1;
          if (heap[parent][0] <= heap[i][0]) break;
          [heap[parent], heap[i]] = [heap[i], heap[parent]];
          i = parent;
        }
      };
      const pop = (): [number, number] | undefined => {
        const top = heap[0];
        const last = heap.pop();
        if (heap.length && last) {
          heap[0] = last;
          let i = 0;
          for (;;) {
            const l = 2 * i + 1;
            const r = l + 1;
            let m = i;
            if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
            if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
            if (m === i) break;
            [heap[m], heap[i]] = [heap[i], heap[m]];
            i = m;
          }
        }
        return top;
      };
      const h = (p: Point): number => Math.abs(p.x - to.x) + Math.abs(p.y - to.y);
      const start = key(from) * 4 + out;
      cost[start] = 0;
      push(h(from), start);
      let goal = -1;
      for (let item = pop(); item; item = pop()) {
        const [, s] = item;
        const k = s >> 2;
        const d = DIRS[s & 3];
        const p = { x: k % width, y: Math.floor(k / width) };
        if (p.x === to.x && p.y === to.y && (d === into || (loose && d !== opposite(into)))) {
          goal = s;
          break;
        }
        for (const nd of DIRS) {
          if (nd === opposite(d)) continue;
          const turning = nd !== d;
          if (turning && k !== key(from) && (used.has(k) || frames.has(k))) continue;
          const q = step(p, nd);
          const c = enter(q, nd);
          if (c === undefined) continue;
          const ns = key(q) * 4 + nd;
          const total = cost[s] + c + (turning ? TURN : 0);
          if (total < cost[ns]) {
            cost[ns] = total;
            prev[ns] = s;
            push(total + h(q), ns);
          }
        }
      }
      if (goal < 0) return undefined;
      const path: Point[] = [];
      for (let s = goal; s >= 0; s = prev[s]) {
        const k = s >> 2;
        const p = { x: k % width, y: Math.floor(k / width) };
        const last = path.at(-1);
        if (!last || last.x !== p.x || last.y !== p.y) path.push(p);
      }
      return path.reverse();
    },
  };
}
