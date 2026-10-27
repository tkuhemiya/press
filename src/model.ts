// The typed model a Press document parses into. Line numbers are 1-based and refer to the
// Markdown source.

export type Severity = 'error' | 'warning';

export interface Diagnostic {
  severity: Severity;
  line: number;
  message: string;
  // A concrete fix, phrased so an author (often an LLM) can apply it directly.
  hint?: string;
}

export type Attrs = Record<string, string>;

export const ROLES = ['focus', 'error', 'happy', 'muted'] as const;
export type Role = (typeof ROLES)[number];

export type Arrow = '->' | '-->' | '<->';

// A timeline event's time. `value` is milliseconds: since the epoch (UTC) for calendar forms,
// since midnight for a clock time.
export type TimeForm = 'year' | 'month' | 'day' | 'datetime' | 'clock';
export interface Time {
  text: string;
  form: TimeForm;
  value: number;
}

export interface DiagramNode {
  id: string;
  label: string;
  kind?: string;
  role?: Role;
  attrs: Attrs;
  // Timeline events only: when it happened, and when a span ends.
  time?: Time;
  until?: Time;
  // Index into Diagram.groups, or -1 for top level.
  group: number;
  line: number;
}

export interface DiagramEdge {
  index: number;
  from: string;
  to: string;
  arrow: Arrow;
  label?: string;
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

export const DIAGRAM_TYPES = ['state-machine', 'sequence', 'architecture', 'causal-loop', 'timeline'] as const;
export type DiagramType = (typeof DIAGRAM_TYPES)[number];

export interface Diagram {
  type: DiagramType;
  id?: string;
  title?: string;
  direction?: 'right' | 'down';
  // In order of first use.
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  groups: DiagramGroup[];
  steps: Step[];
  line: number;
}
