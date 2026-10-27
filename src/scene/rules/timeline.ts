import type { Role } from '../../model.ts';
import { INK, ROLE } from '../tokens.ts';
import { look, parsePath, type Context, type Leaf, type Mark, type Rule, type Stroke } from '../marks.ts';

const AXIS: Stroke = { stroke: INK.ink3, sw: 1.4 };
const TICK: Stroke = { stroke: INK.ink3, sw: 1.2 };
const STEM: Stroke = { stroke: INK.nodeLine, sw: 1.2 };
const GRID: Stroke = { stroke: INK.rule, sw: 1, dash: [2, 4] };

const dotPaint = (role: Role | undefined): { fill: string } & Stroke => {
  if (role === undefined) return { fill: INK.paper, stroke: INK.ink2, sw: 1.6 };
  if (role === 'muted') return { fill: INK.paper, stroke: INK.mutedLine, sw: 1.6 };
  return { fill: ROLE[role].line, stroke: ROLE[role].line, sw: 1.6 };
};

const spanPaint = (role: Role | undefined): { fill: string } & Stroke => {
  if (role === undefined) return { fill: INK.nodeLine };
  if (role === 'muted') return { fill: INK.mutedLine };
  return { fill: ROLE[role].line, stroke: ROLE[role].line, sw: 1 };
};

export const timeline: Rule = (item: Leaf, ctx: Context): Mark | undefined => {
  const { has, within } = look(item, ctx);
  if (!within('pr-timeline')) return undefined;
  const role = ctx.role;
  switch (item.type) {
    case 'rect': {
      const box = { k: 'rect' as const, x: item.x, y: item.y, w: item.w, h: item.h, r: item.r };
      if (within('pr-band')) return { ...box, fill: INK.groupFill };
      if (has('pr-span')) return { ...box, ...spanPaint(role) };
      return undefined;
    }
    case 'circle': {
      if (!has('pr-event-dot')) return undefined;
      return { k: 'circle', cx: item.cx, cy: item.cy, r: item.r, ...dotPaint(role) };
    }
    case 'path': {
      const segs = parsePath(item.d);
      if (has('pr-stem')) return { k: 'path', segs, ...STEM };
      if (has('pr-axis-line')) return { k: 'path', segs, ...AXIS };
      if (has('pr-axis-head')) return { k: 'path', segs, fill: INK.ink3 };
      if (has('pr-tick')) return { k: 'path', segs, ...TICK };
      if (has('pr-grid')) return { k: 'path', segs, ...GRID };
      return undefined;
    }
    case 'text': {
      const text = { k: 'text' as const, x: item.x, lines: [item.text], lh: 0 };
      const drop = item.dy ? 0.35 : 0;
      if (has('pr-band-end'))
        return {
          ...text,
          y: item.y,
          size: 10.5,
          weight: 600,
          fill: INK.ink3,
          anchor: 'end',
          tracking: 0.07,
          upper: true,
        };
      if (has('pr-tick-label'))
        return {
          ...text,
          y: item.y + drop * 11,
          size: 11,
          weight: 400,
          fill: INK.ink3,
          anchor: has('pr-tick-down') ? 'end' : 'middle',
          tabular: true,
        };
      if (has('pr-when'))
        return {
          ...text,
          y: item.y + drop * 11.5,
          size: 11.5,
          weight: 500,
          fill: role === 'muted' ? INK.mutedInk : INK.ink3,
          anchor: 'start',
          tabular: true,
          tracking: 0.01,
        };
      if (has('pr-lane-label'))
        return { ...text, y: item.y + drop * 12.5, size: 12.5, weight: 600, fill: INK.ink2, anchor: 'start' };
      return undefined;
    }
    case 'ellipse':
    case 'line':
    case 'lines':
      return undefined;
  }
};
