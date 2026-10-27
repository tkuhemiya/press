import type { Diagram, DiagramNode } from '../model.ts';
import { drawText, measureText, renderGraph, type NodeShape } from './graph.ts';
import { n, type Rendered } from '../render/svg.ts';

const PAD_X = 16;
const PAD_Y = 11;
const MIN_W = 80;
const MAX_LABEL = 170;

export function renderDecisionTree(d: Diagram, refMarkers: Map<string, string>, domId: string): Rendered {
  const outcomes = new Set(d.nodes.filter((node) => !d.edges.some((e) => e.from === node.id)).map((node) => node.id));
  const root = d.nodes.find((node) => !d.edges.some((e) => e.to === node.id));
  return renderGraph(d, refMarkers, domId, {
    direction: 'down',
    shape: (node) => (outcomes.has(node.id) ? outcomeShape(node, domId) : questionShape(node, domId)),
    first: (node) => node === root,
    svgClass: 'pr-decision-tree',
  });
}

function questionShape(node: DiagramNode, domId: string): NodeShape {
  const text = measureText(node, MAX_LABEL);
  return {
    w: Math.max(MIN_W, Math.ceil(text.w + 2 * PAD_X)),
    h: text.h + 2 * PAD_Y,
    draw(b, attrs) {
      let body = `<rect class="pr-box pr-question" x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="6"/>`;
      if (node.role === 'error')
        body += `<rect class="pr-hatch-fill" x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="6" fill="url(#${domId}-hatch)"/>`;
      body += drawText(text, b.x + b.w / 2, b.y + b.h / 2);
      return `<g class="pr-node"${attrs}>${body}</g>`;
    },
  };
}

function outcomeShape(node: DiagramNode, domId: string): NodeShape {
  const text = measureText(node, MAX_LABEL);
  const h = text.h + 2 * PAD_Y;
  return {
    w: Math.max(MIN_W, Math.ceil(text.w + 2 * PAD_X + 8)),
    h,
    draw(b, attrs) {
      const r = Math.min(b.h / 2, 18);
      let body = `<rect class="pr-box pr-outcome" x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="${n(r)}"/>`;
      if (node.role === 'error')
        body += `<rect class="pr-hatch-fill" x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="${n(r)}" fill="url(#${domId}-hatch)"/>`;
      body += drawText(text, b.x + b.w / 2, b.y + b.h / 2);
      return `<g class="pr-node pr-outcome-node"${attrs}>${body}</g>`;
    },
  };
}
