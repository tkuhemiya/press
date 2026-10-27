import { INK, ROLE } from '../tokens.ts';
import {
  DASH,
  GLYPH_LINE,
  edgeLabel,
  linesMark,
  look,
  nodeBox,
  parsePath,
  type Context,
  type Leaf,
  type Mark,
} from '../marks.ts';

export function graph(item: Leaf, ctx: Context): Mark {
  const { has, within } = look(item, ctx);
  const role = ctx.role;
  switch (item.type) {
    case 'rect': {
      const box = { k: 'rect' as const, x: item.x, y: item.y, w: item.w, h: item.h, r: item.r };
      if (item.hatch) return { ...box, hatch: ROLE.error.line };
      if (has('pr-elabel-plate')) return { ...box, fill: within('pr-on-group') ? INK.groupFill : INK.paper };
      if (within('pr-group')) return { ...box, fill: INK.groupFill, stroke: INK.groupLine, sw: 1 };
      if (within('pr-glyph')) return { ...box, ...GLYPH_LINE };
      return { ...box, ...nodeBox(role, has('pr-outcome')), ...(has('pr-external') ? DASH : {}) };
    }
    case 'circle': {
      const dot = { k: 'circle' as const, cx: item.cx, cy: item.cy, r: item.r };
      if (within('pr-glyph')) return { ...dot, ...GLYPH_LINE };
      if (within('pr-ref-marker')) return { ...dot, fill: INK.paper, stroke: INK.ink, sw: 1.2 };
      if (has('pr-ring')) return { ...dot, stroke: INK.ink, sw: 1.5 };
      return { ...dot, fill: INK.ink };
    }
    case 'ellipse': {
      const ring = { k: 'ellipse' as const, cx: item.cx, cy: item.cy, rx: item.rx, ry: item.ry };
      if (within('pr-glyph')) return { ...ring, ...GLYPH_LINE };
      return { ...ring, fill: INK.ink };
    }
    case 'path': {
      const segs = parsePath(item.d);
      if (within('pr-glyph')) return { k: 'path', segs, ...GLYPH_LINE };
      if (has('pr-box')) return { k: 'path', segs, ...nodeBox(role, false) };
      if (has('pr-box-detail')) return { k: 'path', segs, stroke: INK.nodeLine, sw: 1.2 };
      const colour = role ? ROLE[role].line : INK.edge;
      if (has('pr-head')) return { k: 'path', segs, fill: colour };
      const dashed = within('pr-dashed');
      const sw = role === 'focus' ? 2.2 : role === 'happy' ? 2.4 : role === 'error' ? 1.6 : 1.4;
      return {
        k: 'path',
        segs,
        stroke: colour,
        sw,
        cap: dashed ? 'butt' : 'round',
        ...(dashed ? { dash: [5, 4] } : {}),
      };
    }
    case 'text': {
      const at = { k: 'text' as const, x: item.x, lines: [item.text], lh: 0 };
      if (within('pr-step-marker') || within('pr-ref-marker')) {
        const ref = within('pr-ref-marker');
        const t = { ...at, y: item.y + 3.5, size: 10, weight: 600, anchor: 'middle' as const };
        return { ...t, fill: ref ? INK.ink : INK.paper, ...(ref ? { italic: true } : {}) };
      }
      return {
        ...at,
        y: item.y,
        size: 10.5,
        weight: 600,
        fill: INK.ink3,
        anchor: 'start',
        tracking: 0.07,
        upper: true,
      };
    }
    case 'lines': {
      const start = has('pr-start');
      const style = has('pr-label')
        ? { size: 14, weight: 500, fill: role === 'muted' ? INK.mutedInk : INK.ink }
        : has('pr-note')
          ? { size: 11.5, weight: 400, fill: INK.ink3 }
          : edgeLabel(role);
      return linesMark(item, style, start ? 'start' : 'middle');
    }
  }
}
