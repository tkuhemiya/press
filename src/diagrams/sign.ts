import type { Change, Diagram, Paint } from '../model.ts';
import { linesItem } from '../render/svg.ts';
import type { Item } from '../scene/scene.ts';

const SIGN: Record<Paint, string> = { added: '+', removed: '−' };

export const signedText = (text: string, change: Change | undefined): string =>
  change && change !== 'changed' ? `${SIGN[change]} ${text}` : text;

export const renameOf = (x: { change?: Change; was?: string; label: string }): string | undefined =>
  x.change === 'changed' && x.was !== undefined && x.was !== x.label ? x.was : undefined;

export const struck = (cls: string): string => `${cls} pr-struck`;

export function renamedItems(was: string, now: string, x: number, cy: number, lineHeight: number, cls: string): Item[] {
  const line = (text: string, change: Paint, dy: number, c: string): Item => ({
    type: 'group',
    attrs: [['data-change', change]],
    items: [linesItem([signedText(text, change)], x, cy + dy, lineHeight, c)],
  });
  return [line(was, 'removed', -lineHeight / 2, struck(cls)), line(now, 'added', lineHeight / 2, cls)];
}

export const joinNotes = (...parts: (string | undefined)[]): string | undefined => {
  const kept = parts.filter((p): p is string => p !== undefined && p !== '');
  return kept.length ? kept.join(' · ') : undefined;
};

type Labelled = { label: string; change?: Change };
type MaybeLabelled = { label?: string; change?: Change };

const label = <T extends Labelled>(x: T): T => (x.change ? { ...x, label: signedText(x.label, x.change) } : x);

const edgeLabel = <T extends MaybeLabelled>(x: T): T =>
  x.change && x.label !== undefined ? { ...x, label: signedText(x.label, x.change) } : x;

export function signed(d: Diagram): Diagram {
  switch (d.type) {
    case 'tradeoffs':
      return {
        ...d,
        options: d.options.map(label),
        criteria: d.criteria.map(label),
        categories: d.categories.map(label),
        cells: d.cells.map((c) =>
          c.change && c.value !== undefined ? { ...c, value: signedText(c.value, c.change) } : c,
        ),
      };
    case 'causal-loop':
      return {
        ...d,
        nodes: d.nodes.map(label),
        loops: d.loops.map((l) => (l.change ? { ...l, name: signedText(l.name, l.change) } : l)),
      };
    case 'sequence':
      return { ...signedGraph(d), phases: d.phases.map(label) };
    case 'timeline':
      return { ...signedGraph(d), lanes: d.lanes.map(label) };
    case 'call-stack':
    case 'memory-layout':
      return d;
    case 'er':
    case 'state-machine':
    case 'architecture':
    case 'data-flow':
    case 'c4':
    case 'deployment':
    case 'decision-tree':
    case 'dependency':
    case 'class':
      return signedGraph(d);
  }
}

function signedGraph<D extends Extract<Diagram, { nodes: Labelled[] }>>(d: D): D {
  return { ...d, nodes: d.nodes.map(label), edges: d.edges.map(edgeLabel), groups: d.groups.map(label) };
}
