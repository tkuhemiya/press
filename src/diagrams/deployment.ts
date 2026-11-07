import { DEPLOYMENT_KINDS, type Deployment } from '../model.ts';
import type { DiagramDef } from './diagram.ts';
import type { Fence } from '../parse/grammar.ts';
import type { Reporter } from '../diagnostics.ts';
import { buildKinded, header } from '../parse/graph.ts';
import { graphMethods } from './render-graph.ts';
import { componentShape } from './kinds.ts';

export const DEPLOYMENT: DiagramDef<'deployment'> = {
  type: 'deployment',
  name: 'Deployment',
  build,
  ...graphMethods({
    direction: 'right',
    shape: componentShape,
    kind: (node) => node.kind,
    svgClass: 'pr-deployment',
  }),
};

function build(fence: Fence, report: Reporter): Deployment {
  return {
    ...header(fence, 'deployment'),
    ...buildKinded(fence, report, DEPLOYMENT_KINDS),
  };
}
