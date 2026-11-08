import type { Role } from '../../model.ts';
import { INK, ROLE } from '../tokens.ts';
import { linesMark, look, parsePath, type Rule } from '../marks.ts';

const MEMBER_SIZE = 13;
const TYPE_SIZE = 11.5;

const memberFill = (role: Role | undefined): { fill?: string; stroke?: string; sw?: number } => {
  switch (role) {
    case 'focus':
      return { fill: ROLE.focus.fill, stroke: ROLE.focus.line, sw: 2 };
    case 'happy':
      return { fill: ROLE.happy.fill, stroke: ROLE.happy.line, sw: 2 };
    case 'error':
      return { fill: ROLE.error.fill, stroke: ROLE.error.line, sw: 1.6 };
    case 'muted':
      return { stroke: INK.mutedLine, sw: 1.2 };
    case undefined:
      return {};
  }
};

const edgeInk = (role: Role | undefined): string =>
  role === undefined || role === 'muted' ? INK.edge : ROLE[role].line;

export const classRule: Rule = (item, ctx) => {
  const { has, within } = look(item, ctx);
  if (!within('pr-class')) return undefined;
  const role = ctx.role;
  switch (item.type) {
    case 'rect': {
      const box = { k: 'rect' as const, x: item.x, y: item.y, w: item.w, h: item.h, r: item.r };
      if (has('pr-class-head')) return { ...box, fill: INK.groupFill };
      if (has('pr-member-box')) return { ...box, ...memberFill(role) };
      return undefined;
    }
    case 'path': {
      const segs = parsePath(item.d);
      if (has('pr-class-head')) return { k: 'path', segs, fill: INK.groupFill };
      if (has('pr-class-rule')) return { k: 'path', segs, stroke: INK.nodeLine, sw: 1 };
      if (has('pr-gen')) return { k: 'path', segs, fill: INK.paper, stroke: edgeInk(role), sw: 1.4 };
      if (has('pr-diamond')) return { k: 'path', segs, fill: edgeInk(role), stroke: edgeInk(role), sw: 1.2 };
      return undefined;
    }
    case 'text': {
      if (has('pr-member-name'))
        return {
          k: 'text',
          x: item.x,
          y: item.y + 0.35 * MEMBER_SIZE,
          lines: [item.text],
          lh: 0,
          size: MEMBER_SIZE,
          weight: 500,
          fill: role === 'muted' ? INK.mutedInk : INK.ink,
          anchor: 'start',
        };
      if (has('pr-member-type'))
        return {
          k: 'text',
          x: item.x,
          y: item.y + 0.35 * TYPE_SIZE,
          lines: [item.text],
          lh: 0,
          size: TYPE_SIZE,
          weight: 400,
          fill: INK.ink3,
          anchor: 'end',
        };
      return undefined;
    }
    case 'lines': {
      if (has('pr-stereo')) return linesMark(item, { size: 11.5, weight: 400, fill: INK.ink3 }, 'middle');
      if (has('pr-class-name')) {
        const fill = role === 'muted' ? INK.mutedInk : INK.ink;
        const mark = linesMark(item, { size: 14, weight: 600, fill }, 'middle');
        return within('pr-abstract') || within('pr-interface') ? { ...mark, italic: true } : mark;
      }
      return undefined;
    }
    case 'circle':
    case 'ellipse':
    case 'image':
    case 'line':
      return undefined;
  }
};
