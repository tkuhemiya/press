import type { Architecture, CausalLoop, DecisionTree, Direction, Edge, Er, Node, StateMachine } from '../../model.ts';
import type { Line, Seg, TermEdge, TermGraph, TermNode } from './graph.ts';
import { edgeLook, errorMark, labelLines, nodeLook, type Markers } from './style.ts';
import type { Theme } from './theme.ts';

export interface Ctx {
  theme: Theme;
  mark: Markers;
  maxLabel: number;
}

function plainNode(node: Node, ctx: Ctx, extra: Partial<TermNode> = {}, outcome = false): TermNode {
  const look = nodeLook(node.role, outcome);
  const head: Seg[] = node.role === 'error' ? [{ text: errorMark(ctx.theme), token: 'error' }] : [];
  const lines: Line[] = [
    ...labelLines(node.label, ctx.maxLabel, look.label, ctx.mark({ type: 'node', id: node.id }), head),
    ...(node.note ? labelLines(node.note, ctx.maxLabel, 'note') : []),
  ];
  const out: TermNode = { id: node.id, lines, border: look.border, token: look.token, ...extra };
  if (node.group !== undefined) out.group = node.group;
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
  return { from: e.from, to: e.to, both: e.arrow === '<->', label: lines, kind: look.kind, token: look.token };
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

export function architectureGraph(d: Architecture, ctx: Ctx): TermGraph {
  const nodes = d.nodes.map((node) => {
    const tag = ctx.maxLabel > 10 ? (node.icon ?? node.kind) : undefined;
    return plainNode(node, ctx, tag ? { tag } : {});
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

export function erGraph(d: Er, ctx: Ctx): TermGraph {
  const nodes = d.nodes.map((entity): TermNode => {
    const look = nodeLook(entity.role);
    const nameW = Math.max(0, ...entity.fields.map((f) => f.name.length));
    const typeW = Math.max(0, ...entity.fields.map((f) => (f.type ?? '').length + (f.nullable ? 1 : 0)));
    const title: Line = [
      { text: entity.label, token: look.label === 'label' ? 'title' : look.label },
      ...ctx.mark({ type: 'node', id: entity.id }).flatMap((m) => [{ text: ' ', token: 'text' as const }, m]),
    ];
    const fields: Line[] = entity.fields.map((f) => {
      const flag = f.primary ? 'key' : f.unique ? 'unique' : '';
      const type = `${f.type ?? ''}${f.nullable ? '?' : ''}`;
      const token =
        f.role === 'muted' ? 'muted' : f.role === 'error' ? 'error' : f.role === 'focus' ? 'focus-label' : 'label';
      return [
        { text: f.name.padEnd(nameW + 2), token },
        { text: type.padEnd(typeW), token: 'note' },
        ...(flag ? [{ text: `  ${flag}`, token: 'tag' as const }] : []),
        ...ctx
          .mark({ type: 'prop', node: entity.id, key: f.name })
          .flatMap((m) => [{ text: ' ', token: 'text' as const }, m]),
      ];
    });
    const out: TermNode = {
      id: entity.id,
      lines: [title, ...fields],
      border: look.border,
      token: look.token,
      ...(fields.length ? { divider: 0 } : {}),
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

export function directionsFor(explicit: Direction | undefined, turnable: boolean): Direction[] {
  if (explicit) return [explicit, explicit === 'down' ? 'right' : 'down'];
  return turnable ? ['down', 'right'] : ['down'];
}
