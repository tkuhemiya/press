import type { Change, Diagram } from '../model.ts';

const SIGN: Record<Change, string> = { added: '+', removed: '−', changed: '~' };

export const signedText = (text: string, change: Change | undefined): string =>
  change ? `${SIGN[change]} ${text}` : text;

export const wasText = (was: string): string => `was "${was}"`;

export const joinNotes = (...parts: (string | undefined)[]): string | undefined => {
  const kept = parts.filter((p): p is string => p !== undefined && p !== '');
  return kept.length ? kept.join(' · ') : undefined;
};

type Labelled = { label: string; change?: Change };
type MaybeLabelled = { label?: string; change?: Change };

const label = <T extends Labelled>(x: T): T => (x.change ? { ...x, label: signedText(x.label, x.change) } : x);

const node = <T extends Labelled & { note?: string; was?: string }>(x: T): T => {
  if (!x.change) return x;
  const note = joinNotes(x.note, x.was === undefined || x.was === x.label ? undefined : wasText(x.was));
  return { ...x, label: signedText(x.label, x.change), ...(note === undefined ? {} : { note }) };
};

const edgeLabel = <T extends MaybeLabelled>(x: T): T =>
  x.change && x.label !== undefined ? { ...x, label: signedText(x.label, x.change) } : x;

export function signed(d: Diagram): Diagram {
  switch (d.type) {
    case 'tradeoffs':
      return {
        ...d,
        options: d.options.map(node),
        criteria: d.criteria.map(node),
        categories: d.categories.map(label),
        cells: d.cells.map((c) =>
          c.change && c.value !== undefined ? { ...c, value: signedText(c.value, c.change) } : c,
        ),
      };
    case 'causal-loop':
      return {
        ...d,
        nodes: d.nodes.map(node),
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
      return signedGraph(d);
  }
}

function signedGraph<D extends Extract<Diagram, { nodes: Labelled[] }>>(d: D): D {
  return { ...d, nodes: d.nodes.map(node), edges: d.edges.map(edgeLabel), groups: d.groups.map(label) };
}
