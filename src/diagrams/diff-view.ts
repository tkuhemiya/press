import type { Change, Diagram, DiagramType, Role } from '../model.ts';
import { trusted } from '../brand.ts';
import { attr, type Attrs, type Item, type Scene } from '../scene/scene.ts';
import { changeIn } from '../scene/marks.ts';
import { paintSvg } from '../scene/svg.ts';
import type { Rendered } from './diagram.ts';

export type DiffSide = 'before' | 'after';

const SPLIT: ReadonlySet<DiagramType> = new Set([
  'state-machine',
  'sequence',
  'architecture',
  'data-flow',
  'c4',
  'deployment',
  'causal-loop',
  'decision-tree',
  'timeline',
]);

interface Meta {
  change?: Change;
  role?: Role;
  label: string;
  was?: string;
}

interface Lookup {
  nodes: Map<string, Meta>;
  edges: Map<string, Meta>;
  loops: Map<string, readonly number[]>;
}

export const splitsOnScreen = (d: Diagram): boolean => SPLIT.has(d.type) && hasChanges(d);

function hasChanges(d: Diagram): boolean {
  const { nodes, edges } = lookup(d);
  return [...nodes.values(), ...edges.values()].some((m) => m.change !== undefined);
}

export function paneOf(union: Rendered, side: DiffSide, d: Diagram, id: string): Rendered {
  const scene = projectScene({ ...union.scene, id }, side, lookup(d));
  return { scene, width: scene.width, height: scene.height, svg: trusted(paintSvg(scene)) };
}

function lookup(d: Diagram): Lookup {
  const nodes = new Map<string, Meta>();
  const edges = new Map<string, Meta>();
  const loops = new Map<string, readonly number[]>();
  const node = (n: { id: string; change?: Change; role?: Role; label: string; was?: string }) => {
    nodes.set(n.id, { change: n.change, role: n.role, label: n.label, was: n.was });
  };
  const edge = (e: { index: number; change?: Change; role?: Role; label?: string }) => {
    edges.set(String(e.index), { change: e.change, role: e.role, label: e.label ?? '' });
  };
  switch (d.type) {
    case 'tradeoffs':
      d.options.forEach(node);
      d.criteria.forEach(node);
      break;
    case 'call-stack':
    case 'memory-layout':
      break;
    case 'state-machine':
    case 'sequence':
    case 'architecture':
    case 'data-flow':
    case 'c4':
    case 'deployment':
    case 'causal-loop':
    case 'timeline':
    case 'decision-tree':
    case 'er':
    case 'dependency':
    case 'class':
      d.nodes.forEach(node);
      d.edges.forEach(edge);
      if (d.type === 'causal-loop') {
        d.loops.forEach((l) => {
          loops.set(l.label, l.edges);
          if (l.id !== undefined) node({ id: l.id, ...l, label: l.name });
        });
      }
      if (d.type === 'sequence') d.phases.forEach((p) => p.id !== undefined && node({ id: p.id, ...p }));
      break;
  }
  return { nodes, edges, loops };
}

function onSide(change: Change | undefined, side: DiffSide): boolean {
  if (change === 'added') return side === 'after';
  if (change === 'removed') return side === 'before';
  return true;
}

function keepId(change: Change | undefined, side: DiffSide): boolean {
  return side === 'after' ? change !== 'removed' : change === 'removed';
}

function projectScene(scene: Scene, side: DiffSide, names: Lookup): Scene {
  return { ...scene, items: filterItems(scene.items, side, names) };
}

function filterItems(items: readonly Item[], side: DiffSide, names: Lookup): Item[] {
  const out: Item[] = [];
  for (const item of items) {
    if (item.type !== 'group') {
      out.push(item);
      continue;
    }
    const change = changeIn(item.attrs);
    if (!onSide(change, side)) continue;
    const loop = item.attrs?.find(([k]) => k === 'data-loop')?.[1];
    const members = loop === undefined ? undefined : names.loops.get(loop);
    if (members !== undefined && members.some((i) => !onSide(names.edges.get(String(i))?.change, side))) continue;
    const kids = filterItems(item.items, side, names);
    out.push(retouch({ ...item, items: kids }, side, names, change));
  }
  return out;
}

function retouch(
  item: Extract<Item, { type: 'group' }>,
  side: DiffSide,
  names: Lookup,
  change: Change | undefined,
): Item {
  const next = { ...item, attrs: restyle(item.attrs, side, names, change) };
  if (side !== 'before' || change !== 'changed') return next;
  const id = next.attrs.find(([k]) => k === 'data-node')?.[1];
  const was = id === undefined ? undefined : names.nodes.get(id)?.was;
  const after = id === undefined ? undefined : names.nodes.get(id)?.label;
  if (was === undefined || was === after) return next;
  return relabel(next, was);
}

function restyle(attrs: Attrs | undefined, side: DiffSide, names: Lookup, change: Change | undefined): Attrs {
  const kept = (attrs ?? []).filter(
    ([k]) => k !== 'data-change' && k !== 'data-role' && (k !== 'id' || keepId(change, side)),
  );
  const paint: Change | undefined = change === 'changed' ? (side === 'before' ? 'removed' : 'added') : change;
  const node = kept.find(([k]) => k === 'data-node')?.[1];
  const edge = kept.find(([k]) => k === 'data-edge')?.[1];
  const role =
    (node === undefined ? undefined : names.nodes.get(node)?.role) ??
    (edge === undefined ? undefined : names.edges.get(edge)?.role);
  return [...kept, ...attr('data-change', paint), ...attr('data-role', role)];
}

function relabel(item: Item, text: string): Item {
  if (item.type === 'text' && (item.cls ?? '').includes('pr-label')) return { ...item, text };
  if (item.type === 'lines' && item.cls.includes('pr-label')) return { ...item, lines: [text] };
  if (item.type === 'group') return { ...item, items: item.items.map((child) => relabel(child, text)) };
  return item;
}
