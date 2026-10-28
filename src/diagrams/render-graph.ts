import type { Direction, Edge, EdgeIndex, EdgeTarget, Group, Node, NodeId, NodeTarget, Part, Step } from '../model.ts';
import type { RenderContext, Rendered } from './diagram.ts';
import { trusted } from '../brand.ts';
import { edgeEnds, lean, nodeParts, type GraphParts } from '../parse/graph.ts';
import {
  edgeItem,
  groupClass,
  groupDepths,
  depthWhere,
  labelItem,
  markerItems,
  refMarkers,
  type Box,
  type NodeShape,
  nodeTargets,
  edgeTargets,
  type Anchor,
} from './draw.ts';
import { cnode, compoundLayout, type CEdge, type CNode } from '../layout/pele/compound.ts';
import { loopPath, routePath } from '../layout/pele/route.ts';
import { textWidth, wrap } from '../text/measure.ts';
import { HEAD } from '../render/svg.ts';
import { attr, type Attrs, type Item } from '../scene/scene.ts';
import { paintSvg } from '../scene/svg.ts';

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

interface GraphMethods<D> {
  render(d: D, context: RenderContext): Rendered;
  targets(d: D): Part[];
  ends(d: D, edge: EdgeIndex): [string, string] | undefined;
  turnable(d: D): boolean;
  withoutMuted(d: D, pinned: (id: NodeId) => boolean): D | undefined;
}

export function graphMethods<N extends Node, D extends GraphParts<N> & { direction?: Direction }>(
  style: GraphStyle<N>,
): GraphMethods<D> {
  return {
    render: (d, context) => renderGraph(d, context, style),
    targets: (d) => nodeParts(d.nodes),
    ends: (d, edge) => edgeEnds(d.edges, edge),
    turnable: (d) => d.direction === undefined,
    withoutMuted(d, pinned) {
      const kept = lean(d, pinned);
      return kept && { ...d, ...kept };
    },
  };
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
  const dir = (context.direction ?? d.direction ?? style.direction) === 'right' ? 'LR' : 'TB';
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

  const depths = groupDepths(d.groups);
  const out: Item[] = d.groups.map((g, i) => {
    const c = cnodes[i];
    const x = ox + c.x - c.w / 2;
    const y = oy + c.y - c.h / 2;
    return {
      type: 'group',
      cls: groupClass(depths[i]),
      items: [
        { type: 'rect', x, y, w: c.w, h: c.h, r: 12 },
        { type: 'text', x: x + 14, y: y + 19, text: g.label },
      ],
    };
  });

  const onGroup = (x: number, y: number): number =>
    depthWhere(depths, (i) => {
      const c = cnodes[i];
      return Math.abs(ox + c.x - x) < c.w / 2 && Math.abs(oy + c.y - y) < c.h / 2;
    });

  const labels: Item[] = [];
  const anchors = new Map<number, Anchor>();
  for (const { e, ce } of routed) {
    const route = ce.route.map((v, i) => (i % 3 === 2 ? v : v + (i % 3 === 0 ? ox : oy)));
    const both = e.arrow === '<->';
    out.push(edgeItem(e, routePath(route, undefined, both ? TRIM : 0, TRIM), both));
    const lx = ce.labelX + ox;
    const ly = ce.labelY + oy;
    if (e.label) {
      labels.push(labelItem(e, lx, ly, onGroup(lx, ly)));
      anchors.set(e.index, { x: lx - labelSize(e)[0] / 2 - 4, y: ly, w: labelSize(e)[0] + 8 });
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
      out.push(edgeItem(e, path, false));
      if (e.label) labels.push(labelItem(e, slot.labelX, slot.labelY, onGroup(slot.labelX, slot.labelY)));
      anchors.set(e.index, {
        x: (across ? b.x + b.w + LOOP_REACH : b.x + b.w / 2) + 2,
        y: across ? b.y - 6 : b.y + b.h + LOOP_REACH,
      });
    });
  }

  for (const { node, shape, box } of placed) {
    const kind = style.kind?.(node);
    const attrs: Attrs = [
      ['data-node', node.id],
      ['id', `${domId}-node-${node.id}`],
      ...attr('data-role', node.role),
      ...attr('data-kind', kind),
    ];
    out.push(shape.draw(box, attrs));
  }
  out.push(...labels);
  const boxes = new Map(placed.map((p) => [p.node.id, p.box]));
  out.push(...markerItems(d, boxes, anchors, refMarkers(context, [...nodeTargets(d.nodes), ...edgeTargets(d.edges)])));
  const scene = { id: domId, cls: style.svgClass ?? '', width, height, hatch: true, items: out };
  return { svg: trusted(paintSvg(scene)), width, height, scene };
}
