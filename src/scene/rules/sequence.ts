import { INK } from '../tokens.ts';
import { edgeLabel, linesMark, look, parsePath, type Rule } from '../marks.ts';

const BASELINE = 0.35;

export const sequence: Rule = (item, ctx) => {
  const { has, within } = look(item, ctx);
  if (!within('pr-sequence')) return undefined;
  switch (item.type) {
    case 'line':
      return {
        k: 'path',
        segs: [
          ['M', item.x1, item.y1],
          ['L', item.x2, item.y2],
        ],
        stroke: INK.nodeLine,
        sw: 1,
        dash: [3, 4],
        cap: 'butt',
      };
    case 'rect':
      if (!has('pr-phase-box')) return undefined;
      return { k: 'rect', x: item.x, y: item.y, w: item.w, h: item.h, r: item.r, stroke: INK.nodeLine, sw: 1 };
    case 'path':
      if (!has('pr-phase-tag')) return undefined;
      return { k: 'path', segs: parsePath(item.d), fill: INK.groupFill, stroke: INK.nodeLine, sw: 1 };
    case 'text':
      if (has('pr-phase-label'))
        return {
          k: 'text',
          x: item.x,
          y: item.y + BASELINE * 10.5,
          lines: [item.text],
          lh: 0,
          size: 10.5,
          weight: 600,
          fill: INK.ink2,
          anchor: 'start',
          tracking: 0.07,
          upper: true,
        };
      if (has('pr-label'))
        return {
          k: 'text',
          x: item.x,
          y: item.y + BASELINE * 14,
          lines: [item.text],
          lh: 0,
          size: 14,
          weight: 500,
          fill: ctx.role === 'muted' ? INK.mutedInk : INK.ink,
          anchor: 'middle',
        };
      return undefined;
    case 'lines':
      if (!has('pr-left')) return undefined;
      return linesMark(item, edgeLabel(ctx.role), 'start');
    case 'circle':
    case 'ellipse':
    case 'image':
      return undefined;
  }
};
