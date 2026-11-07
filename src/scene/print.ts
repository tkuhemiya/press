import type { Attrs, Item, Scene } from './scene.ts';
import { changeIn, classesOf, moved, recolour, roleIn, type Context, type Mark, type Rule } from './marks.ts';
import { causalLoop } from './rules/causal-loop.ts';
import { er } from './rules/er.ts';
import { graph } from './rules/graph.ts';
import { sequence } from './rules/sequence.ts';
import { timeline } from './rules/timeline.ts';
import { tradeoffs } from './rules/tradeoffs.ts';

export interface PrintScene {
  width: number;
  height: number;
  marks: Mark[];
}

const RULES: Rule[] = [causalLoop, er, sequence, timeline, tradeoffs];

const paint = (item: Parameters<Rule>[0], ctx: Context): Mark =>
  RULES.reduce<Mark | undefined>((found, rule) => found ?? rule(item, ctx), undefined) ?? graph(item, ctx);

const translateOf = (attrs: Attrs | undefined): [number, number] => {
  const value = attrs?.find(([k]) => k === 'transform')?.[1] ?? '';
  const m = /^translate\((-?[\d.e]+),(-?[\d.e]+)\)$/.exec(value);
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
};

export function printScene(scene: Scene): PrintScene {
  const marks: Mark[] = [];
  const walk = (items: readonly Item[], ctx: Context, dx: number, dy: number): void => {
    for (const item of items) {
      if (item.type === 'group') {
        const role = roleIn(item.attrs) ?? ctx.role;
        const change = changeIn(item.attrs) ?? ctx.change;
        const [tx, ty] = translateOf(item.attrs);
        const inner: Context = { classes: new Set([...ctx.classes, ...classesOf(item.cls)]) };
        if (role) inner.role = role;
        if (change) inner.change = change;
        walk(item.items, inner, dx + tx, dy + ty);
      } else
        marks.push(moved(recolour(paint(item, ctx), ctx.change, [...ctx.classes, ...classesOf(item.cls)]), dx, dy));
    }
  };
  walk(scene.items, { classes: new Set(['pr-svg', ...classesOf(scene.cls)]) }, 0, 0);
  return { width: scene.width, height: scene.height, marks };
}
