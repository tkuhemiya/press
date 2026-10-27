import type { Role } from '../model.ts';

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function n(v: number): string {
  return String(Math.round(v * 100) / 100);
}

export function roleAttr(role: Role | undefined): string {
  return role ? ` data-role="${role}"` : '';
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

export function textBlock(lines: string[], cx: number, cy: number, lineHeight: number, cls: string): string {
  const top = cy - ((lines.length - 1) * lineHeight) / 2;
  return `<text class="${cls}" x="${n(cx)}" y="${n(top)}">${lines.map((l, i) => `<tspan x="${n(cx)}" ${i ? `dy="${lineHeight}"` : 'dy="0.35em"'}>${esc(l)}</tspan>`).join('')}</text>`;
}

export function badge(cls: string, attrs: string, x: number, y: number, label: string): string {
  const r = label.length > 1 ? 9 : 8;
  return `<g class="${cls}"${attrs}><circle cx="${n(x)}" cy="${n(y)}" r="${r}"/><text x="${n(x)}" y="${n(y)}" dy="0.35em">${esc(label)}</text></g>`;
}
