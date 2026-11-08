import type { Change, Diagram, DiagramType, Paint, Role } from '../model.ts';
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

export const splits = (d: Diagram): boolean => SPLIT.has(d.type) && hasChanges(d);

export const PANES: readonly { side: DiffSide; change: Paint; title: string }[] = [
  { side: 'before', change: 'removed', title: '− Before' },
  { side: 'after', change: 'added', title: '+ After' },
];

const PANE_GAP = 48;
const PANE_HEAD = 30;

export function sideBySide(union: Rendered, d: Diagram, id: string): Rendered {
  const panes = PANES.map((p) => ({ ...p, pane: paneOf(union, p.side, d, `${id}-${p.side}`) }));
  const w = union.width;
  const items: Item[] = panes.flatMap(({ change, title, pane }, i): Item[] => [
    {
      type: 'group',
      attrs: [['data-change', change]],
      items: [
        {
          type: 'lines',
          cls: 'pr-key pr-start',
          x: i * (w + PANE_GAP) + 16,
          cy: PANE_HEAD / 2,
          lines: [title],
          lineHeight: 16,
        },
      ],
    },
    { type: 'group', attrs: [['transform', `translate(${i * (w + PANE_GAP)},${PANE_HEAD})`]], items: pane.scene.items },
  ]);
  const divider: Item = {
    type: 'line',
    cls: 'pr-pane-rule',
    x1: w + PANE_GAP / 2,
    y1: 4,
    x2: w + PANE_GAP / 2,
    y2: union.height + PANE_HEAD,
  };
  const scene: Scene = {
    ...union.scene,
    id,
    width: 2 * w + PANE_GAP,
    height: union.height + PANE_HEAD,
    items: [...items, divider],
  };
  return { ...union, scene, width: scene.width, height: scene.height, svg: trusted(paintSvg(scene)) };
}

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

function ownerChange(attrs: Attrs | undefined, names: Lookup): Change | undefined {
  const get = (key: string): string | undefined => attrs?.find(([k]) => k === key)?.[1];
  const edge = get('data-edge') ?? get('data-for-edge');
  if (edge !== undefined) return names.edges.get(edge)?.change;
  const node = get('data-node') ?? get('data-for-node');
  return node === undefined ? undefined : names.nodes.get(node)?.change;
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
    if (!onSide(change ?? ownerChange(item.attrs, names), side)) continue;
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
  change: Paint | undefined,
): Item {
  const id = item.attrs?.find(([k]) => k === 'data-node')?.[1];
  const meta = id === undefined ? undefined : names.nodes.get(id);
  const edited = meta?.change === 'changed';
  const paint: Paint | undefined = edited ? (side === 'before' ? 'removed' : 'added') : change;
  const next = { ...item, attrs: restyle(item.attrs, side, names, paint, keepId(change, side)) };
  if (side !== 'before' || !edited || meta?.was === undefined || meta.was === meta.label) return next;
  return relabel(next, meta.was);
}

function restyle(
  attrs: Attrs | undefined,
  side: DiffSide,
  names: Lookup,
  paint: Paint | undefined,
  ownsId: boolean,
): Attrs {
  const kept = (attrs ?? []).filter(([k]) => k !== 'data-change' && k !== 'data-role' && (k !== 'id' || ownsId));
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
