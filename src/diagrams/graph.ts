// Lays out and draws a node-and-edge diagram with pele's compound layered layout. Each diagram
// type that is a graph (state-machine, architecture) supplies only how its nodes look.
import type { Diagram, DiagramEdge, DiagramNode } from '../model.ts';
import { cnode, compoundLayout, type CEdge, type CNode } from '../layout/pele/compound.ts';
import { loopPath, routePath, type EdgePath } from '../layout/pele/route.ts';
import { textWidth, wrap } from '../text/measure.ts';
import { arrowhead, badge, esc, HEAD, n, roleAttr, textBlock, type Rendered } from '../render/svg.ts';

const LABEL_FONT = 12.5;
const LABEL_LINE = 16;
const MAX_EDGE_LABEL = 150;
const GROUP_PAD = 16;
const GROUP_TITLE = 30;
const LOOP_REACH = 24;
const MARGIN = 16;
const TRIM = HEAD - 1;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// How one node is drawn: its size, and its SVG given the box the layout placed it in.
export interface NodeShape {
  w: number;
  h: number;
  // Pseudo nodes (a state machine's start and end) are dots: they share no side with edges.
  pseudo?: boolean;
  draw(box: Box, attrs: string): string;
}

export interface GraphStyle {
  // Layout direction when the fence header gives none.
  direction: 'right' | 'down';
  shape(node: DiagramNode, domId: string): NodeShape;
  // Nodes placed first in reading order, whatever their position in the source.
  first?(node: DiagramNode): boolean;
  // An extra class on the svg element, for type-specific styling.
  svgClass?: string;
}

export function renderGraph(d: Diagram, refMarkers: Map<string, string>, domId: string, style: GraphStyle): Rendered {
  const dir = (d.direction ?? style.direction) === 'right' ? 'LR' : 'TB';
  const across = dir === 'TB';
  const shapes = d.nodes.map((node) => style.shape(node, domId));

  // Groups come first in the layout's node list, then nodes.
  const cnodes: CNode[] = d.groups.map(() => {
    const g = cnode(0, 0);
    g.isGroup = true;
    g.padX = GROUP_PAD;
    g.padTop = GROUP_TITLE;
    g.padBottom = GROUP_PAD;
    return g;
  });
  d.groups.forEach((g, i) => (cnodes[i].parent = g.parent));
  const base = cnodes.length;
  const index = new Map<string, number>();

  // Self-edges hang off the side across the flow; the node's box grows to make room.
  const loops = new Map<string, DiagramEdge[]>();
  for (const e of d.edges) if (e.from === e.to) loops.set(e.from, [...(loops.get(e.from) ?? []), e]);
  const edgeLabel = (e: DiagramEdge): string[] => (e.label ? wrap(e.label, LABEL_FONT, MAX_EDGE_LABEL) : []);
  const labelSize = (e: DiagramEdge): [number, number] => {
    const lines = edgeLabel(e);
    if (!lines.length) return [0, 0];
    return [Math.max(...lines.map((l) => textWidth(l, LABEL_FONT))) + 10, lines.length * LABEL_LINE + 4];
  };
  d.nodes.forEach((node, i) => {
    const s = shapes[i];
    const c = cnode(s.w, s.h, node.group >= 0 ? node.group : -1);
    const own = loops.get(node.id);
    if (own) {
      const reach = LOOP_REACH + (own.length - 1) * 8;
      const widest = Math.max(...own.map((e) => labelSize(e)[0]));
      const tallest = own.reduce((sum, e) => sum + labelSize(e)[1], 0);
      const room = across ? reach + 4 + widest : reach + 4 + tallest;
      if (across) c.w += 2 * room;
      else c.h += 2 * room;
    }
    c.span = s.pseudo ? 0 : (across ? s.w : s.h) - 20;
    index.set(node.id, base + i);
    cnodes.push(c);
  });

  // Reading order: nodes in order of first use (with `first` ones ahead); groups take their first member's place.
  const order = (i: number): number => {
    if (i >= base) return style.first?.(d.nodes[i - base]) ? -1 : i - base;
    let best = Infinity;
    d.nodes.forEach((node, k) => {
      for (let g = node.group; g >= 0; g = d.groups[g].parent) if (g === i) best = Math.min(best, k);
    });
    return best;
  };
  const ranked = cnodes.map((_, i) => i).sort((a, b) => order(a) - order(b));
  ranked.forEach((i, seq) => (cnodes[i].seq = seq));

  const routed = d.edges.filter((e) => e.from !== e.to);
  const cedges: CEdge[] = routed.map((e) => {
    const [labelW, labelH] = labelSize(e);
    return { src: index.get(e.from)!, dst: index.get(e.to)!, minlen: 1, labelW, labelH, route: [], labelX: 0, labelY: 0 };
  });

  const layout = compoundLayout(cnodes, cedges, dir, { nodeSep: 40, edgeSep: 16, rankSep: 46, portSep: 20, headRoom: TRIM });

  const ox = MARGIN;
  const oy = MARGIN;
  const width = Math.ceil(layout.width + 2 * MARGIN);
  const height = Math.ceil(layout.height + 2 * MARGIN);

  const boxes = new Map<string, Box>();
  d.nodes.forEach((node, i) => {
    const c = cnodes[base + i];
    const s = shapes[i];
    boxes.set(node.id, { x: ox + c.x - s.w / 2, y: oy + c.y - s.h / 2, w: s.w, h: s.h });
  });

  const out: string[] = [];
  out.push(`<svg class="pr-svg${style.svgClass ? ' ' + style.svgClass : ''}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">`);
  out.push(`<defs><pattern id="${domId}-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" class="pr-hatch"/></pattern></defs>`);

  // Groups.
  d.groups.forEach((g, i) => {
    const c = cnodes[i];
    const x = ox + c.x - c.w / 2;
    const y = oy + c.y - c.h / 2;
    out.push(`<g class="pr-group"><rect x="${n(x)}" y="${n(y)}" width="${n(c.w)}" height="${n(c.h)}" rx="12"/><text x="${n(x + 14)}" y="${n(y + 19)}">${esc(g.label)}</text></g>`);
  });

  // A label inside a group sits on the group's fill, so its plate takes that colour.
  const onGroup = (x: number, y: number): boolean =>
    d.groups.some((_, i) => {
      const c = cnodes[i];
      return Math.abs(ox + c.x - x) < c.w / 2 && Math.abs(oy + c.y - y) < c.h / 2;
    });

  // Edges.
  const labels: string[] = [];
  const anchors = new Map<number, { x: number; y: number }>();
  routed.forEach((e, k) => {
    const ce = cedges[k];
    const route = ce.route.map((v, i) => (i % 3 === 2 ? v : v + (i % 3 === 0 ? ox : oy)));
    const both = e.arrow === '<->';
    const path = routePath(route, undefined, both ? TRIM : 0, TRIM);
    out.push(edgeSvg(e, path, both));
    const lx = ce.labelX + ox;
    const ly = ce.labelY + oy;
    if (e.label) {
      labels.push(labelSvg(e, lx, ly, onGroup(lx, ly)));
      anchors.set(e.index, { x: lx - labelSize(e)[0] / 2 - 4, y: ly });
    } else {
      const mid = Math.floor(route.length / 6) * 3;
      anchors.set(e.index, { x: route[mid] + 12, y: route[mid + 1] });
    }
  });
  for (const [id, own] of loops) {
    const b = boxes.get(id)!;
    own.forEach((e, k) => {
      const [lw, lh] = labelSize(e);
      const slot = { labelW: lw, labelH: lh, labelX: 0, labelY: 0 };
      const path = loopPath({ x: b.x + b.w / 2, y: b.y + b.h / 2 }, b.w, b.h, k, !across, LOOP_REACH, TRIM, slot);
      if (!across) slot.labelY += own.slice(0, k).reduce((s, o) => s + labelSize(o)[1], 0);
      out.push(edgeSvg(e, path, false));
      if (e.label) labels.push(labelSvg(e, slot.labelX, slot.labelY, onGroup(slot.labelX, slot.labelY)));
      anchors.set(e.index, { x: (across ? b.x + b.w + LOOP_REACH : b.x + b.w / 2) + 2, y: across ? b.y - 6 : b.y + b.h + LOOP_REACH });
    });
  }

  // Nodes.
  d.nodes.forEach((node, i) => {
    const attrs = ` data-node="${esc(node.id)}" id="${domId}-node-${esc(node.id)}"${roleAttr(node.role)}${node.kind ? ` data-kind="${node.kind}"` : ''}`;
    out.push(shapes[i].draw(boxes.get(node.id)!, attrs));
  });
  out.push(...labels);
  out.push(...markers(d, boxes, anchors, refMarkers));
  out.push('</svg>');
  return { svg: out.join(''), width, height };
}

// The usual node body: a label, and a note under it in smaller type.
export interface TextLines {
  lines: string[];
  note: string[];
  // Width of the label's first line.
  first: number;
  // Width and height of the text alone.
  w: number;
  h: number;
}

export const FONT = 14;
const LINE = 18;
const NOTE_FONT = 11.5;
const NOTE_LINE = 15;

export function measureText(node: DiagramNode, maxWidth: number): TextLines {
  const lines = wrap(node.label, FONT, maxWidth, 'sans500');
  const note = node.attrs.note ? wrap(node.attrs.note, NOTE_FONT, maxWidth) : [];
  const w = Math.max(...lines.map((l) => textWidth(l, FONT, 'sans500')), ...note.map((l) => textWidth(l, NOTE_FONT)));
  const h = lines.length * LINE + (note.length ? 4 + note.length * NOTE_LINE : 0);
  return { lines, note, first: textWidth(lines[0] ?? '', FONT, 'sans500'), w, h };
}

// Draws measured text centred on (x, cy), or starting at x when aligned to the start.
export function drawText(t: TextLines, x: number, cy: number, align: 'middle' | 'start' = 'middle'): string {
  const labelH = t.lines.length * LINE;
  const top = cy - t.h / 2;
  const start = align === 'start' ? ' pr-start' : '';
  let s = textBlock(t.lines, x, top + labelH / 2, LINE, 'pr-label' + start);
  if (t.note.length) s += textBlock(t.note, x, top + labelH + 4 + (t.note.length * NOTE_LINE) / 2, NOTE_LINE, 'pr-note' + start);
  return s;
}

export function edgeSvg(e: DiagramEdge, p: EdgePath, both: boolean): string {
  let s = `<g class="pr-edge${e.arrow === '-->' ? ' pr-dashed' : ''}" data-edge="${e.index}" data-from="${esc(e.from)}" data-to="${esc(e.to)}"${roleAttr(e.role)}>`;
  s += `<path class="pr-line" d="${p.d}"/>`;
  s += `<path class="pr-head" d="${arrowhead(p.ex, p.ey, p.edx, p.edy)}"/>`;
  if (both) s += `<path class="pr-head" d="${arrowhead(p.sx, p.sy, p.sdx, p.sdy)}"/>`;
  return s + '</g>';
}

// A label sits on its edge, so the line runs into it from both sides. A plate the colour of
// the figure keeps the line clear of the text; a stroke halo alone leaves it showing between words.
export function labelSvg(e: DiagramEdge, x: number, y: number, onGroup: boolean): string {
  const lines = e.label ? wrap(e.label, LABEL_FONT, MAX_EDGE_LABEL) : [];
  const w = Math.max(...lines.map((l) => textWidth(l, LABEL_FONT))) + 8;
  const h = lines.length * LABEL_LINE + 2;
  const plate = `<rect class="pr-elabel-plate" x="${n(x - w / 2)}" y="${n(y - h / 2)}" width="${n(w)}" height="${n(h)}" rx="3"/>`;
  return `<g class="pr-edge-label${onGroup ? ' pr-on-group' : ''}" data-edge="${e.index}"${roleAttr(e.role)}>${plate}${textBlock(lines, x, y, LABEL_LINE, 'pr-elabel')}</g>`;
}

// Print markers: numbered badges for steps, lettered badges for prose references.
export function markers(d: Diagram, boxes: Map<string, Box>, anchors: Map<number, { x: number; y: number }>, refMarkers: Map<string, string>): string[] {
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
