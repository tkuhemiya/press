// Lays out and draws a state-machine diagram. Layout is pele's compound layered layout.
import type { Diagram, DiagramEdge, DiagramNode } from '../model.ts';
import { cnode, compoundLayout, type CEdge, type CNode } from '../layout/pele/compound.ts';
import { loopPath, routePath, type EdgePath } from '../layout/pele/route.ts';
import { textWidth, wrap } from '../text/measure.ts';
import { arrowhead, badge, esc, HEAD, n, roleAttr, textBlock, type Rendered } from '../render/svg.ts';

const FONT = 14;
const LINE = 18;
const NOTE_FONT = 11.5;
const NOTE_LINE = 15;
const LABEL_FONT = 12.5;
const LABEL_LINE = 16;
const PAD_X = 16;
const PAD_Y = 10;
const MIN_W = 68;
const MAX_LABEL = 190;
const MAX_EDGE_LABEL = 150;
const PSEUDO = 16;
const GROUP_PAD = 16;
const GROUP_TITLE = 30;
const LOOP_REACH = 24;
const MARGIN = 16;
const TRIM = HEAD - 1;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface NodeView {
  node: DiagramNode;
  lines: string[];
  note: string[];
  w: number;
  h: number;
  pseudo: boolean;
}

export function renderStateMachine(d: Diagram, refMarkers: Map<string, string>, domId: string): Rendered {
  const dir = d.direction === 'right' ? 'LR' : 'TB';
  const across = dir === 'TB';

  const views: NodeView[] = d.nodes.map((node) => {
    const pseudo = node.id === 'start' || node.id === 'end';
    if (pseudo) return { node, lines: [], note: [], w: PSEUDO, h: PSEUDO, pseudo };
    const lines = wrap(node.label, FONT, MAX_LABEL, 'sans500');
    const note = node.attrs.note ? wrap(node.attrs.note, NOTE_FONT, MAX_LABEL) : [];
    const textW = Math.max(...lines.map((l) => textWidth(l, FONT, 'sans500')), ...note.map((l) => textWidth(l, NOTE_FONT)));
    const w = Math.max(MIN_W, Math.ceil(textW + 2 * PAD_X));
    const h = lines.length * LINE + (note.length ? 4 + note.length * NOTE_LINE : 0) + 2 * PAD_Y;
    return { node, lines, note, w, h, pseudo };
  });

  // Groups come first in the layout's node list, then states.
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

  // Self-transitions hang off the side across the flow; the node's box grows to make room.
  const loops = new Map<string, DiagramEdge[]>();
  for (const e of d.edges) if (e.from === e.to) loops.set(e.from, [...(loops.get(e.from) ?? []), e]);
  const edgeLabel = (e: DiagramEdge): string[] => (e.label ? wrap(e.label, LABEL_FONT, MAX_EDGE_LABEL) : []);
  const labelSize = (e: DiagramEdge): [number, number] => {
    const lines = edgeLabel(e);
    if (!lines.length) return [0, 0];
    return [Math.max(...lines.map((l) => textWidth(l, LABEL_FONT))) + 10, lines.length * LABEL_LINE + 4];
  };
  const loopRoom = new Map<string, number>();
  views.forEach((v, i) => {
    const c = cnode(v.w, v.h, v.node.group >= 0 ? v.node.group : -1);
    const own = loops.get(v.node.id);
    if (own) {
      const reach = LOOP_REACH + (own.length - 1) * 8;
      const widest = Math.max(...own.map((e) => labelSize(e)[0]));
      const tallest = own.reduce((s, e) => s + labelSize(e)[1], 0);
      const room = across ? reach + 4 + widest : reach + 4 + tallest;
      loopRoom.set(v.node.id, room);
      if (across) c.w += 2 * room;
      else c.h += 2 * room;
    }
    c.span = v.pseudo ? 0 : (across ? v.w : v.h) - 20;
    index.set(v.node.id, base + i);
    cnodes.push(c);
  });

  // Reading order: `start` first, then states in order of first use; groups take their first member's place.
  const order = (i: number): number => {
    if (i >= base) return d.nodes[i - base].id === 'start' ? -1 : i - base;
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
  views.forEach((v, i) => {
    const c = cnodes[base + i];
    boxes.set(v.node.id, { x: ox + c.x - v.w / 2, y: oy + c.y - v.h / 2, w: v.w, h: v.h });
  });

  const out: string[] = [];
  out.push(`<svg class="pr-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">`);
  out.push(`<defs><pattern id="${domId}-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" class="pr-hatch"/></pattern></defs>`);

  // Groups.
  d.groups.forEach((g, i) => {
    const c = cnodes[i];
    const x = ox + c.x - c.w / 2;
    const y = oy + c.y - c.h / 2;
    out.push(`<g class="pr-group"><rect x="${n(x)}" y="${n(y)}" width="${n(c.w)}" height="${n(c.h)}" rx="12"/><text x="${n(x + 14)}" y="${n(y + 19)}">${esc(g.label)}</text></g>`);
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
      labels.push(labelSvg(e, lx, ly));
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
      if (e.label) labels.push(labelSvg(e, slot.labelX, slot.labelY));
      anchors.set(e.index, { x: (across ? b.x + b.w + LOOP_REACH : b.x + b.w / 2) + 2, y: across ? b.y - 6 : b.y + b.h + LOOP_REACH });
    });
  }

  // States.
  for (const v of views) {
    const b = boxes.get(v.node.id)!;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const attrs = ` data-node="${esc(v.node.id)}" id="${domId}-node-${esc(v.node.id)}"${roleAttr(v.node.role)}`;
    if (v.pseudo) {
      out.push(
        v.node.id === 'start'
          ? `<g class="pr-node pr-pseudo"${attrs}><circle class="pr-dot" cx="${n(cx)}" cy="${n(cy)}" r="7"/></g>`
          : `<g class="pr-node pr-pseudo"${attrs}><circle class="pr-ring" cx="${n(cx)}" cy="${n(cy)}" r="7.5"/><circle class="pr-dot" cx="${n(cx)}" cy="${n(cy)}" r="3.8"/></g>`
      );
      continue;
    }
    const labelH = v.lines.length * LINE;
    const noteH = v.note.length ? 4 + v.note.length * NOTE_LINE : 0;
    const top = cy - (labelH + noteH) / 2;
    let body = `<rect class="pr-box" x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="9"/>`;
    if (v.node.role === 'error') body += `<rect class="pr-hatch-fill" x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="9" fill="url(#${domId}-hatch)"/>`;
    body += textBlock(v.lines, cx, top + labelH / 2, LINE, 'pr-label');
    if (v.note.length) body += textBlock(v.note, cx, top + labelH + 4 + (v.note.length * NOTE_LINE) / 2, NOTE_LINE, 'pr-note');
    out.push(`<g class="pr-node"${attrs}>${body}</g>`);
  }
  out.push(...labels);
  out.push(...markers(d, boxes, anchors, refMarkers));
  out.push('</svg>');
  return { svg: out.join(''), width, height };
}

function edgeSvg(e: DiagramEdge, p: EdgePath, both: boolean): string {
  let s = `<g class="pr-edge${e.arrow === '-->' ? ' pr-dashed' : ''}" data-edge="${e.index}" data-from="${esc(e.from)}" data-to="${esc(e.to)}"${roleAttr(e.role)}>`;
  s += `<path class="pr-line" d="${p.d}"/>`;
  s += `<path class="pr-head" d="${arrowhead(p.ex, p.ey, p.edx, p.edy)}"/>`;
  if (both) s += `<path class="pr-head" d="${arrowhead(p.sx, p.sy, p.sdx, p.sdy)}"/>`;
  return s + '</g>';
}

function labelSvg(e: DiagramEdge, x: number, y: number): string {
  const lines = e.label ? wrap(e.label, LABEL_FONT, MAX_EDGE_LABEL) : [];
  return `<g class="pr-edge-label" data-edge="${e.index}"${roleAttr(e.role)}>${textBlock(lines, x, y, LABEL_LINE, 'pr-elabel')}</g>`;
}

// Print markers: numbered badges for steps, lettered badges for prose references.
function markers(d: Diagram, boxes: Map<string, Box>, anchors: Map<number, { x: number; y: number }>, refMarkers: Map<string, string>): string[] {
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
