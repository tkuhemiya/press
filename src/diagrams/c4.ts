import { C4_KINDS, type C4Diagram, type C4Node } from '../model.ts';
import type { DiagramDef } from './diagram.ts';
import type { Fence } from '../parse/grammar.ts';
import type { Reporter } from '../diagnostics.ts';
import { buildGraph, edgeEnds, header, lean, nodeParts, resolveSteps, toNode } from '../parse/graph.ts';
import { renderGraph } from './render-graph.ts';
import { hatchItems, measureLabel, textItems, type NodeShape } from './draw.ts';
import { GLYPH_W, glyphItems } from './kinds.ts';

export const C4: DiagramDef<'c4'> = {
  type: 'c4',
  name: 'C4',
  build,
  render: (d, context) =>
    renderGraph(d, context, {
      direction: 'down',
      shape: c4Shape,
      kind: (node) => node.kind,
      svgClass: 'pr-c4',
    }),
  targets: (d) => nodeParts(d.nodes),
  ends: (d, edge) => edgeEnds(d.edges, edge),
  turnable: (d) => d.direction === undefined,
  withoutMuted(d, pinned) {
    const kept = lean(d, pinned);
    return kept && { ...d, ...kept };
  },
};

function build(fence: Fence, report: Reporter): C4Diagram {
  const graph = buildGraph(fence, report, {
    label: (id) => id.replace(/_/g, ' '),
    empty: 'Add at least one relationship, e.g. `customer -> shop : Places orders`.',
  });
  const nodes = graph.nodes.map((draft): C4Node => {
    const external = draft.attrs.get('external');
    if (external !== undefined && external !== 'yes')
      report.warn(
        draft.line,
        `\`external=${external}\` is not understood.`,
        'Mark an outside system with `{external=yes}`; leave the attribute out for the system you own.',
      );
    const node: C4Node = { ...toNode(draft), external: external === 'yes' };
    const kind = C4_KINDS.find((k) => k === draft.kind);
    if (kind !== undefined) node.kind = kind;
    const tech = draft.attrs.get('tech');
    if (tech !== undefined) node.tech = tech;
    return node;
  });
  const steps = resolveSteps(fence.steps, nodes, graph.edges, report);
  return { ...header(fence, 'c4'), nodes, edges: graph.edges, groups: graph.groups, steps };
}

const PAD_X = 16;
const PAD_Y = 12;
const MIN_W = 110;
const MAX_LABEL = 170;

function c4Shape(node: C4Node): NodeShape {
  const sub = [node.tech === undefined ? undefined : `[${node.tech}]`, node.note].filter((s) => s !== undefined);
  const text = measureLabel(node.label, sub.length ? sub.join(' · ') : undefined, MAX_LABEL);
  const icon = node.kind === 'person' ? GLYPH_W : 0;
  return {
    w: Math.max(MIN_W, Math.ceil(text.w + icon + 2 * PAD_X)),
    h: Math.ceil(text.h + 2 * PAD_Y),
    draw(b, attrs) {
      const cx = b.x + b.w / 2 + icon / 2;
      return {
        type: 'group',
        cls: 'pr-node pr-c4-node',
        attrs,
        items: [
          { type: 'rect', cls: node.external ? 'pr-box pr-external pr-faint' : 'pr-box', ...b, r: 9 },
          ...hatchItems(node, b, 9),
          ...(icon ? glyphItems('user', cx - text.first / 2 - 15, b.y + PAD_Y + 9) : []),
          ...textItems(text, cx, b.y + b.h / 2),
        ],
      };
    },
  };
}
