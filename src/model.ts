import type { Diagram as Typed } from './next/model.ts';

export type Severity = 'error' | 'warning';

export interface Diagnostic {
  severity: Severity;
  line: number;
  message: string;
  hint?: string;
}

export type Attrs = Record<string, string>;

export const ROLES = ['focus', 'error', 'happy', 'muted'] as const;
export type Role = (typeof ROLES)[number];

export type Arrow = '->' | '-->' | '<->';

export interface DiagramNode {
  id: string;
  label: string;
  kind?: string;
  role?: Role;
  attrs: Attrs;
  group: number;
  line: number;
}

export interface DiagramEdge {
  index: number;
  from: string;
  to: string;
  fromKey?: string;
  toKey?: string;
  arrow: Arrow;
  label?: string;
  role?: Role;
  attrs: Attrs;
  line: number;
}

export interface Property {
  node: string;
  key: string;
  value?: string;
  role?: Role;
  attrs: Attrs;
  line: number;
}

export interface DiagramGroup {
  label: string;
  parent: number;
  line: number;
}

export type StepTarget = { type: 'node'; id: string } | { type: 'edge'; index: number };

export interface Step {
  target: StepTarget;
  caption: string;
  line: number;
}

export interface Loop {
  name: string;
  kind: 'R' | 'B';
  label: string;
  nodes: string[];
  edges: number[];
  line: number;
}

export const DIAGRAM_TYPES = [
  'state-machine',
  'sequence',
  'architecture',
  'causal-loop',
  'timeline',
  'decision-tree',
  'er',
  'tradeoffs',
] as const;
export type DiagramType = (typeof DIAGRAM_TYPES)[number];

export interface Diagram {
  type: DiagramType;
  id?: string;
  title?: string;
  direction?: 'right' | 'down';
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  groups: DiagramGroup[];
  props: Property[];
  steps: Step[];
  loops: Loop[];
  line: number;
  typed?: Typed;
}
