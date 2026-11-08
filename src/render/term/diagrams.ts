import type {
  C4Diagram,
  Change,
  CausalLoop,
  ClassDiagram,
  DecisionTree,
  Direction,
  Edge,
  Er,
  Group,
  Node,
  Role,
  StateMachine,
} from '../../model.ts';
import { renameOf, signedText } from '../../diagrams/sign.ts';
import type { Line, Seg, TermEdge, TermGraph, TermNode } from './graph.ts';
import { edgeLook, errorMark, labelLines, nodeLook, type Markers } from './style.ts';
import type { Theme, Token } from './theme.ts';

export interface Ctx {
  theme: Theme;
  mark: Markers;
  maxLabel: number;
}

function plainNode(node: Node, ctx: Ctx, extra: Partial<TermNode> = {}, outcome = false): TermNode {
  const look = nodeLook(node.role, outcome);
  const head: Seg[] = node.role === 'error' ? [{ text: errorMark(ctx.theme), token: 'error' }] : [];
  const was = renameOf(node);
  const name = (text: string, marks: Seg[]): Line[] => labelLines(text, ctx.maxLabel, look.label, marks, head);
  const note: Line[] = node.note ? labelLines(node.note, ctx.maxLabel, 'note') : [];
  const marks = ctx.mark({ type: 'node', id: node.id });
  const lines: Line[] = [...name(was === undefined ? node.label : signedText(node.label, 'added'), marks), ...note];
  const out: TermNode = { id: node.id, lines, border: look.border, token: look.token, ...extra };
  if (node.group !== undefined) out.group = node.group;
  if (node.change) out.change = node.change;
  if (was !== undefined) out.was = [...name(signedText(was, 'removed'), marks), ...note];
  return out;
}

function plainEdge(e: Edge, ctx: Ctx, label = e.label ?? '', tail: Seg[] = []): TermEdge {
  const look = edgeLook(e.role, e.arrow);
  const head: Seg[] = e.role === 'error' ? [{ text: errorMark(ctx.theme), token: 'error' }] : [];
  const marks = [...tail, ...ctx.mark({ type: 'edge', index: e.index })];
  const token = e.role === 'muted' ? 'muted' : e.role === 'error' ? 'error' : 'label';
  const lines = label
    ? labelLines(label, ctx.maxLabel, token, marks, head)
    : marks.length || head.length
      ? [[...head, ...marks.flatMap((m, i) => (i ? [{ text: ' ', token: 'text' as const }, m] : [m]))]]
      : [];
  const out: TermEdge = {
    from: e.from,
    to: e.to,
    both: e.arrow === '<->',
    label: lines,
    kind: look.kind,
    token: look.token,
  };
  if (e.change) out.change = e.change;
  return out;
}

export function stateMachineGraph(d: StateMachine, ctx: Ctx): TermGraph {
  const { ascii } = ctx.theme;
  const nodes = d.nodes.map((node): TermNode => {
    if (node.id === 'start')
      return {
        id: node.id,
        lines: [],
        border: 'light',
        token: 'line',
        glyph: { text: ascii ? '*' : '●', token: 'label' },
        first: true,
      };
    if (node.id === 'end')
      return {
        id: node.id,
        lines: [],
        border: 'light',
        token: 'line',
        glyph: { text: ascii ? '@' : '◉', token: 'label' },
      };
    return plainNode(node, ctx);
  });
  return { nodes, edges: d.edges.map((e) => plainEdge(e, ctx)), groups: d.groups };
}

interface Kinded {
  nodes: readonly (Node & { kind?: string; icon?: string })[];
  edges: readonly Edge[];
  groups: readonly Group[];
}

export function kindedGraph(d: Kinded, ctx: Ctx): TermGraph {
  const nodes = d.nodes.map((node) => {
    const tag = ctx.maxLabel > 10 ? (node.icon ?? node.kind) : undefined;
    return plainNode(node, ctx, tag ? { tag } : {});
  });
  return { nodes, edges: d.edges.map((e) => plainEdge(e, ctx)), groups: d.groups };
}

export function c4Graph(d: C4Diagram, ctx: Ctx): TermGraph {
  const nodes = d.nodes.map((node) => {
    const sub = [node.tech === undefined ? undefined : `[${node.tech}]`, node.note].filter((t) => t !== undefined);
    const shown: Node = sub.length ? { ...node, note: sub.join(' · ') } : node;
    const tag = ctx.maxLabel > 10 ? node.kind : undefined;
    const term = plainNode(shown, ctx, tag ? { tag } : {});
    return node.external && term.border === 'light' ? { ...term, border: 'dashed' as const } : term;
  });
  return { nodes, edges: d.edges.map((e) => plainEdge(e, ctx)), groups: d.groups };
}

export function decisionTreeGraph(d: DecisionTree, ctx: Ctx): TermGraph {
  const asks = new Set(d.edges.map((e) => e.from));
  const nodes = d.nodes.map((node) =>
    plainNode(node, ctx, node.id === d.root ? { first: true } : {}, !asks.has(node.id)),
  );
  return { nodes, edges: d.edges.map((e) => plainEdge(e, ctx)), groups: d.groups };
}

export function causalLoopGraph(d: CausalLoop, ctx: Ctx): TermGraph {
  const nodes = d.nodes.map((node) => plainNode(node, ctx));
  const edges = d.edges.map((e) => {
    const sign: Seg = {
      text: `${e.delay ? '‖ ' : ''}${e.polarity === '+' ? '+' : ctx.theme.ascii ? '-' : '−'}`,
      token: 'strong',
    };
    return plainEdge(e, ctx, '', [sign]);
  });
  return { nodes, edges, groups: d.groups };
}

export function loopLegend(d: CausalLoop): string[] {
  const label = (id: string): string => d.nodes.find((n) => n.id === id)?.label ?? id;
  return d.loops.map((loop) => {
    const chain = loop.edges.map((i) => d.edges[i]);
    const first = chain[0];
    const path = [
      label(first?.from ?? ''),
      ...chain.map((e) => `${e?.polarity === '-' ? '−' : '+'}→ ${label(e?.to ?? '')}`),
    ];
    return `${loop.label} ${loop.name} (${loop.reinforcing ? 'reinforcing' : 'balancing'}): ${path.join(' ')}`;
  });
}

export const changeToken = (change: Change | undefined): Token | undefined =>
  change === 'added' ? 'added' : change === 'removed' ? 'removed' : undefined;

const roleToken = (role: Role | undefined): Token =>
  role === 'muted' ? 'muted' : role === 'error' ? 'error' : role === 'focus' ? 'focus-label' : 'label';

function titleLines(node: Node, token: Token, ctx: Ctx): Line[] {
  const marks = ctx.mark({ type: 'node', id: node.id }).flatMap((m) => [{ text: ' ', token: 'text' as const }, m]);
  const was = renameOf(node);
  if (was === undefined) return [[{ text: node.label, token }, ...marks]];
  return [
    [{ text: signedText(was, 'removed'), token: 'removed' }],
    [{ text: signedText(node.label, 'added'), token: 'added' }, ...marks],
  ];
}

export function erGraph(d: Er, ctx: Ctx): TermGraph {
  const nodes = d.nodes.map((entity): TermNode => {
    const look = nodeLook(entity.role);
    const nameW = Math.max(0, ...entity.fields.map((f) => signedText(f.name, f.change).length));
    const typeW = Math.max(0, ...entity.fields.map((f) => (f.type ?? '').length + (f.nullable ? 1 : 0)));
    const titles = titleLines(entity, look.label === 'label' ? 'title' : look.label, ctx);
    const fields: Line[] = entity.fields.map((f) => {
      const flag = f.primary ? 'key' : f.unique ? 'unique' : '';
      const type = `${f.type ?? ''}${f.nullable ? '?' : ''}`;
      const token = changeToken(f.change) ?? roleToken(f.role);
      return [
        { text: signedText(f.name, f.change).padEnd(nameW + 2), token },
        { text: type.padEnd(typeW), token: changeToken(f.change) ?? 'note' },
        ...(flag ? [{ text: `  ${flag}`, token: 'tag' as const }] : []),
        ...ctx
          .mark({ type: 'prop', node: entity.id, key: f.name })
          .flatMap((m) => [{ text: ' ', token: 'text' as const }, m]),
      ];
    });
    const out: TermNode = {
      id: entity.id,
      lines: [...titles, ...fields],
      border: look.border,
      token: look.token,
      ...(fields.length ? { divider: titles.length - 1 } : {}),
    };
    if (entity.group !== undefined) out.group = entity.group;
    return out;
  });
  const edges = d.edges.map((r): TermEdge => {
    const from = r.level === 'field' ? r.from.entity : r.from;
    const to = r.level === 'field' ? r.to.entity : r.to;
    const card = `${r.cardinality[0]}:${r.cardinality[1]}`;
    const keys = r.level === 'field' ? `${r.from.field} → ${r.to.field}  ` : '';
    const look = edgeLook(r.role, r.arrow);
    const lines: Line[] = [
      ...(r.label ? labelLines(r.label, ctx.maxLabel, 'label') : []),
      [
        { text: keys, token: 'note' },
        { text: card, token: 'strong' },
        ...ctx.mark({ type: 'edge', index: r.index }).flatMap((m) => [{ text: ' ', token: 'text' as const }, m]),
      ],
    ];
    return { from, to, both: false, label: lines, kind: look.kind, token: look.token };
  });
  return { nodes, edges, groups: d.groups };
}

export function classGraph(d: ClassDiagram, ctx: Ctx): TermGraph {
  const nodes = d.nodes.map((cls): TermNode => {
    const look = nodeLook(cls.role);
    const tag = cls.kind === 'interface' ? 'interface' : cls.kind === 'abstract' ? 'abstract' : undefined;
    const titles = titleLines(cls, look.label === 'label' ? 'title' : look.label, ctx);
    const fields = cls.members.filter((m) => !m.op);
    const methods = cls.members.filter((m) => m.op);
    const row = (m: (typeof cls.members)[number]): Line => {
      const token = changeToken(m.change) ?? roleToken(m.role);
      return [
        { text: signedText(`${m.name}${m.op ? '()' : ''}`, m.change), token },
        { text: m.type ? `  ${m.type}` : '', token: changeToken(m.change) ?? 'note' },
        ...ctx
          .mark({ type: 'prop', node: cls.id, key: m.name })
          .flatMap((x) => [{ text: ' ', token: 'text' as const }, x]),
      ];
    };
    const out: TermNode = {
      id: cls.id,
      lines: [...titles, ...fields.map(row), ...methods.map(row)],
      border: look.border,
      token: look.token,
      ...(fields.length || methods.length ? { divider: titles.length - 1 } : {}),
    };
    if (tag) out.tag = tag;
    if (cls.group !== undefined) out.group = cls.group;
    return out;
  });
  const edges = d.edges.map((e): TermEdge => {
    const rel = e.rel ? `${e.rel} ` : '';
    const look = edgeLook(e.role, e.arrow);
    const lines: Line[] = [
      ...(e.label ? labelLines(e.label, ctx.maxLabel, 'label') : []),
      ...(rel
        ? [
            [
              { text: rel, token: 'strong' as const },
              ...ctx.mark({ type: 'edge', index: e.index }).flatMap((m) => [{ text: ' ', token: 'text' as const }, m]),
            ],
          ]
        : ctx.mark({ type: 'edge', index: e.index }).length
          ? [ctx.mark({ type: 'edge', index: e.index })]
          : []),
    ];
    return { from: e.from, to: e.to, both: e.arrow === '<->', label: lines, kind: look.kind, token: look.token };
  });
  return { nodes, edges, groups: d.groups };
}

export function directionsFor(explicit: Direction | undefined, turnable: boolean): Direction[] {
  if (explicit) return [explicit, explicit === 'down' ? 'right' : 'down'];
  return turnable ? ['down', 'right'] : ['down'];
}
