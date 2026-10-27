import type { Item, Scene } from './scene.ts';
import { classesOf, roleIn, type Context, type Mark, type Rule } from './marks.ts';
import { graph } from './rules/graph.ts';

export interface PrintScene {
  width: number;
  height: number;
  marks: Mark[];
}

const RULES: Rule[] = [];

const paint = (item: Parameters<Rule>[0], ctx: Context): Mark =>
  RULES.reduce<Mark | undefined>((found, rule) => found ?? rule(item, ctx), undefined) ?? graph(item, ctx);

export function printScene(scene: Scene): PrintScene {
  const marks: Mark[] = [];
  const walk = (items: readonly Item[], ctx: Context): void => {
    for (const item of items) {
      if (item.type === 'group') {
        const role = roleIn(item.attrs) ?? ctx.role;
        const inner: Context = { classes: new Set([...ctx.classes, ...classesOf(item.cls)]) };
        if (role) inner.role = role;
        walk(item.items, inner);
      } else marks.push(paint(item, ctx));
    }
  };
  walk(scene.items, { classes: new Set(['pr-svg', ...classesOf(scene.cls)]) });
  return { width: scene.width, height: scene.height, marks };
}
