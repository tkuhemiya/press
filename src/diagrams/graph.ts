import type { DiagramEdge, DiagramNode, StepTarget } from '../model.ts';
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

export const FONT = 14;
const LINE = 18;
const NOTE_FONT = 11.5;
const NOTE_LINE = 15;

export function measureText(node: DiagramNode, maxWidth: number): TextLines {
  return measureLabel(node.label, node.attrs.note, maxWidth);
}

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

export type EdgeLike = Pick<DiagramEdge, 'index' | 'from' | 'to' | 'arrow' | 'label' | 'role'>;

export function edgeSvg(e: EdgeLike, p: EdgePath, both: boolean): string {
  let s = `<g class="pr-edge${e.arrow === '-->' ? ' pr-dashed' : ''}" data-edge="${e.index}" data-from="${esc(e.from)}" data-to="${esc(e.to)}"${roleAttr(e.role)}>`;
  s += `<path class="pr-line" d="${p.d}"/>`;
  s += `<path class="pr-head" d="${arrowhead(p.ex, p.ey, p.edx, p.edy)}"/>`;
  if (both) s += `<path class="pr-head" d="${arrowhead(p.sx, p.sy, p.sdx, p.sdy)}"/>`;
  return s + '</g>';
}

export function labelSvg(e: EdgeLike, x: number, y: number, onGroup: boolean): string {
  const lines = e.label ? wrap(e.label, LABEL_FONT, MAX_EDGE_LABEL) : [];
  const w = Math.max(...lines.map((l) => textWidth(l, LABEL_FONT))) + 8;
  const h = lines.length * LABEL_LINE + 2;
  const plate = `<rect class="pr-elabel-plate" x="${n(x - w / 2)}" y="${n(y - h / 2)}" width="${n(w)}" height="${n(h)}" rx="3"/>`;
  return `<g class="pr-edge-label${onGroup ? ' pr-on-group' : ''}" data-edge="${e.index}"${roleAttr(e.role)}>${plate}${textBlock(lines, x, y, LABEL_LINE, 'pr-elabel')}</g>`;
}

export function markers(
  d: { steps: readonly { target: StepTarget }[] },
  boxes: Map<string, Box>,
  anchors: Map<number, { x: number; y: number }>,
  refMarkers: Map<string, string>,
): string[] {
  const out: string[] = [];
  const stacked = new Map<string, number>();
  d.steps.forEach((s, i) => {
    let x: number;
    let y: number;
    let key: string;
    if (s.target.type === 'node') {
      const b = boxes.get(s.target.id)!;
      x = b.x;
      y = b.y;
      key = 'n:' + s.target.id;
    } else {
      const a = anchors.get(s.target.index)!;
      x = a.x - 6;
      y = a.y;
      key = 'e:' + s.target.index;
    }
    const k = stacked.get(key) ?? 0;
    stacked.set(key, k + 1);
    out.push(badge('pr-step-marker', ` data-step="${i + 1}"`, x - k * 18, y, String(i + 1)));
  });
  for (const [id, letter] of refMarkers) {
    const b = boxes.get(id);
    if (!b) continue;
    out.push(badge('pr-ref-marker', ` data-node="${esc(id)}"`, b.x + b.w, b.y, letter));
  }
  return out;
}
