import { esc, n } from '../render/svg.ts';
import type { Attrs, Item, Scene } from './scene.ts';

const cls = (c: string | undefined): string => (c === undefined ? '' : ` class="${c}"`);
const attrs = (a: Attrs | undefined): string => (a ?? []).map(([k, v]) => ` ${k}="${esc(v)}"`).join('');

function paintItem(item: Item, id: string): string {
  switch (item.type) {
    case 'group':
      return `<g${cls(item.cls)}${attrs(item.attrs)}>${paintItems(item.items, id)}</g>`;
    case 'rect':
      return `<rect${cls(item.cls)} x="${n(item.x)}" y="${n(item.y)}" width="${n(item.w)}" height="${n(item.h)}" rx="${n(item.r)}"${item.hatch ? ` fill="url(#${id}-hatch)"` : ''}/>`;
    case 'circle':
      return `<circle${cls(item.cls)} cx="${n(item.cx)}" cy="${n(item.cy)}" r="${n(item.r)}"/>`;
    case 'ellipse':
      return `<ellipse${cls(item.cls)} cx="${n(item.cx)}" cy="${n(item.cy)}" rx="${n(item.rx)}" ry="${n(item.ry)}"/>`;
    case 'path':
      return `<path${cls(item.cls)} d="${item.d}"/>`;
    case 'line':
      return `<line${cls(item.cls)} x1="${n(item.x1)}" y1="${n(item.y1)}" x2="${n(item.x2)}" y2="${n(item.y2)}"/>`;
    case 'image':
      return `<image${cls(item.cls)} x="${n(item.x)}" y="${n(item.y)}" width="${n(item.w)}" height="${n(item.h)}" href="data:image/svg+xml;base64,${Buffer.from(item.svg).toString('base64')}"/>`;
    case 'text':
      return `<text${cls(item.cls)} x="${n(item.x)}" y="${n(item.y)}"${item.dy ? ` dy="${item.dy}"` : ''}>${esc(item.text)}</text>`;
    case 'lines': {
      const top = item.cy - ((item.lines.length - 1) * item.lineHeight) / 2;
      const spans = item.lines.map(
        (l, i) => `<tspan x="${n(item.x)}" ${i ? `dy="${item.lineHeight}"` : 'dy="0.35em"'}>${esc(l)}</tspan>`,
      );
      return `<text class="${item.cls}" x="${n(item.x)}" y="${n(top)}">${spans.join('')}</text>`;
    }
  }
}

const paintItems = (items: readonly Item[], id: string): string => items.map((item) => paintItem(item, id)).join('');

export function paintSvg(scene: Scene): string {
  const { width, height, id } = scene;
  const defs = scene.hatch
    ? `<defs><pattern id="${id}-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" class="pr-hatch"/></pattern></defs>`
    : '';
  return `<svg class="pr-svg${scene.cls ? ' ' + scene.cls : ''}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">${defs}${paintItems(scene.items, id)}</svg>`;
}
