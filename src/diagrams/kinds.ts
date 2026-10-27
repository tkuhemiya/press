import { n } from '../render/svg.ts';
import type { Item } from '../scene/scene.ts';

export function kindItems(kind: string | undefined, x: number, y: number, w: number, h: number): Item[] {
  if (kind === 'database') {
    const ry = 5;
    return [
      {
        type: 'path',
        cls: 'pr-box',
        d: `M${n(x)},${n(y + ry)}A${n(w / 2)},${ry} 0 0 1 ${n(x + w)},${n(y + ry)}V${n(y + h - ry)}A${n(w / 2)},${ry} 0 0 1 ${n(x)},${n(y + h - ry)}Z`,
      },
      {
        type: 'path',
        cls: 'pr-box-detail',
        d: `M${n(x)},${n(y + ry)}A${n(w / 2)},${ry} 0 0 0 ${n(x + w)},${n(y + ry)}`,
      },
    ];
  }
  const cls = kind === 'external' ? 'pr-box pr-external' : 'pr-box';
  return [{ type: 'rect', cls, x, y, w, h, r: 9 }];
}

export const GLYPH_W = 22;

function glyphParts(kind: string, x: number, y: number): Item[] {
  switch (kind) {
    case 'user':
      return [
        { type: 'circle', cx: x, cy: y - 4, r: 3.2 },
        {
          type: 'path',
          d: `M${n(x - 5.5)},${n(y + 6.5)}C${n(x - 5.5)},${n(y + 1)} ${n(x + 5.5)},${n(y + 1)} ${n(x + 5.5)},${n(y + 6.5)}`,
        },
      ];
    case 'queue':
      return [
        { type: 'rect', x: x - 6, y: y - 4.5, w: 12, h: 9, r: 2 },
        { type: 'path', d: `M${n(x - 2)},${n(y - 4.5)}V${n(y + 4.5)}M${n(x + 2)},${n(y - 4.5)}V${n(y + 4.5)}` },
      ];
    case 'client':
      return [
        { type: 'rect', x: x - 6.5, y: y - 5.5, w: 13, h: 9, r: 1.5 },
        { type: 'path', d: `M${n(x - 3)},${n(y + 6)}H${n(x + 3)}M${n(x)},${n(y + 3.5)}V${n(y + 6)}` },
      ];
    case 'service':
      return [
        { type: 'rect', x: x - 6, y: y - 6, w: 12, h: 5, r: 1.2 },
        { type: 'rect', x: x - 6, y: y + 1, w: 12, h: 5, r: 1.2 },
        { type: 'path', d: `M${n(x - 3.5)},${n(y - 3.5)}h0.01M${n(x - 3.5)},${n(y + 3.5)}h0.01` },
      ];
    case 'cache':
      return [
        {
          type: 'path',
          d: `M${n(x + 1.5)},${n(y - 6.5)}L${n(x - 4)},${n(y + 1)}H${n(x + 0.5)}L${n(x - 1.5)},${n(y + 6.5)}L${n(x + 4)},${n(y - 1)}H${n(x - 0.5)}Z`,
        },
      ];
    case 'storage':
      return [
        { type: 'ellipse', cx: x, cy: y - 4, rx: 6, ry: 1.8 },
        {
          type: 'path',
          d: `M${n(x - 6)},${n(y - 4)}L${n(x - 4.5)},${n(y + 5)}Q${n(x)},${n(y + 7.2)} ${n(x + 4.5)},${n(y + 5)}L${n(x + 6)},${n(y - 4)}`,
        },
      ];
    case 'external':
      return [
        {
          type: 'path',
          d: `M${n(x + 0.5)},${n(y - 6)}H${n(x + 6)}V${n(y - 0.5)}M${n(x + 6)},${n(y - 6)}L${n(x - 0.5)},${n(y + 0.5)}M${n(x - 2)},${n(y - 4.5)}H${n(x - 6)}V${n(y + 6)}H${n(x + 4.5)}V${n(y + 2)}`,
        },
      ];
    default:
      return [];
  }
}

export function glyphItems(kind: string, x: number, y: number): Item[] {
  const items = glyphParts(kind, x, y);
  return items.length ? [{ type: 'group', cls: 'pr-glyph', items }] : [];
}
