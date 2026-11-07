import type { Role } from '../../model.ts';
import { linesMark, look, parsePath, type Rule } from '../marks.ts';
import { INK, ROLE } from '../tokens.ts';

interface Paint {
  fill?: string;
  stroke?: string;
  sw?: number;
}

const LINE_BOX: Record<Role | 'none', Paint> = {
  none: {},
  focus: { fill: ROLE.focus.fill, stroke: ROLE.focus.line, sw: 2 },
  happy: { fill: ROLE.happy.fill, stroke: ROLE.happy.line, sw: 2 },
  error: { fill: INK.paper, stroke: ROLE.error.line, sw: 1.6 },
  muted: { stroke: INK.mutedLine, sw: 1.2 },
};

const CELL_BOX: Record<Role | 'none', Paint> = {
  none: {},
  focus: { fill: ROLE.focus.fill, stroke: ROLE.focus.line, sw: 1.6 },
  happy: { fill: ROLE.happy.fill },
  error: { fill: ROLE.error.fill },
  muted: { stroke: INK.mutedLine, sw: 1.2 },
};

const headInk = (role: Role | undefined): string =>
  role === 'focus' ? ROLE.focus.line : role === 'muted' ? INK.mutedInk : INK.edge;

const rowInk = (role: Role | undefined): string => (role === 'muted' ? INK.mutedInk : INK.ink2);

const valueInk = (role: Role | undefined, missing: boolean): string => {
  if (role === 'error') return ROLE.error.line;
  if (role === 'muted') return INK.mutedInk;
  return missing ? INK.ink3 : INK.ink;
};

export const tradeoffs: Rule = (item, ctx) => {
  const { has, within } = look(item, ctx);
  if (!within('pr-tradeoffs')) return undefined;
  const key = ctx.role ?? 'none';

  if (item.type === 'rect') {
    if (within('pr-band'))
      return { k: 'rect', x: item.x, y: item.y, w: item.w, h: item.h, r: item.r, fill: INK.groupFill };
    if (has('pr-line-box'))
      return { k: 'rect', x: item.x, y: item.y, w: item.w, h: item.h, r: item.r, ...LINE_BOX[key] };
    if (has('pr-cell-box'))
      return { k: 'rect', x: item.x, y: item.y, w: item.w, h: item.h, r: item.r, ...CELL_BOX[key] };
    return undefined;
  }
  if (item.type === 'path' && has('pr-rule')) return { k: 'path', segs: parsePath(item.d), stroke: INK.rule, sw: 1 };
  if (item.type === 'circle') {
    const dot = { k: 'circle' as const, cx: item.cx, cy: item.cy, r: item.r };
    if (has('pr-good')) return { ...dot, fill: ROLE.happy.line };
    if (has('pr-caveat')) return { ...dot, stroke: INK.ink2, sw: 1.4 };
    return undefined;
  }
  if (item.type === 'lines') {
    if (has('pr-value'))
      return linesMark(item, { size: 13.5, weight: 400, fill: valueInk(ctx.role, within('pr-missing')) }, 'middle');
    if (has('pr-head')) return linesMark(item, { size: 14, weight: 600, fill: headInk(ctx.role) }, 'middle');
    if (has('pr-row-head')) return linesMark(item, { size: 14, weight: 500, fill: rowInk(ctx.role) }, 'start');
  }
  return undefined;
};
