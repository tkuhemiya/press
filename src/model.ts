export type NodeId = string & { readonly __brand: 'NodeId' };
export type DiagramId = string & { readonly __brand: 'DiagramId' };
export type GroupId = number & { readonly __brand: 'GroupId' };
export type EdgeIndex = number & { readonly __brand: 'EdgeIndex' };
export type Html = string & { readonly __brand: 'Html' };

export type NonEmpty<T> = [T, ...T[]];

export type Severity = 'error' | 'warning';

export interface Diagnostic {
  severity: Severity;
  line: number;
  message: string;
  hint: string;
}

export const ROLES = ['focus', 'error', 'happy', 'muted'] as const;
export type Role = (typeof ROLES)[number];

export type Direction = 'right' | 'down';

export interface Group {
  label: string;
  parent?: GroupId;
  line: number;
}

export interface Node {
  id: NodeId;
  label: string;
  role?: Role;
  note?: string;
  group?: GroupId;
  line: number;
}

export type Arrow = '->' | '-->' | '<->';

export interface Edge<A extends Arrow = Arrow> {
  index: EdgeIndex;
  from: NodeId;
  to: NodeId;
  arrow: A;
  label?: string;
  role?: Role;
  line: number;
}

export type NodeTarget = { type: 'node'; id: NodeId };
export type EdgeTarget = { type: 'edge'; index: EdgeIndex };
export type PropTarget = { type: 'prop'; node: NodeId; key: NodeId };
export type EdgesTarget = { type: 'edges'; id: NodeId };
export type Target = NodeTarget | EdgeTarget | PropTarget | EdgesTarget;

export interface Step<T> {
  target: T;
  caption: Html;
  line: number;
}

interface Header {
  id?: DiagramId;
  title?: string;
  line: number;
}

interface Graph<N extends Node, E extends Edge, T> extends Header {
  nodes: N[];
  edges: E[];
  groups: Group[];
  steps: Step<T>[];
}

export type StateMachine = Graph<Node, Edge, NodeTarget | EdgeTarget> & {
  type: 'state-machine';
  direction?: Direction;
};

export const SEQUENCE_KINDS = ['user', 'client', 'service', 'database', 'queue', 'external'] as const;
export type SequenceKind = (typeof SEQUENCE_KINDS)[number];
export type Participant = Node & { kind?: SequenceKind };

export type PhaseIndex = number & { readonly __brand: 'PhaseIndex' };

export interface Phase {
  id?: NodeId;
  label: string;
  parent?: PhaseIndex;
  edges: EdgeIndex[];
  line: number;
}

export type Sequence = Graph<Participant, Edge, NodeTarget | EdgeTarget | EdgesTarget> & {
  type: 'sequence';
  phases: Phase[];
};

export const ARCHITECTURE_KINDS = [
  'client',
  'service',
  'database',
  'queue',
  'cache',
  'storage',
  'external',
  'user',
] as const;
export type ArchitectureKind = (typeof ARCHITECTURE_KINDS)[number];
export type Component = Node & { kind?: ArchitectureKind };

export type Architecture = Graph<Component, Edge, NodeTarget | EdgeTarget> & {
  type: 'architecture';
  direction?: Direction;
};

export type Polarity = '+' | '-';
export type Link = Edge<'->' | '-->'> & { polarity: Polarity; delay: boolean };

export interface Loop {
  id?: NodeId;
  name: string;
  label: string;
  reinforcing: boolean;
  edges: NonEmpty<EdgeIndex>;
  line: number;
}

export type CausalLoop = Graph<Node, Link, NodeTarget | EdgeTarget | EdgesTarget> & {
  type: 'causal-loop';
  loops: Loop[];
};

export type TimeForm = 'year' | 'month' | 'day' | 'datetime' | 'clock' | 'elapsed';

export interface Time {
  text: string;
  form: TimeForm;
  value: number;
}

export type Dating = 'clock' | 'calendar' | 'elapsed';

export type Moment = Node & { lane?: number };
export type DatedEvent = Moment & { at: Time; lastsMs?: number };

export interface Lane {
  label: string;
  line: number;
}

type TimelineBase = Header & {
  type: 'timeline';
  direction?: Direction;
  edges: Edge[];
  groups: Group[];
  lanes: Lane[];
  steps: Step<NodeTarget | EdgeTarget>[];
};

export type Timeline = TimelineBase &
  ({ dating: 'undated'; nodes: Moment[] } | { dating: Dating; nodes: DatedEvent[] });

export type DecisionTree = Graph<Node, Edge<'->' | '-->'>, NodeTarget | EdgeTarget> & {
  type: 'decision-tree';
  direction?: Direction;
  root?: NodeId;
};

export type Cardinality = '1' | '0..1' | 'N' | '1..N';

export interface Field {
  entity: NodeId;
  name: NodeId;
  type?: string;
  primary: boolean;
  unique: boolean;
  nullable: boolean;
  role?: Role;
  line: number;
}

export type Entity = Node & { fields: Field[] };

export type FieldRef = { entity: NodeId; field: NodeId };

export type Reference = Omit<Edge<'->' | '-->'>, 'from' | 'to'> & {
  cardinality: [Cardinality, Cardinality];
} & ({ level: 'entity'; from: NodeId; to: NodeId } | { level: 'field'; from: FieldRef; to: FieldRef });

export interface Er extends Header {
  type: 'er';
  direction?: Direction;
  nodes: Entity[];
  edges: Reference[];
  groups: Group[];
  steps: Step<NodeTarget | EdgeTarget | PropTarget>[];
}

export interface Cell {
  option: NodeId;
  criterion: NodeId;
  value?: string;
  note?: string;
  role?: Role;
  line: number;
}

export interface Tradeoffs extends Header {
  type: 'tradeoffs';
  direction?: Direction;
  options: Node[];
  criteria: Node[];
  categories: Group[];
  cells: Cell[];
  steps: Step<NodeTarget | PropTarget>[];
}

export interface DiagramMap {
  'state-machine': StateMachine;
  sequence: Sequence;
  architecture: Architecture;
  'causal-loop': CausalLoop;
  timeline: Timeline;
  'decision-tree': DecisionTree;
  er: Er;
  tradeoffs: Tradeoffs;
}

export type DiagramType = keyof DiagramMap;
export type Diagram<T extends DiagramType = DiagramType> = DiagramMap[T];

export function targetName(t: Target): string {
  switch (t.type) {
    case 'prop':
      return `${t.node}.${t.key}`;
    case 'edge':
      return `#${t.index}`;
    case 'node':
    case 'edges':
      return t.id;
  }
}

export type Named = NodeTarget | PropTarget | EdgesTarget;

export interface Part {
  target: Named;
  role?: Role;
}

export interface Ref {
  diagram: DiagramId;
  target: Target;
  marker: string;
  line: number;
}
