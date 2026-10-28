import { targetName, type Arrow, type Group, type EdgeIndex, type NodeId, type Role, type Target } from '../model.ts';
import type { RenderContext } from './diagram.ts';
import type { EdgePath } from '../layout/pele/route.ts';
import { textWidth, wrap } from '../text/measure.ts';
import { arrowhead, badgeItem, linesItem } from '../render/svg.ts';
import { attr, type Attrs, type Item } from '../scene/scene.ts';

const LABEL_FONT = 12.5;
const LABEL_LINE = 16;
const MAX_EDGE_LABEL = 150;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NodeShape {
  w: number;
  h: number;
  pseudo?: boolean;
  draw(box: Box, attrs: Attrs): Item;
}

export interface TextLines {
  lines: string[];
  note: string[];
  first: number;
  w: number;
  h: number;
}

const FONT = 14;
const LINE = 18;
const NOTE_FONT = 11.5;
const NOTE_LINE = 15;

export function measureLabel(label: string, noteText: string | undefined, maxWidth: number): TextLines {
  const lines = wrap(label, FONT, maxWidth, 'sans500');
  const note = noteText ? wrap(noteText, NOTE_FONT, maxWidth) : [];
  const w = Math.max(...lines.map((l) => textWidth(l, FONT, 'sans500')), ...note.map((l) => textWidth(l, NOTE_FONT)));
  const h = lines.length * LINE + (note.length ? 4 + note.length * NOTE_LINE : 0);
  return { lines, note, first: textWidth(lines[0] ?? '', FONT, 'sans500'), w, h };
}

export const hatchItems = (node: { role?: Role }, b: Box, r: number): Item[] =>
  node.role === 'error' ? [{ type: 'rect', cls: 'pr-hatch-fill', ...b, r, hatch: true }] : [];

export function textItems(t: TextLines, x: number, cy: number, align: 'middle' | 'start' = 'middle'): Item[] {
  const labelH = t.lines.length * LINE;
  const top = cy - t.h / 2;
  const start = align === 'start' ? ' pr-start' : '';
  const label = linesItem(t.lines, x, top + labelH / 2, LINE, 'pr-label' + start);
  if (!t.note.length) return [label];
  return [
    label,
    linesItem(t.note, x, top + labelH + 4 + (t.note.length * NOTE_LINE) / 2, NOTE_LINE, 'pr-note' + start),
  ];
}

export interface Labelled {
  index: number;
  label?: string;
  role?: Role;
}

export type EdgeLike = Labelled & { from: string; to: string; arrow: Arrow };

export function edgeItem(e: EdgeLike, p: EdgePath, both: boolean): Item {
  const heads: Item[] = both ? [{ type: 'path', cls: 'pr-head', d: arrowhead(p.sx, p.sy, p.sdx, p.sdy) }] : [];
  return {
    type: 'group',
    cls: `pr-edge${e.arrow === '-->' ? ' pr-dashed' : ''}`,
    attrs: [['data-edge', String(e.index)], ['data-from', e.from], ['data-to', e.to], ...attr('data-role', e.role)],
    items: [
      { type: 'path', cls: 'pr-line', d: p.d },
      { type: 'path', cls: 'pr-head', d: arrowhead(p.ex, p.ey, p.edx, p.edy) },
      ...heads,
    ],
  };
}

const MAX_GROUP_DEPTH = 3;

export function groupDepths(groups: readonly Group[]): number[] {
  const depth = (i: number): number => {
    const parent = groups[i].parent;
    return parent === undefined ? 1 : depth(parent) + 1;
  };
  return groups.map((_, i) => Math.min(MAX_GROUP_DEPTH, depth(i)));
}

export const groupClass = (depth: number): string => `pr-group pr-depth-${depth}`;

export const depthWhere = (depths: readonly number[], inside: (group: number) => boolean): number =>
  Math.max(0, ...depths.filter((_, i) => inside(i)));

export function labelItem(e: Labelled, x: number, y: number, depth: number): Item {
  const lines = e.label ? wrap(e.label, LABEL_FONT, MAX_EDGE_LABEL) : [];
  const w = Math.max(...lines.map((l) => textWidth(l, LABEL_FONT))) + 8;
  const h = lines.length * LABEL_LINE + 2;
  return {
    type: 'group',
    cls: `pr-edge-label${depth ? ` pr-on-group pr-depth-${depth}` : ''}`,
    attrs: [['data-edge', String(e.index)], ...attr('data-role', e.role)],
    items: [
      { type: 'rect', cls: 'pr-elabel-plate', x: x - w / 2, y: y - h / 2, w, h, r: 3 },
      linesItem(lines, x, y, LABEL_LINE, 'pr-elabel'),
    ],
  };
}

export const nodeTargets = (nodes: readonly { id: NodeId }[]): Target[] =>
  nodes.map((node) => ({ type: 'node', id: node.id }));

export const propTargets = (props: readonly { node: NodeId; key: NodeId }[]): Target[] =>
  props.map((p) => ({ type: 'prop', node: p.node, key: p.key }));

export const edgeTargets = (edges: readonly { index: EdgeIndex }[]): Target[] =>
  edges.map((e) => ({ type: 'edge', index: e.index }));

export function refMarkers(context: RenderContext, targets: readonly Target[]): Map<string, string> {
  return new Map(
    targets.flatMap((t) => {
      const letter = context.marker(t);
      return letter === undefined ? [] : [[targetName(t), letter] as const];
    }),
  );
}

export interface Anchor {
  x: number;
  y: number;
  w?: number;
}

export function markerItems(
  d: { steps: readonly { target: Target }[] },
  boxes: ReadonlyMap<string, Box>,
  anchors: ReadonlyMap<number, Anchor>,
  refMarkers: ReadonlyMap<string, string>,
): Item[] {
  const out: Item[] = [];
  const stacked = new Map<string, number>();
  d.steps.forEach((s, i) => {
    const t = s.target;
    const key = t.type === 'edge' ? 'e:' + t.index : 'n:' + targetName(t);
    const spot = t.type === 'edge' ? anchors.get(t.index) : boxes.get(targetName(t));
    if (!spot) return;
    const k = stacked.get(key) ?? 0;
    stacked.set(key, k + 1);
    const x = t.type === 'edge' ? spot.x - 6 : spot.x;
    out.push(badgeItem('pr-step-marker', [['data-step', String(i + 1)]], x - k * 18, spot.y, String(i + 1)));
  });
  for (const [id, letter] of refMarkers) {
    const edge = /^#(\d+)$/.exec(id);
    const a = edge ? anchors.get(Number(edge[1])) : undefined;
    if (edge) {
      if (a)
        out.push(
          badgeItem(
            'pr-ref-marker',
            [['data-edge', edge[1]]],
            a.w === undefined ? a.x + 14 : a.x + a.w + 6,
            a.y,
            letter,
          ),
        );
      continue;
    }
    const b = boxes.get(id);
    if (!b) continue;
    out.push(badgeItem('pr-ref-marker', [['data-node', id]], b.x + b.w, b.y, letter));
  }
  return out;
}
