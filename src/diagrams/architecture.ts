// Draws an architecture diagram: components with a shape or glyph for their kind, inside the
// boundaries (groups) they belong to. Layout is the shared graph layout in graph.ts.
import type { Diagram, DiagramNode } from '../model.ts';
import { drawText, measureText, renderGraph, type NodeShape } from './graph.ts';
import { GLYPH_W, glyph, kindShape } from './kinds.ts';
import { n, type Rendered } from '../render/svg.ts';

const PAD_X = 16;
const PAD_Y = 12;
// A cylinder's caps take this much more height.
const CAP = 4;
const MIN_W = 96;
const MAX_LABEL = 170;

export function renderArchitecture(d: Diagram, refMarkers: Map<string, string>, domId: string): Rendered {
  return renderGraph(d, refMarkers, domId, { direction: 'right', shape: componentShape, svgClass: 'pr-architecture' });
}

function componentShape(node: DiagramNode, domId: string): NodeShape {
  const text = measureText(node, MAX_LABEL);
  const icon = node.kind && node.kind !== 'database' ? GLYPH_W : 0;
  const pad = node.kind === 'database' ? PAD_Y + CAP : PAD_Y;
  return {
    w: Math.max(MIN_W, Math.ceil(text.w + icon + 2 * PAD_X)),
    h: Math.ceil(text.h + 2 * pad),
    draw(b, attrs) {
      let body = kindShape(node.kind, b.x, b.y, b.w, b.h);
      if (node.role === 'error' && node.kind !== 'database')
        body += `<rect class="pr-hatch-fill" x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="9" fill="url(#${domId}-hatch)"/>`;
      const cx = b.x + b.w / 2 + icon / 2;
      const cy = b.y + b.h / 2 + (node.kind === 'database' ? CAP / 2 : 0);
      if (icon) body += glyph(node.kind!, cx - text.first / 2 - 15, b.y + pad + 9);
      body += drawText(text, cx, cy);
      return `<g class="pr-node pr-component"${attrs}>${body}</g>`;
    },
  };
}
