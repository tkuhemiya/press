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
  // er only: the fields an edge joins, when it joins fields rather than whole entities.
  fromKey?: string;
  toKey?: string;
  arrow: Arrow;
  label?: string;
  role?: Role;
  attrs: Attrs;
  line: number;
}

// A named value that belongs to a node: `node.key : value {attrs}`. A field in `er`, a cell
// in `tradeoffs`. Steps, prose references and the drawing address it as `node.key`.
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

// A node step's id may be a property's `node.key`.
export type StepTarget = { type: 'node'; id: string } | { type: 'edge'; index: number };

export interface Step {
  target: StepTarget;
  caption: string;
  line: number;
}

// A named feedback loop in a causal-loop diagram. Its kind comes from the edge polarities:
// an even number of `-` reinforces (R), an odd number balances (B).
export interface Loop {
  name: string;
  kind: 'R' | 'B';
  // R1, R2, B1… numbered per kind in source order.
  label: string;
  // The nodes in loop order, without repeating the first.
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
  // In order of first use.
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  groups: DiagramGroup[];
  // er and tradeoffs only, in source order.
  props: Property[];
  steps: Step[];
  // causal-loop only.
  loops: Loop[];
  line: number;
}
