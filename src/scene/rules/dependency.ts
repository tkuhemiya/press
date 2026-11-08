import type { Role } from '../../model.ts';
import { INK, ROLE } from '../tokens.ts';
import { linesMark, look, parsePath, type Rule } from '../marks.ts';

const LINE_BOX: Record<Role | 'none', { fill?: string; stroke?: string; sw?: number }> = {
  none: {},
  focus: { fill: ROLE.focus.fill, stroke: ROLE.focus.line, sw: 2 },
  happy: {},
  error: {},
  muted: { stroke: INK.mutedLine, sw: 1.2 },
};

const markInk = (role: Role | undefined): string =>
  role === 'focus' ? ROLE.focus.line : role === 'muted' ? INK.mutedInk : INK.ink2;

export const dependency: Rule = (item, ctx) => {
  const { has, within } = look(item, ctx);
  if (!within('pr-dependency')) return undefined;
  const key = ctx.role ?? 'none';

  if (item.type === 'rect') {
    if (within('pr-band'))
      return { k: 'rect', x: item.x, y: item.y, w: item.w, h: item.h, r: item.r, fill: INK.groupFill };
    if (has('pr-cycle-box'))
      return { k: 'rect', x: item.x, y: item.y, w: item.w, h: item.h, r: item.r, stroke: INK.ink, sw: 1.6 };
    if (has('pr-line-box'))
      return { k: 'rect', x: item.x, y: item.y, w: item.w, h: item.h, r: item.r, ...LINE_BOX[key] };
    if (has('pr-mark')) {
      const ink = markInk(ctx.role);
      return has('pr-weak')
        ? { k: 'rect', x: item.x, y: item.y, w: item.w, h: item.h, r: item.r, stroke: ink, sw: 1.5 }
        : { k: 'rect', x: item.x, y: item.y, w: item.w, h: item.h, r: item.r, fill: ink };
    }
    if (has('pr-cell-box')) {
      if (key === 'focus')
        return { k: 'rect', x: item.x, y: item.y, w: item.w, h: item.h, r: item.r, fill: ROLE.focus.fill };
      return undefined;
    }
    return undefined;
  }
  if (item.type === 'path' && has('pr-rule')) return { k: 'path', segs: parsePath(item.d), stroke: INK.rule, sw: 1 };
  if (item.type === 'lines') {
    if (has('pr-head'))
      return linesMark(item, { size: 13, weight: 600, fill: ctx.role === 'muted' ? INK.mutedInk : INK.edge }, 'middle');
    if (has('pr-row-head'))
      return linesMark(item, { size: 13, weight: 500, fill: ctx.role === 'muted' ? INK.mutedInk : INK.ink2 }, 'start');
    if (has('pr-caption')) return linesMark(item, { size: 11.5, weight: 400, fill: INK.ink3 }, 'start');
  }
  return undefined;
};
