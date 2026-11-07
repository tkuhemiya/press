import { ARCHITECTURE_KINDS, type Architecture } from '../model.ts';
import type { DiagramDef } from './diagram.ts';
import type { Fence } from '../parse/grammar.ts';
import type { Reporter } from '../diagnostics.ts';
import { buildKinded, header } from '../parse/graph.ts';
import { graphMethods } from './render-graph.ts';
import { componentShape } from './kinds.ts';

export const ARCHITECTURE: DiagramDef<'architecture'> = {
  type: 'architecture',
  name: 'Architecture',
  build,
  ...graphMethods({
    direction: 'right',
    shape: componentShape,
    kind: (node) => node.kind,
    svgClass: 'pr-architecture',
  }),
};

function build(fence: Fence, report: Reporter): Architecture {
  return {
    ...header(fence, 'architecture'),
    ...buildKinded(fence, report, ARCHITECTURE_KINDS),
  };
}
