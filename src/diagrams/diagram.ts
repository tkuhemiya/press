import type { Diagram, DiagramType, Direction, EdgeIndex, Html, NodeId, Part, Target } from '../model.ts';
import type { Fence } from '../parse/grammar.ts';
import type { Reporter } from '../diagnostics.ts';
import type { Scene } from '../scene/scene.ts';
import { ARCHITECTURE } from './architecture.ts';
import { C4 } from './c4.ts';
import { CAUSAL_LOOP } from './causal-loop.ts';
import { DATA_FLOW } from './data-flow.ts';
import { DECISION_TREE } from './decision-tree.ts';
import { DEPLOYMENT } from './deployment.ts';
import { ER } from './er.ts';
import { SEQUENCE } from './sequence.ts';
import { STATE_MACHINE } from './state-machine.ts';
import { TIMELINE } from './timeline.ts';
import { TRADEOFFS } from './tradeoffs.ts';

export interface Rendered {
  svg: Html;
  width: number;
  height: number;
  scene: Scene;
}

interface Members {
  edges: EdgeIndex[];
  nodes: NodeId[];
}

export interface RenderContext {
  domId: string;
  direction?: Direction;
  marker(target: Target): string | undefined;
}

export interface DiagramDef<T extends DiagramType> {
  type: T;
  name: string;
  build(fence: Fence, report: Reporter): Diagram<T>;
  render(diagram: Diagram<T>, context: RenderContext): Rendered;
  targets(diagram: Diagram<T>): Part[];
  ends?(diagram: Diagram<T>, edge: EdgeIndex): [string, string] | undefined;
  members?(diagram: Diagram<T>, id: NodeId): Members | undefined;
  turnable?(diagram: Diagram<T>): boolean;
  trail?(diagram: Diagram<T>, step: number): number[];
  withoutMuted?(diagram: Diagram<T>, pinned: (id: NodeId) => boolean): Diagram<T> | undefined;
}

const DIAGRAMS: { [T in DiagramType]: DiagramDef<T> } = {
  'state-machine': STATE_MACHINE,
  sequence: SEQUENCE,
  architecture: ARCHITECTURE,
  'data-flow': DATA_FLOW,
  c4: C4,
  deployment: DEPLOYMENT,
  'causal-loop': CAUSAL_LOOP,
  timeline: TIMELINE,
  'decision-tree': DECISION_TREE,
  er: ER,
  tradeoffs: TRADEOFFS,
};

export function definition<T extends DiagramType>(type: T): DiagramDef<T> {
  return DIAGRAMS[type];
}

export interface View {
  name: string;
  render(context: RenderContext): Rendered;
  targets(): Part[];
  ends(edge: EdgeIndex): [string, string] | undefined;
  members(id: NodeId): Members | undefined;
  turnable(): boolean;
  trail(step: number): number[] | undefined;
  withoutMuted(pinned: (id: NodeId) => boolean): Diagram | undefined;
}

export function view(diagram: Diagram): View {
  return bind(diagram);
}

function bind<T extends DiagramType>(d: Diagram<T> & { type: T }): View {
  const def = definition(d.type);
  return {
    name: def.name,
    render: (context) => def.render(d, context),
    targets: () => def.targets(d),
    ends: (edge) => def.ends?.(d, edge),
    members: (id) => def.members?.(d, id),
    turnable: () => def.turnable?.(d) ?? false,
    trail: (step) => def.trail?.(d, step),
    withoutMuted: (pinned) => def.withoutMuted?.(d, pinned),
  };
}
