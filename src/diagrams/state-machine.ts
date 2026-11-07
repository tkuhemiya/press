import type { Node, StateMachine } from '../model.ts';
import type { DiagramDef } from './diagram.ts';
import type { Fence } from '../parse/grammar.ts';
import type { Reporter } from '../diagnostics.ts';
import { buildGraph, header, resolveSteps, toNode } from '../parse/graph.ts';
import { graphMethods } from './render-graph.ts';
import { hatchItems, measureLabel, textItems, type NodeShape } from './draw.ts';
import type { Item } from '../scene/scene.ts';

export const STATE_MACHINE: DiagramDef<'state-machine'> = {
  type: 'state-machine',
  name: 'State machine',
  build,
  ...graphMethods({ direction: 'down', shape: stateShape, first: (node) => node.id === 'start' }),
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

function stateShape(node: Node): NodeShape {
  if (node.id === 'start' || node.id === 'end') {
    return {
      w: PSEUDO,
      h: PSEUDO,
      pseudo: true,
      draw(b, attrs) {
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        const items: Item[] =
          node.id === 'start'
            ? [{ type: 'circle', cls: 'pr-dot', cx, cy, r: 7 }]
            : [
                { type: 'circle', cls: 'pr-ring', cx, cy, r: 7.5 },
                { type: 'circle', cls: 'pr-dot', cx, cy, r: 3.8 },
              ];
        return { type: 'group', cls: 'pr-node pr-pseudo', attrs, items };
      },
    };
  }
  const text = measureLabel(node.label, node.note, MAX_LABEL);
  return {
    w: Math.max(MIN_W, Math.ceil(text.w + 2 * PAD_X)),
    h: text.h + 2 * PAD_Y,
    draw: (b, attrs) => ({
      type: 'group',
      cls: 'pr-node',
      attrs,
      items: [
        { type: 'rect', cls: 'pr-box', ...b, r: 9 },
        ...hatchItems(node, b, 9),
        ...textItems(text, b.x + b.w / 2, b.y + b.h / 2),
      ],
    }),
  };
}
