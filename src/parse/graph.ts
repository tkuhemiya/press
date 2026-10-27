import type {
  DiagramId,
  Direction,
  Edge,
  EdgeIndex,
  EdgeTarget,
  Group,
  GroupId,
  Node,
  NodeId,
  NodeTarget,
  PropTarget,
  Role,
  Step,
  Time,
} from '../model.ts';
import type { Attrs, Chain, End, Fence, Prop, RawStep } from './grammar.ts';
import { edgeIndex, groupId } from '../brand.ts';
import { closest, list, type Reporter } from '../diagnostics.ts';

export interface DraftNode {
  id: NodeId;
  label: string;
  kind?: string;
  role?: Role;
  note?: string;
  attrs: Map<string, string>;
  at?: Time;
  group?: GroupId;
  line: number;
}

export interface DraftEdge {
  edge: Edge;
  from: End;
  to: End;
  attrs: Attrs;
}

export interface DraftProp {
  node: NodeId;
  key: NodeId;
  value?: string;
  role?: Role;
  attrs: Attrs;
  line: number;
}

export interface DraftGraph {
  nodes: DraftNode[];
  edges: Edge[];
  links: DraftEdge[];
  props: DraftProp[];
  groups: Group[];
}

export type Ensure = (id: NodeId, line: number, group: GroupId | undefined) => DraftNode;

export interface GraphRules {
  label(id: NodeId): string;
  chain?(statement: Chain): boolean;
  prop?(statement: Prop, owner: DraftNode, isNew: boolean, ensure: Ensure): void;
  empty: string;
}

export function buildGraph(fence: Fence, report: Reporter, rules: GraphRules): DraftGraph {
  const nodes: DraftNode[] = [];
  const byId = new Map<NodeId, DraftNode>();
  const edges: Edge[] = [];
  const links: DraftEdge[] = [];
  const props: DraftProp[] = [];
  const groups: Group[] = fence.groups.map((g) => ({ ...g }));
  const declared = new Set<NodeId>();
  const ensure: Ensure = (id, line, group) => {
    const found = byId.get(id);
    if (found) return found;
    const node: DraftNode = { id, label: rules.label(id), attrs: new Map(), line };
    if (group !== undefined) node.group = group;
    nodes.push(node);
    byId.set(id, node);
    return node;
  };
  const apply = (node: DraftNode, s: { role?: Role; note?: string; attrs: Attrs }) => {
    if (s.role) node.role = s.role;
    if (s.note !== undefined) node.note = s.note;
    for (const [k, v] of s.attrs) node.attrs.set(k, v);
  };
  const place = (node: DraftNode, group: GroupId | undefined) => {
    if (group === undefined) delete node.group;
    else node.group = group;
  };

  for (const s of fence.statements) {
    switch (s.type) {
      case 'declare': {
        if (declared.has(s.id))
          warn(s.line, `\`${s.id}\` is declared twice; the later declaration wins.`, 'Keep one declaration.');
        declared.add(s.id);
        const node = ensure(s.id, s.line, s.group);
        place(node, s.group);
        node.line = s.line;
        if (s.label !== undefined) node.label = s.label;
        if (s.kind !== undefined) node.kind = s.kind;
        apply(node, s);
        break;
      }
      case 'event': {
        const node = ensure(s.id, s.line, s.group);
        if (node.at)
          warn(s.line, `\`${s.id}\` is given a time twice; the later one wins.`, 'Keep one event line for it.');
        declared.add(s.id);
        place(node, s.group);
        node.line = s.line;
        node.at = s.at;
        if (s.label !== undefined) node.label = s.label;
        apply(node, s);
        break;
      }
      case 'mention': {
        const node = ensure(s.id, s.line, s.group);
        if (s.group !== undefined) {
          if (node.group !== undefined && node.group !== s.group)
            warn(
              s.line,
              `\`${s.id}\` is already in group "${groups[node.group].label}"; it moves to "${groups[s.group].label}".`,
              'A node belongs to one group. List it in only one.',
            );
          node.group = s.group;
        }
        apply(node, s);
        break;
      }
      case 'chain': {
        if (rules.chain && !rules.chain(s)) break;
        for (let i = 0; i + 1 < s.ends.length; i++) {
          const from = s.ends[i];
          const to = s.ends[i + 1];
          ensure(from.node, s.line, s.group);
          ensure(to.node, s.line, s.group);
          const edge: Edge = {
            index: edgeIndex(edges.length),
            from: from.node,
            to: to.node,
            arrow: s.arrows[i],
            line: s.line,
          };
          if (s.label !== undefined) edge.label = s.label;
          if (s.role) edge.role = s.role;
          edges.push(edge);
          links.push({ edge, from, to, attrs: s.attrs });
        }
        break;
      }
      case 'prop': {
        const isNew = !byId.has(s.node);
        const owner = ensure(s.node, s.line, s.group);
        rules.prop?.(s, owner, isNew, ensure);
        const at = props.findIndex((p) => p.node === s.node && p.key === s.key);
        const earlier = props[at];
        if (earlier) {
          warn(
            s.line,
            `\`${s.node}.${s.key}\` is given twice; the later one wins.`,
            `Keep one line for it; the first is on line ${earlier.line}.`,
          );
          props.splice(at, 1);
        }
        const prop: DraftProp = { node: s.node, key: s.key, attrs: s.attrs, line: s.line };
        if (s.value !== undefined) prop.value = s.value;
        if (s.role) prop.role = s.role;
        props.push(prop);
        break;
      }
      case 'loop':
        break;
      default:
        s satisfies never;
    }
  }

  groups.forEach((g, i) => {
    if (!nodes.some((node) => inGroup(groups, node.group, i)))
      warn(
        g.line,
        `Group "${g.label}" has no members, so it is not drawn.`,
        'List its members by id inside the braces, one per line: `group "Name" {` then `api`, `db`, then `}`.',
      );
  });
  if (!nodes.length) warn(fence.line, `The ${fence.type} fence is empty.`, rules.empty);
  return { nodes, edges, links, props, groups };

  function warn(line: number, message: string, hint: string) {
    report.warn(line, message, hint);
  }
}

export function header<T extends string>(
  fence: Fence,
  type: T,
): { type: T; line: number; id?: DiagramId; title?: string; direction?: Direction } {
  const out: { type: T; line: number; id?: DiagramId; title?: string; direction?: Direction } = {
    type,
    line: fence.line,
  };
  if (fence.id !== undefined) out.id = fence.id;
  if (fence.title !== undefined) out.title = fence.title;
  if (fence.direction !== undefined) out.direction = fence.direction;
  return out;
}

export function inGroup(groups: readonly Group[], start: GroupId | undefined, g: number): boolean {
  for (let p = start; p !== undefined; p = groups[p].parent) if (p === g) return true;
  return false;
}

export function groupDepth(groups: readonly Group[], g: Group): number {
  let k = 0;
  for (let p = g.parent; p !== undefined; p = groups[p].parent) k++;
  return k;
}

export function toNode(d: DraftNode): Node {
  const node: Node = { id: d.id, label: d.label, line: d.line };
  if (d.role) node.role = d.role;
  if (d.note !== undefined) node.note = d.note;
  if (d.group !== undefined) node.group = d.group;
  return node;
}

export function resolveSteps(
  raw: readonly RawStep[],
  nodes: readonly { id: NodeId }[],
  edges: readonly Edge[],
  report: Reporter,
): Step<NodeTarget | EdgeTarget>[] {
  const ids = new Set(nodes.map((node) => node.id));
  const out: Step<NodeTarget | EdgeTarget>[] = [];
  for (const s of raw) {
    const target = resolveStep(s, ids, edges, report);
    if (target) out.push({ target, caption: s.caption, line: s.line });
  }
  return out;
}

export interface Parts {
  props: readonly { node: NodeId; key: NodeId }[];
  keyed: readonly DraftEdge[];
}

export function resolvePartSteps(
  raw: readonly RawStep[],
  nodes: readonly { id: NodeId }[],
  edges: readonly Edge[],
  parts: Parts,
  report: Reporter,
): Step<NodeTarget | EdgeTarget | PropTarget>[] {
  const ids = new Set(nodes.map((node) => node.id));
  const out: Step<NodeTarget | EdgeTarget | PropTarget>[] = [];
  for (const s of raw) {
    const target =
      s.from.key !== undefined || s.to?.key !== undefined
        ? resolvePart(s, parts, report)
        : resolveStep(s, ids, edges, report);
    if (target) out.push({ target, caption: s.caption, line: s.line });
  }
  return out;
}

const endText = (e: End): string => (e.key === undefined ? e.node : `${e.node}.${e.key}`);

function resolvePart(s: RawStep, parts: Parts, { error }: Reporter): EdgeTarget | PropTarget | undefined {
  const { from, to } = s;
  if (to === undefined) {
    const prop = parts.props.find((p) => p.node === from.node && p.key === from.key);
    if (prop) return { type: 'prop', node: prop.node, key: prop.key };
    const near = closest(
      endText(from),
      parts.props.map((p) => `${p.node}.${p.key}`),
    );
    error(
      s.line,
      `Step refers to \`${endText(from)}\`, which is not a property in the diagram.`,
      near ? `Did you mean \`${near}\`?` : 'Declare it first: `node.key : value`.',
    );
    return;
  }
  const found = parts.keyed.filter(
    (e) =>
      endText(e.from) === endText(from) &&
      endText(e.to) === endText(to) &&
      (s.label === undefined || e.edge.label === s.label),
  );
  const [only, ...others] = found;
  if (only && !others.length) return { type: 'edge', index: only.edge.index };
  const edges = parts.keyed.map((e) => `\`${endText(e.from)} -> ${endText(e.to)}\``);
  error(
    s.line,
    `Step refers to an edge \`${endText(from)} -> ${endText(to)}\` that the diagram does not have.`,
    edges.length ? `Edges: ${edges.join(', ')}.` : 'Add the edge above `steps:`.',
  );
  return;
}

function resolveStep(
  s: RawStep,
  ids: ReadonlySet<NodeId>,
  edges: readonly Edge[],
  { error }: Reporter,
): NodeTarget | EdgeTarget | undefined {
  const missing = (id: NodeId): boolean => {
    if (ids.has(id)) return false;
    const near = closest(id, ids);
    error(
      s.line,
      `Step refers to \`${id}\`, which is not in the diagram.`,
      near ? `Did you mean \`${near}\`?` : `Nodes: ${list(ids)}.`,
    );
    return true;
  };
  if (s.from.key !== undefined || s.to?.key !== undefined) {
    if (s.to === undefined) {
      error(
        s.line,
        `Step refers to \`${endText(s.from)}\`, which is not a property in the diagram.`,
        'Declare it first: `node.key : value`.',
      );
      return;
    }
    error(
      s.line,
      `Step refers to an edge \`${endText(s.from)} -> ${endText(s.to)}\` that the diagram does not have.`,
      edges.length
        ? `Edges: ${edges.map((e) => `\`${e.from} -> ${e.to}\``).join(', ')}.`
        : 'Add the edge above `steps:`.',
    );
    return;
  }
  const from = s.from.node;
  if (s.to === undefined) return missing(from) ? undefined : { type: 'node', id: from };
  const to = s.to.node;
  const joins = edges.filter(
    (e) => (e.from === from && e.to === to) || (e.arrow === '<->' && e.from === to && e.to === from),
  );
  const matches = s.label === undefined ? joins : joins.filter((e) => e.label === s.label);
  const [only, ...others] = matches;
  if (only && !others.length) return { type: 'edge', index: only.index };
  if (!joins.length) {
    if (missing(from) || missing(to)) return;
    const fromHere = edges.filter((e) => e.from === from).map((e) => `\`${e.from} -> ${e.to}\``);
    error(
      s.line,
      `Step refers to an edge \`${from} -> ${to}\` that the diagram does not have.`,
      fromHere.length
        ? `Edges from \`${from}\`: ${fromHere.join(', ')}.`
        : `Add the edge above \`steps:\`, or step through a node with \`${from} "caption"\`.`,
    );
    return;
  }
  const options = joins.map((e) =>
    e.label ? `\`${e.from} -> ${e.to} : ${e.label} "…"\`` : `(unlabelled, line ${e.line})`,
  );
  if (!matches.length)
    error(
      s.line,
      `No edge \`${from} -> ${to}\` has the label "${s.label}".`,
      `Labels on this edge: ${options.join(', ')}.`,
    );
  else
    error(
      s.line,
      `Step \`${from} -> ${to}\` is ambiguous: ${matches.length} edges join these nodes.`,
      `Name the edge by its label: ${options.join(', ')}.`,
    );
  return;
}

export type GraphParts<N extends Node, E extends Edge = Edge> = Parted<N, E, NodeTarget | EdgeTarget>;

interface Parted<N extends Node, E extends Indexed, T extends AnyTarget> {
  nodes: N[];
  edges: E[];
  groups: Group[];
  steps: Step<T>[];
}

type AnyTarget = NodeTarget | EdgeTarget | PropTarget;
type Indexed = { index: EdgeIndex; role?: Role };

const edgeTarget = (index: EdgeIndex): EdgeTarget => ({ type: 'edge', index });

export function keepOnly<N extends Node, E extends Edge>(g: GraphParts<N, E>): GraphParts<N, E> {
  const ids = new Set(g.nodes.map((node) => node.id));
  const edges = g.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  if (edges.length === g.edges.length && g.steps.every((s) => s.target.type === 'edge' || ids.has(s.target.id)))
    return g;
  return renumber(
    g.nodes,
    g.groups,
    edges,
    g.steps.filter((s) => s.target.type === 'edge' || ids.has(s.target.id)),
    edgeTarget,
  );
}

export function lean<N extends Node, E extends Edge>(
  g: GraphParts<N, E>,
  pinned: (id: NodeId) => boolean,
): GraphParts<N, E> | undefined {
  return leanBy(g, pinned, (e) => [e.from, e.to], edgeTarget);
}

export function leanBy<N extends Node, E extends Indexed, T extends AnyTarget>(
  g: Parted<N, E, T>,
  pinned: (id: NodeId) => boolean,
  ends: (e: E) => [NodeId, NodeId],
  retarget: (index: EdgeIndex) => T,
): Parted<N, E, T> | undefined {
  const drop = new Set(g.nodes.filter((node) => node.role === 'muted').map((node) => node.id));
  const edges = g.edges.filter((e) => e.role !== 'muted' && !ends(e).some((id) => drop.has(id)));
  if (!drop.size && edges.length === g.edges.length) return undefined;
  const kept = new Set(edges.map((e) => e.index));
  for (const s of g.steps) {
    const t: AnyTarget = s.target;
    if (t.type === 'edge' && !kept.has(t.index)) return undefined;
    if (t.type === 'node' && drop.has(t.id)) return undefined;
    if (t.type === 'prop' && drop.has(t.node)) return undefined;
  }
  if ([...drop].some(pinned)) return undefined;
  const nodes = g.nodes.filter((node) => !drop.has(node.id));
  const used = new Set<number>();
  for (const node of nodes) for (let p = node.group; p !== undefined; p = g.groups[p].parent) used.add(p);
  const index = new Map([...used].sort((a, b) => a - b).map((old, i) => [old, groupId(i)]));
  const regroup = (p: GroupId | undefined) => (p === undefined ? undefined : index.get(p));
  const groups = [...index.keys()].map((old) => {
    const { parent, ...group } = g.groups[old];
    const moved = regroup(parent);
    return moved === undefined ? group : { ...group, parent: moved };
  });
  const placed = nodes.map((node) => ({ ...node, group: regroup(node.group) }));
  return renumber(placed, groups, edges, g.steps, retarget);
}

function renumber<N extends Node, E extends Indexed, T extends AnyTarget>(
  nodes: N[],
  groups: Group[],
  edges: E[],
  steps: Step<T>[],
  retarget: (index: EdgeIndex) => T,
): Parted<N, E, T> {
  const index = new Map(edges.map((e, i) => [e.index, edgeIndex(i)]));
  return {
    nodes,
    groups,
    edges: edges.map((e, i) => ({ ...e, index: edgeIndex(i) })),
    steps: steps.flatMap((s) => {
      const t: AnyTarget = s.target;
      if (t.type !== 'edge') return [s];
      const moved = index.get(t.index);
      return moved === undefined ? [] : [{ ...s, target: retarget(moved) }];
    }),
  };
}
