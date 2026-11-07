import type { Role } from '../../model.ts';
import { INK, ROLE } from '../tokens.ts';
import { linesMark, look, parsePath, type Rule, type Stroke } from '../marks.ts';

const FIELD_SIZE = 13;
const TYPE_SIZE = 11.5;

interface Ink extends Stroke {
  fill?: string;
}

function fieldInk(role: Role | undefined): Ink {
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
}

const crowInk = (role: Role | undefined): string =>
  role === undefined || role === 'muted' ? INK.edge : ROLE[role].line;

export const er: Rule = (item, ctx) => {
  const { has, within } = look(item, ctx);
  if (!within('pr-er')) return undefined;
  const role = ctx.role;
  switch (item.type) {
    case 'rect': {
      const box = { k: 'rect' as const, x: item.x, y: item.y, w: item.w, h: item.h, r: item.r };
      if (has('pr-entity-head')) return { ...box, fill: INK.groupFill };
      if (has('pr-field-box')) return { ...box, ...fieldInk(role) };
      return undefined;
    }
    case 'circle': {
      const dot = { k: 'circle' as const, cx: item.cx, cy: item.cy, r: item.r };
      if (has('pr-crow-ring')) return { ...dot, fill: INK.paper, stroke: crowInk(role), sw: 1.4 };
      if (within('pr-key-glyph')) return { ...dot, stroke: INK.ink3, sw: 1.2 };
      return undefined;
    }
    case 'ellipse':
    case 'image':
    case 'line':
      return undefined;
    case 'path': {
      if (has('pr-entity-head')) return { k: 'path', segs: parsePath(item.d), fill: INK.groupFill };
      if (has('pr-entity-rule')) return { k: 'path', segs: parsePath(item.d), stroke: INK.nodeLine, sw: 1 };
      if (has('pr-crow')) return { k: 'path', segs: parsePath(item.d), stroke: crowInk(role), sw: 1.4, cap: 'butt' };
      if (within('pr-key-glyph'))
        return { k: 'path', segs: parsePath(item.d), stroke: INK.ink3, sw: 1.2, cap: 'round' };
      return undefined;
    }
    case 'text': {
      if (has('pr-field-name'))
        return {
          k: 'text',
          x: item.x,
          y: item.y + 0.35 * FIELD_SIZE,
          lines: [item.text],
          lh: 0,
          size: FIELD_SIZE,
          weight: 500,
          fill: role === 'muted' ? INK.mutedInk : INK.ink,
          anchor: 'start',
          underline: within('pr-key'),
        };
      if (has('pr-field-type'))
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
    case 'lines':
      if (has('pr-entity-name'))
        return linesMark(item, { size: 14, weight: 600, fill: role === 'muted' ? INK.mutedInk : INK.ink }, 'middle');
      return undefined;
  }
};
