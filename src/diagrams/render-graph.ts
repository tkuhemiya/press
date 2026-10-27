import type { Direction, Edge, EdgeTarget, Group, Node, NodeId, NodeTarget, Step } from '../model.ts';
import type { RenderContext, Rendered } from './diagram.ts';
import { trusted } from '../brand.ts';
import { edgeSvg, labelSvg, markers, type Box, type NodeShape } from './graph.ts';
import { cnode, compoundLayout, type CEdge, type CNode } from '../layout/pele/compound.ts';
import { loopPath, routePath } from '../layout/pele/route.ts';
import { textWidth, wrap } from '../text/measure.ts';
import { esc, HEAD, n, roleAttr } from '../render/svg.ts';

const LABEL_FONT = 12.5;
const LABEL_LINE = 16;
const MAX_EDGE_LABEL = 150;
const GROUP_PAD = 16;
const GROUP_TITLE = 30;
const LOOP_REACH = 24;
const MARGIN = 16;
const TRIM = HEAD - 1;

export interface GraphStyle<N extends Node> {
  direction: Direction;
  shape(node: N, domId: string): NodeShape;
  first?(node: N): boolean;
  kind?(node: N): string | undefined;
  svgClass?: string;
}

export interface DrawableGraph<N extends Node> {
  direction?: Direction;
  nodes: readonly N[];
  edges: readonly Edge[];
  groups: readonly Group[];
  steps: readonly Step<NodeTarget | EdgeTarget>[];
}

interface Placed<N extends Node> {
  node: N;
  shape: NodeShape;
  c: CNode;
  loops: Edge[];
  box: Box;
}

export function renderGraph<N extends Node>(
  d: DrawableGraph<N>,
  context: RenderContext,
  style: GraphStyle<N>,
): Rendered {
  const { domId } = context;
  const dir = (d.direction ?? style.direction) === 'right' ? 'LR' : 'TB';
  const across = dir === 'TB';

  const cnodes: CNode[] = d.groups.map((g) => {
    const c = cnode(0, 0);
    c.isGroup = true;
    c.padX = GROUP_PAD;
    c.padTop = GROUP_TITLE;
    c.padBottom = GROUP_PAD;
    c.parent = g.parent ?? -1;
    return c;
  });
  const base = cnodes.length;

  const edgeLabel = (e: Edge): string[] => (e.label ? wrap(e.label, LABEL_FONT, MAX_EDGE_LABEL) : []);
  const labelSize = (e: Edge): [number, number] => {
    const lines = edgeLabel(e);
    if (!lines.length) return [0, 0];
    return [Math.max(...lines.map((l) => textWidth(l, LABEL_FONT))) + 10, lines.length * LABEL_LINE + 4];
  };
  const placed: Placed<N>[] = d.nodes.map((node) => {
    const shape = style.shape(node, domId);
    const c = cnode(shape.w, shape.h, node.group ?? -1);
    const loops = d.edges.filter((e) => e.from === node.id && e.to === node.id);
    if (loops.length) {
      const reach = LOOP_REACH + (loops.length - 1) * 8;
      const widest = Math.max(...loops.map((e) => labelSize(e)[0]));
      const tallest = loops.reduce((sum, e) => sum + labelSize(e)[1], 0);
      const room = across ? reach + 4 + widest : reach + 4 + tallest;
      if (across) c.w += 2 * room;
      else c.h += 2 * room;
    }
    c.span = shape.pseudo ? 0 : (across ? shape.w : shape.h) - 20;
    cnodes.push(c);
    return { node, shape, c, loops, box: { x: 0, y: 0, w: shape.w, h: shape.h } };
  });
  const index = new Map<NodeId, number>(placed.map((p, i) => [p.node.id, base + i]));

  const order = (i: number): number => {
    if (i >= base) return style.first?.(placed[i - base].node) ? -1 : i - base;
    let best = Infinity;
    d.nodes.forEach((node, k) => {
      for (let g = node.group; g !== undefined; g = d.groups[g].parent) if (g === i) best = Math.min(best, k);
    });
    return best;
  };
  const ranked = cnodes.map((_, i) => i).sort((a, b) => order(a) - order(b));
  ranked.forEach((i, seq) => (cnodes[i].seq = seq));

  const routed = d.edges.flatMap((e) => {
    const src = index.get(e.from);
    const dst = index.get(e.to);
    if (src === undefined || dst === undefined || e.from === e.to) return [];
    const [labelW, labelH] = labelSize(e);
    const ce: CEdge = { src, dst, minlen: 1, labelW, labelH, route: [], labelX: 0, labelY: 0 };
    return [{ e, ce }];
  });

  const layout = compoundLayout(
    cnodes,
    routed.map((r) => r.ce),
    dir,
    { nodeSep: 40, edgeSep: 16, rankSep: 46, portSep: 20, headRoom: TRIM },
  );

  const ox = MARGIN;
  const oy = MARGIN;
  const width = Math.ceil(layout.width + 2 * MARGIN);
  const height = Math.ceil(layout.height + 2 * MARGIN);
  for (const p of placed)
    p.box = { x: ox + p.c.x - p.shape.w / 2, y: oy + p.c.y - p.shape.h / 2, w: p.shape.w, h: p.shape.h };

  const out: string[] = [];
  out.push(
    `<svg class="pr-svg${style.svgClass ? ' ' + style.svgClass : ''}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">`,
  );
  out.push(
    `<defs><pattern id="${domId}-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" class="pr-hatch"/></pattern></defs>`,
  );

  d.groups.forEach((g, i) => {
    const c = cnodes[i];
    const x = ox + c.x - c.w / 2;
    const y = oy + c.y - c.h / 2;
    out.push(
      `<g class="pr-group"><rect x="${n(x)}" y="${n(y)}" width="${n(c.w)}" height="${n(c.h)}" rx="12"/><text x="${n(x + 14)}" y="${n(y + 19)}">${esc(g.label)}</text></g>`,
    );
  });

  const onGroup = (x: number, y: number): boolean =>
    d.groups.some((_, i) => {
      const c = cnodes[i];
      return Math.abs(ox + c.x - x) < c.w / 2 && Math.abs(oy + c.y - y) < c.h / 2;
    });

  const labels: string[] = [];
  const anchors = new Map<number, { x: number; y: number }>();
  for (const { e, ce } of routed) {
    const route = ce.route.map((v, i) => (i % 3 === 2 ? v : v + (i % 3 === 0 ? ox : oy)));
    const both = e.arrow === '<->';
    out.push(edgeSvg(e, routePath(route, undefined, both ? TRIM : 0, TRIM), both));
    const lx = ce.labelX + ox;
    const ly = ce.labelY + oy;
    if (e.label) {
      labels.push(labelSvg(e, lx, ly, onGroup(lx, ly)));
      anchors.set(e.index, { x: lx - labelSize(e)[0] / 2 - 4, y: ly });
    } else {
      const mid = Math.floor(route.length / 6) * 3;
      anchors.set(e.index, { x: route[mid] + 12, y: route[mid + 1] });
    }
  }
  for (const { box: b, loops } of placed) {
    loops.forEach((e, k) => {
      const [lw, lh] = labelSize(e);
      const slot = { labelW: lw, labelH: lh, labelX: 0, labelY: 0 };
      const path = loopPath({ x: b.x + b.w / 2, y: b.y + b.h / 2 }, b.w, b.h, k, !across, LOOP_REACH, TRIM, slot);
      if (!across) slot.labelY += loops.slice(0, k).reduce((s, o) => s + labelSize(o)[1], 0);
      out.push(edgeSvg(e, path, false));
      if (e.label) labels.push(labelSvg(e, slot.labelX, slot.labelY, onGroup(slot.labelX, slot.labelY)));
      anchors.set(e.index, {
        x: (across ? b.x + b.w + LOOP_REACH : b.x + b.w / 2) + 2,
        y: across ? b.y - 6 : b.y + b.h + LOOP_REACH,
      });
    });
  }

  for (const { node, shape, box } of placed) {
    const kind = style.kind?.(node);
    const attrs = ` data-node="${esc(node.id)}" id="${domId}-node-${esc(node.id)}"${roleAttr(node.role)}${kind ? ` data-kind="${kind}"` : ''}`;
    out.push(shape.draw(box, attrs));
  }
  out.push(...labels);
  const boxes = new Map(placed.map((p) => [p.node.id, p.box]));
  const refs = new Map(
    placed.flatMap((p) => {
      const letter = context.marker({ type: 'node', id: p.node.id });
      return letter === undefined ? [] : [[p.node.id, letter] as const];
    }),
  );
  out.push(...markers(d, boxes, anchors, refs));
  out.push('</svg>');
  return { svg: trusted(out.join('')), width, height };
}
