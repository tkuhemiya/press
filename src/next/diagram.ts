import type { Diagram, DiagramType, Html, NodeId, NodeTarget, PropTarget } from './model.ts';
import type { Fence, Grammar } from './grammar.ts';
import type { Reporter } from './diagnostics.ts';
import { ARCHITECTURE } from './architecture.ts';
import { CAUSAL_LOOP } from './causal-loop.ts';
import { DECISION_TREE } from './decision-tree.ts';
import { ER } from './er.ts';
import { SEQUENCE } from './sequence.ts';
import { STATE_MACHINE } from './state-machine.ts';
import { TIMELINE } from './timeline.ts';
import { TRADEOFFS } from './tradeoffs.ts';

export interface Rendered {
  svg: Html;
  width: number;
  height: number;
}

export interface RenderContext {
  domId: string;
  marker(target: NodeTarget | PropTarget): string | undefined;
}

export interface DiagramDef<T extends DiagramType> {
  type: T;
  name: string;
  grammar: Grammar;
  build(fence: Fence, report: Reporter): Diagram<T>;
  render(diagram: Diagram<T>, context: RenderContext): Rendered;
  withoutMuted?(diagram: Diagram<T>, pinned: (id: NodeId) => boolean): Diagram<T> | undefined;
}

export type Registry = { [T in DiagramType]: DiagramDef<T> };

export const DIAGRAMS: Registry = {
  'state-machine': STATE_MACHINE,
  sequence: SEQUENCE,
  architecture: ARCHITECTURE,
  'causal-loop': CAUSAL_LOOP,
  timeline: TIMELINE,
  'decision-tree': DECISION_TREE,
  er: ER,
  tradeoffs: TRADEOFFS,
};

export function definition<T extends DiagramType>(type: T): DiagramDef<T> {
  return DIAGRAMS[type];
}

export function render<T extends DiagramType>(diagram: Diagram<T> & { type: T }, context: RenderContext): Rendered {
  return definition(diagram.type).render(diagram, context);
}

export function renderAny(diagram: Diagram, context: RenderContext): Rendered {
  return render(diagram, context);
}

export function withoutMuted<T extends DiagramType>(
  diagram: Diagram<T> & { type: T },
  pinned: (id: NodeId) => boolean,
): Diagram<T> | undefined {
  return definition(diagram.type).withoutMuted?.(diagram, pinned);
}

export function withoutMutedAny(diagram: Diagram, pinned: (id: NodeId) => boolean): Diagram | undefined {
  return withoutMuted(diagram, pinned);
}
