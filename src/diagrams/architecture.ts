import { ARCHITECTURE_KINDS, type Architecture, type ArchitectureKind, type Component } from '../model.ts';
import type { DiagramDef } from './diagram.ts';
import type { Fence } from '../parse/grammar.ts';
import type { Reporter } from '../diagnostics.ts';
import { GRAMMARS } from '../parse/grammars.ts';
import { buildGraph, header, lean, resolveSteps, toNode } from '../parse/graph.ts';
import { renderGraph } from './render-graph.ts';
import { drawText, measureLabel, type NodeShape } from './graph.ts';
import { GLYPH_W, glyph, kindShape } from './kinds.ts';
import { n } from '../render/svg.ts';

export const ARCHITECTURE: DiagramDef<'architecture'> = {
  type: 'architecture',
  name: 'Architecture',
  grammar: GRAMMARS.architecture,
  build,
  render: (d, context) =>
    renderGraph(d, context, {
      direction: 'right',
      shape: componentShape,
      kind: (node) => node.kind,
      svgClass: 'pr-architecture',
    }),
  withoutMuted(d, pinned) {
    const kept = lean(d, pinned);
    return kept && { ...d, ...kept };
  },
};

const isKind = (kind: string | undefined): kind is ArchitectureKind => ARCHITECTURE_KINDS.some((k) => k === kind);

function build(fence: Fence, report: Reporter): Architecture {
  const graph = buildGraph(fence, report, {
    label: (id) => id.replace(/_/g, ' '),
    empty: 'Add at least one edge, e.g. `a -> b : label`.',
  });
  const nodes = graph.nodes.map((draft): Component => {
    const node: Component = toNode(draft);
    if (isKind(draft.kind)) node.kind = draft.kind;
    return node;
  });
  const steps = resolveSteps(fence.steps, nodes, graph.edges, report);
  return { ...header(fence, 'architecture'), nodes, edges: graph.edges, groups: graph.groups, steps };
}

const PAD_X = 16;
const PAD_Y = 12;
const CAP = 4;
const MIN_W = 96;
const MAX_LABEL = 170;

function componentShape(node: Component, domId: string): NodeShape {
  const { kind } = node;
  const text = measureLabel(node.label, node.note, MAX_LABEL);
  const icon = kind && kind !== 'database' ? GLYPH_W : 0;
  const pad = kind === 'database' ? PAD_Y + CAP : PAD_Y;
  return {
    w: Math.max(MIN_W, Math.ceil(text.w + icon + 2 * PAD_X)),
    h: Math.ceil(text.h + 2 * pad),
    draw(b, attrs) {
      let body = kindShape(kind, b.x, b.y, b.w, b.h);
      if (node.role === 'error' && kind !== 'database')
        body += `<rect class="pr-hatch-fill" x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="9" fill="url(#${domId}-hatch)"/>`;
      const cx = b.x + b.w / 2 + icon / 2;
      const cy = b.y + b.h / 2 + (kind === 'database' ? CAP / 2 : 0);
      if (icon && kind) body += glyph(kind, cx - text.first / 2 - 15, b.y + pad + 9);
      body += drawText(text, cx, cy);
      return `<g class="pr-node pr-component"${attrs}>${body}</g>`;
    },
  };
}
