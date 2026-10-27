import { targetName, type Arrow, type EdgeIndex, type NodeId, type Role, type Target } from '../model.ts';
import type { RenderContext } from './diagram.ts';
import type { EdgePath } from '../layout/pele/route.ts';
import { textWidth, wrap } from '../text/measure.ts';
import { arrowhead, badge, esc, n, roleAttr, textBlock } from '../render/svg.ts';

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
  draw(box: Box, attrs: string): string;
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

export function drawText(t: TextLines, x: number, cy: number, align: 'middle' | 'start' = 'middle'): string {
  const labelH = t.lines.length * LINE;
  const top = cy - t.h / 2;
  const start = align === 'start' ? ' pr-start' : '';
  let s = textBlock(t.lines, x, top + labelH / 2, LINE, 'pr-label' + start);
  if (t.note.length)
    s += textBlock(t.note, x, top + labelH + 4 + (t.note.length * NOTE_LINE) / 2, NOTE_LINE, 'pr-note' + start);
  return s;
}

export interface Labelled {
  index: number;
  label?: string;
  role?: Role;
}

export type EdgeLike = Labelled & { from: string; to: string; arrow: Arrow };

export function edgeSvg(e: EdgeLike, p: EdgePath, both: boolean): string {
  let s = `<g class="pr-edge${e.arrow === '-->' ? ' pr-dashed' : ''}" data-edge="${e.index}" data-from="${esc(e.from)}" data-to="${esc(e.to)}"${roleAttr(e.role)}>`;
  s += `<path class="pr-line" d="${p.d}"/>`;
  s += `<path class="pr-head" d="${arrowhead(p.ex, p.ey, p.edx, p.edy)}"/>`;
  if (both) s += `<path class="pr-head" d="${arrowhead(p.sx, p.sy, p.sdx, p.sdy)}"/>`;
  return s + '</g>';
}

export function labelSvg(e: Labelled, x: number, y: number, onGroup: boolean): string {
  const lines = e.label ? wrap(e.label, LABEL_FONT, MAX_EDGE_LABEL) : [];
  const w = Math.max(...lines.map((l) => textWidth(l, LABEL_FONT))) + 8;
  const h = lines.length * LABEL_LINE + 2;
  const plate = `<rect class="pr-elabel-plate" x="${n(x - w / 2)}" y="${n(y - h / 2)}" width="${n(w)}" height="${n(h)}" rx="3"/>`;
  return `<g class="pr-edge-label${onGroup ? ' pr-on-group' : ''}" data-edge="${e.index}"${roleAttr(e.role)}>${plate}${textBlock(lines, x, y, LABEL_LINE, 'pr-elabel')}</g>`;
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

export function markers(
  d: { steps: readonly { target: Target }[] },
  boxes: ReadonlyMap<string, Box>,
  anchors: ReadonlyMap<number, Anchor>,
  refMarkers: ReadonlyMap<string, string>,
): string[] {
  const out: string[] = [];
  const stacked = new Map<string, number>();
  d.steps.forEach((s, i) => {
    const t = s.target;
    const key = t.type === 'edge' ? 'e:' + t.index : 'n:' + targetName(t);
    const spot = t.type === 'edge' ? anchors.get(t.index) : boxes.get(targetName(t));
    if (!spot) return;
    const k = stacked.get(key) ?? 0;
    stacked.set(key, k + 1);
    const x = t.type === 'edge' ? spot.x - 6 : spot.x;
    out.push(badge('pr-step-marker', ` data-step="${i + 1}"`, x - k * 18, spot.y, String(i + 1)));
  });
  for (const [id, letter] of refMarkers) {
    const edge = /^#(\d+)$/.exec(id);
    const a = edge ? anchors.get(Number(edge[1])) : undefined;
    if (edge) {
      if (a)
        out.push(
          badge('pr-ref-marker', ` data-edge="${edge[1]}"`, a.w === undefined ? a.x + 14 : a.x + a.w + 6, a.y, letter),
        );
      continue;
    }
    const b = boxes.get(id);
    if (!b) continue;
    out.push(badge('pr-ref-marker', ` data-node="${esc(id)}"`, b.x + b.w, b.y, letter));
  }
  return out;
}
