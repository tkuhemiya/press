import type { Attrs, Item } from '../scene/scene.ts';

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function n(v: number): string {
  return String(Math.round(v * 100) / 100);
}

export const HEAD = 9;
export function arrowhead(x: number, y: number, dx: number, dy: number): string {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const w = 4.2;
  const bx = x - ux * HEAD;
  const by = y - uy * HEAD;
  const notchX = x - ux * (HEAD - 2.2);
  const notchY = y - uy * (HEAD - 2.2);
  return `M${n(x)},${n(y)}L${n(bx + px * w)},${n(by + py * w)}L${n(notchX)},${n(notchY)}L${n(bx - px * w)},${n(by - py * w)}Z`;
}

export const linesItem = (lines: readonly string[], cx: number, cy: number, lineHeight: number, cls: string): Item => ({
  type: 'lines',
  cls,
  x: cx,
  cy,
  lines,
  lineHeight,
});

export function badgeItem(cls: string, attrs: Attrs, x: number, y: number, label: string): Item {
  return {
    type: 'group',
    cls,
    attrs,
    items: [
      { type: 'circle', cx: x, cy: y, r: label.length > 1 ? 9 : 8 },
      { type: 'text', x, y, text: label, dy: '0.35em' },
    ],
  };
}
