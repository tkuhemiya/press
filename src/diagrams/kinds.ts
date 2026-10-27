// Shapes and glyphs for node kinds, shared by every diagram type that has them, so a database
// looks the same in a sequence as in an architecture.
import { n } from '../render/svg.ts';

// A node's outline. Databases are cylinders, external systems are dashed, the rest are boxes.
export function kindShape(kind: string | undefined, x: number, y: number, w: number, h: number): string {
  if (kind === 'database') {
    const ry = 5;
    return `<path class="pr-box" d="M${n(x)},${n(y + ry)}A${n(w / 2)},${ry} 0 0 1 ${n(x + w)},${n(y + ry)}V${n(y + h - ry)}A${n(w / 2)},${ry} 0 0 1 ${n(x)},${n(y + h - ry)}Z"/><path class="pr-box-detail" d="M${n(x)},${n(y + ry)}A${n(w / 2)},${ry} 0 0 0 ${n(x + w)},${n(y + ry)}"/>`;
  }
  const cls = kind === 'external' ? 'pr-box pr-external' : 'pr-box';
  return `<rect class="${cls}" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="9"/>`;
}

// Width a glyph takes beside a label, including its gap.
export const GLYPH_W = 22;

// Small line glyphs beside a label, centred on (x, y). Kinds whose shape already says enough
// (database) have none.
export function glyph(kind: string, x: number, y: number): string {
  const p = (d: string) => `<g class="pr-glyph">${d}</g>`;
  switch (kind) {
    case 'user':
      return p(`<circle cx="${n(x)}" cy="${n(y - 4)}" r="3.2"/><path d="M${n(x - 5.5)},${n(y + 6.5)}C${n(x - 5.5)},${n(y + 1)} ${n(x + 5.5)},${n(y + 1)} ${n(x + 5.5)},${n(y + 6.5)}"/>`);
    case 'queue':
      return p(`<rect x="${n(x - 6)}" y="${n(y - 4.5)}" width="12" height="9" rx="2"/><path d="M${n(x - 2)},${n(y - 4.5)}V${n(y + 4.5)}M${n(x + 2)},${n(y - 4.5)}V${n(y + 4.5)}"/>`);
    case 'client':
      return p(`<rect x="${n(x - 6.5)}" y="${n(y - 5.5)}" width="13" height="9" rx="1.5"/><path d="M${n(x - 3)},${n(y + 6)}H${n(x + 3)}M${n(x)},${n(y + 3.5)}V${n(y + 6)}"/>`);
    case 'service':
      return p(`<rect x="${n(x - 6)}" y="${n(y - 6)}" width="12" height="5" rx="1.2"/><rect x="${n(x - 6)}" y="${n(y + 1)}" width="12" height="5" rx="1.2"/><path d="M${n(x - 3.5)},${n(y - 3.5)}h0.01M${n(x - 3.5)},${n(y + 3.5)}h0.01"/>`);
    case 'cache':
      return p(`<path d="M${n(x + 1.5)},${n(y - 6.5)}L${n(x - 4)},${n(y + 1)}H${n(x + 0.5)}L${n(x - 1.5)},${n(y + 6.5)}L${n(x + 4)},${n(y - 1)}H${n(x - 0.5)}Z"/>`);
    case 'storage':
      return p(`<ellipse cx="${n(x)}" cy="${n(y - 4)}" rx="6" ry="1.8"/><path d="M${n(x - 6)},${n(y - 4)}L${n(x - 4.5)},${n(y + 5)}Q${n(x)},${n(y + 7.2)} ${n(x + 4.5)},${n(y + 5)}L${n(x + 6)},${n(y - 4)}"/>`);
    case 'external':
      return p(`<path d="M${n(x + 0.5)},${n(y - 6)}H${n(x + 6)}V${n(y - 0.5)}M${n(x + 6)},${n(y - 6)}L${n(x - 0.5)},${n(y + 0.5)}M${n(x - 2)},${n(y - 4.5)}H${n(x - 6)}V${n(y + 6)}H${n(x + 4.5)}V${n(y + 2)}"/>`);
  }
  return '';
}
