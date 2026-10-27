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

export const SEQUENCE_KINDS = ['user', 'service', 'database', 'queue', 'external'] as const;
export type SequenceKind = (typeof SEQUENCE_KINDS)[number];
export type Participant = Node & { kind?: SequenceKind };

export type Sequence = Graph<Participant, Edge, NodeTarget | EdgeTarget> & {
  type: 'sequence';
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
  name: string;
  label: string;
  reinforcing: boolean;
  edges: NonEmpty<EdgeIndex>;
  line: number;
}

export type CausalLoop = Graph<Node, Link, NodeTarget | EdgeTarget> & {
  type: 'causal-loop';
  loops: Loop[];
};

export type TimeForm = 'year' | 'month' | 'day' | 'datetime' | 'clock';

export interface Time {
  text: string;
  form: TimeForm;
  value: number;
}

export type DatedEvent = Node & { at: Time; lastsMs?: number };

type TimelineBase = Header & {
  type: 'timeline';
  direction?: Direction;
  edges: Edge[];
  groups: Group[];
  steps: Step<NodeTarget | EdgeTarget>[];
};

export type Timeline = TimelineBase &
  ({ dating: 'undated'; nodes: Node[] } | { dating: 'clock' | 'calendar'; nodes: DatedEvent[] });

export type DecisionTree = Graph<Node, Edge<'->' | '-->'>, NodeTarget | EdgeTarget> & {
  type: 'decision-tree';
  direction?: Direction;
  root: NodeId;
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
  value: string;
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
export type Target = Diagram['steps'][number]['target'];

export interface Ref {
  diagram: DiagramId;
  target: NodeTarget | PropTarget;
  marker: string;
  line: number;
}
