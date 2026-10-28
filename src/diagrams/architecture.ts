import { ARCHITECTURE_KINDS, type Architecture } from '../model.ts';
import type { DiagramDef } from './diagram.ts';
import type { Fence } from '../parse/grammar.ts';
import type { Reporter } from '../diagnostics.ts';
import { buildKinded, edgeEnds, header, lean, nodeParts } from '../parse/graph.ts';
import { renderGraph } from './render-graph.ts';
import { componentShape } from './kinds.ts';

export const ARCHITECTURE: DiagramDef<'architecture'> = {
  type: 'architecture',
  name: 'Architecture',
  build,
  render: (d, context) =>
    renderGraph(d, context, {
      direction: 'right',
      shape: componentShape,
      kind: (node) => node.kind,
      svgClass: 'pr-architecture',
    }),
  targets: (d) => nodeParts(d.nodes),
  ends: (d, edge) => edgeEnds(d.edges, edge),
  turnable: (d) => d.direction === undefined,
  withoutMuted(d, pinned) {
    const kept = lean(d, pinned);
    return kept && { ...d, ...kept };
  },
};

function build(fence: Fence, report: Reporter): Architecture {
  return {
    ...header(fence, 'architecture'),
    ...buildKinded(fence, report, ARCHITECTURE_KINDS),
  };
}
