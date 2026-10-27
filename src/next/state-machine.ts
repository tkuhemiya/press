import type { Node, StateMachine } from './model.ts';
import type { DiagramDef } from './diagram.ts';
import type { Fence } from './grammar.ts';
import type { Reporter } from './diagnostics.ts';
import { GRAMMARS } from './grammars.ts';
import { buildGraph, header, lean, resolveSteps, toNode } from './graph.ts';
import { renderGraph } from './render-graph.ts';
import { drawText, measureLabel, type NodeShape } from '../diagrams/graph.ts';
import { n } from '../render/svg.ts';

export const STATE_MACHINE: DiagramDef<'state-machine'> = {
  type: 'state-machine',
  name: 'State machine',
  grammar: GRAMMARS['state-machine'],
  build,
  render: (d, context) =>
    renderGraph(d, context, { direction: 'down', shape: stateShape, first: (node) => node.id === 'start' }),
  withoutMuted(d, pinned) {
    const kept = lean(d, pinned);
    return kept && { ...d, ...kept };
  },
};

function build(fence: Fence, report: Reporter): StateMachine {
  const { error } = report;
  const graph = buildGraph(fence, report, {
    label: (id) => id.replace(/_/g, ' '),
    empty: 'Add at least one edge, e.g. `a -> b : label`.',
    chain(s) {
      for (let i = 0; i + 1 < s.ends.length; i++) {
        if (s.ends[i + 1].node === 'start')
          error(
            s.line,
            'No transition can lead into `start`.',
            'Use a regular state here; `start` is the entry pseudo-state.',
          );
        if (s.ends[i].node === 'end')
          error(s.line, 'No transition can leave `end`.', 'Use a regular state here; `end` is the final pseudo-state.');
      }
      return true;
    },
  });
  const steps = resolveSteps(fence.steps, graph.nodes, graph.edges, report);
  return {
    ...header(fence, 'state-machine'),
    nodes: graph.nodes.map(toNode),
    edges: graph.edges,
    groups: graph.groups,
    steps,
  };
}

const PAD_X = 16;
const PAD_Y = 10;
const MIN_W = 68;
const MAX_LABEL = 190;
const PSEUDO = 16;

function stateShape(node: Node, domId: string): NodeShape {
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
  const text = measureLabel(node.label, node.note, MAX_LABEL);
  return {
    w: Math.max(MIN_W, Math.ceil(text.w + 2 * PAD_X)),
    h: text.h + 2 * PAD_Y,
    draw(b, attrs) {
      let body = `<rect class="pr-box" x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="9"/>`;
      if (node.role === 'error')
        body += `<rect class="pr-hatch-fill" x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="9" fill="url(#${domId}-hatch)"/>`;
      body += drawText(text, b.x + b.w / 2, b.y + b.h / 2);
      return `<g class="pr-node"${attrs}>${body}</g>`;
    },
  };
}
