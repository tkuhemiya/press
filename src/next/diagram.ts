import type { Diagram, DiagramType, Html, NodeId, NodeTarget, PropTarget } from './model.ts';
import type { Fence, Grammar } from './grammar.ts';
import type { Reporter } from './diagnostics.ts';
import { ARCHITECTURE } from './architecture.ts';
import { DECISION_TREE } from './decision-tree.ts';
import { STATE_MACHINE } from './state-machine.ts';
import { TIMELINE } from './timeline.ts';

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

export const DIAGRAMS: Partial<Registry> = {
  'state-machine': STATE_MACHINE,
  architecture: ARCHITECTURE,
  timeline: TIMELINE,
  'decision-tree': DECISION_TREE,
};

export function definition<T extends DiagramType>(type: T): DiagramDef<T> {
  const def: DiagramDef<T> | undefined = DIAGRAMS[type];
  if (!def) throw new Error(`${type} is not on the new model yet`);
  return def;
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
