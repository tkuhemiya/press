import { DATA_FLOW_KINDS, type DataFlow, type FlowNode } from '../model.ts';
import type { DiagramDef } from './diagram.ts';
import type { Fence } from '../parse/grammar.ts';
import type { Reporter } from '../diagnostics.ts';
import type { Item } from '../scene/scene.ts';
import { buildKinded, edgeEnds, header, lean, nodeParts } from '../parse/graph.ts';
import { renderGraph } from './render-graph.ts';
import { hatchItems, measureLabel, textItems, type Box, type NodeShape } from './draw.ts';

export const DATA_FLOW: DiagramDef<'data-flow'> = {
  type: 'data-flow',
  name: 'Data flow',
  build,
  render: (d, context) =>
    renderGraph(d, context, {
      direction: 'right',
      shape: flowShape,
      kind: (node) => node.kind,
      svgClass: 'pr-data-flow',
    }),
  targets: (d) => nodeParts(d.nodes),
  ends: (d, edge) => edgeEnds(d.edges, edge),
  turnable: (d) => d.direction === undefined,
  withoutMuted(d, pinned) {
    const kept = lean(d, pinned);
    return kept && { ...d, ...kept };
  },
};

function build(fence: Fence, report: Reporter): DataFlow {
  return {
    ...header(fence, 'data-flow'),
    ...buildKinded(fence, report, DATA_FLOW_KINDS),
  };
}

const PAD_Y = 12;
const MIN_W = 96;
const MAX_LABEL = 170;
const BOX_RADIUS = 3;

function outline(kind: FlowNode['kind'], b: Box): { items: Item[]; r: number } {
  if (kind === 'store')
    return {
      r: 0,
      items: [
        { type: 'rect', cls: 'pr-store-fill', ...b, r: 0 },
        { type: 'path', cls: 'pr-box', d: `M${b.x},${b.y}H${b.x + b.w}M${b.x},${b.y + b.h}H${b.x + b.w}` },
      ],
    };
  const r = kind === 'process' ? b.h / 2 : BOX_RADIUS;
  return { r, items: [{ type: 'rect', cls: 'pr-box', ...b, r }] };
}

function flowShape(node: FlowNode): NodeShape {
  const text = measureLabel(node.label, node.note, MAX_LABEL);
  const padX = node.kind === 'process' ? 26 : 18;
  return {
    w: Math.max(MIN_W, Math.ceil(text.w + 2 * padX)),
    h: Math.ceil(text.h + 2 * PAD_Y),
    draw(b, attrs) {
      const shape = outline(node.kind, b);
      return {
        type: 'group',
        cls: 'pr-node pr-flow',
        attrs,
        items: [...shape.items, ...hatchItems(node, b, shape.r), ...textItems(text, b.x + b.w / 2, b.y + b.h / 2)],
      };
    },
  };
}
