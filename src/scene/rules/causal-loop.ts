import { INK, ROLE } from '../tokens.ts';
import { look, parsePath, type Mark, type Rule } from '../marks.ts';

const POLARITY = 15;
const LOOP = 11;

export const causalLoop: Rule = (item, ctx) => {
  const { has, within } = look(item, ctx);
  if (!within('pr-causal-loop')) return undefined;
  if (item.type === 'path') {
    const segs = parsePath(item.d);
    if (has('pr-loop-arc')) return { k: 'path', segs, stroke: INK.ink3, sw: 1.4 };
    if (has('pr-loop-head')) return { k: 'path', segs, fill: INK.ink3 };
    if (has('pr-delay')) return { k: 'path', segs, stroke: INK.ink2, sw: 1.6 };
    return undefined;
  }
  if (item.type !== 'text') return undefined;
  if (has('pr-polarity')) {
    const role = ctx.role;
    const fill = role === 'muted' ? INK.mutedInk : role ? ROLE[role].line : INK.ink2;
    return text(item.text, item.x, item.y + 0.35 * POLARITY, { size: POLARITY, weight: 600, fill });
  }
  if (has('pr-loop-label'))
    return text(item.text, item.x, item.y + 0.35 * LOOP, { size: LOOP, weight: 600, fill: INK.ink2 });
  if (has('pr-loop-name'))
    return text(item.text, item.x, item.y, { size: LOOP, weight: 400, fill: INK.ink3, italic: true });
  return undefined;
};

function text(
  label: string,
  x: number,
  y: number,
  style: { size: number; weight: number; fill: string; italic?: boolean },
): Mark {
  return { k: 'text', x, y, lines: [label], lh: 0, anchor: 'middle', ...style };
}
