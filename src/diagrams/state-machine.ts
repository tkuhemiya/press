// Draws a state-machine diagram: rounded states, and dots for the start and end pseudo-states.
// Layout is the shared graph layout in graph.ts.
import type { Diagram, DiagramNode } from '../model.ts';
import { drawText, measureText, renderGraph, type NodeShape } from './graph.ts';
import { n, type Rendered } from '../render/svg.ts';

const PAD_X = 16;
const PAD_Y = 10;
const MIN_W = 68;
const MAX_LABEL = 190;
const PSEUDO = 16;

export function renderStateMachine(d: Diagram, refMarkers: Map<string, string>, domId: string): Rendered {
  return renderGraph(d, refMarkers, domId, { direction: 'down', shape: stateShape, first: (node) => node.id === 'start' });
}

function stateShape(node: DiagramNode, domId: string): NodeShape {
  if (node.id === 'start' || node.id === 'end') {
    return {
      w: PSEUDO,
      h: PSEUDO,
      pseudo: true,
      draw(b, attrs) {
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        return node.id === 'start'
          ? `<g class="pr-node pr-pseudo"${attrs}><circle class="pr-dot" cx="${n(cx)}" cy="${n(cy)}" r="7"/></g>`
          : `<g class="pr-node pr-pseudo"${attrs}><circle class="pr-ring" cx="${n(cx)}" cy="${n(cy)}" r="7.5"/><circle class="pr-dot" cx="${n(cx)}" cy="${n(cy)}" r="3.8"/></g>`;
      },
    };
  }
  const text = measureText(node, MAX_LABEL);
  return {
    w: Math.max(MIN_W, Math.ceil(text.w + 2 * PAD_X)),
    h: text.h + 2 * PAD_Y,
    draw(b, attrs) {
      let body = `<rect class="pr-box" x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="9"/>`;
      if (node.role === 'error') body += `<rect class="pr-hatch-fill" x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="9" fill="url(#${domId}-hatch)"/>`;
      body += drawText(text, b.x + b.w / 2, b.y + b.h / 2);
      return `<g class="pr-node"${attrs}>${body}</g>`;
    },
  };
}
