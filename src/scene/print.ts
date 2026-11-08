import type { Attrs, Item, Scene } from './scene.ts';
import { changeIn, classesOf, moved, recolour, roleIn, type Context, type Mark, type Rule } from './marks.ts';
import { causalLoop } from './rules/causal-loop.ts';
import { er } from './rules/er.ts';
import { graph } from './rules/graph.ts';
import { sequence } from './rules/sequence.ts';
import { timeline } from './rules/timeline.ts';
import { classRule } from './rules/class.ts';
import { dependency } from './rules/dependency.ts';
import { tradeoffs } from './rules/tradeoffs.ts';
import { INK } from './tokens.ts';

export interface PrintScene {
  width: number;
  height: number;
  marks: Mark[];
}

const paneRule: Rule = (item) =>
  item.type === 'line' && classesOf(item.cls).includes('pr-pane-rule')
    ? {
        k: 'path',
        segs: [
          ['M', item.x1, item.y1],
          ['L', item.x2, item.y2],
        ],
        stroke: INK.rule,
        sw: 1,
      }
    : undefined;

const RULES: Rule[] = [paneRule, causalLoop, classRule, dependency, er, sequence, timeline, tradeoffs];

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
      } else {
        const classes = [...ctx.classes, ...classesOf(item.cls)];
        const mark = recolour(paint(item, ctx), ctx.change, classes);
        marks.push(
          moved(mark.k === 'text' && classes.includes('pr-struck') ? { ...mark, strike: true } : mark, dx, dy),
        );
      }
    }
  };
  walk(scene.items, { classes: new Set(['pr-svg', ...classesOf(scene.cls)]) }, 0, 0);
  return { width: scene.width, height: scene.height, marks };
}
