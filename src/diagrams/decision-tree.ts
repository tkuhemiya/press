import type { DecisionTree, Edge, Node, NodeId } from '../model.ts';
import type { DiagramDef } from './diagram.ts';
import type { Fence } from '../parse/grammar.ts';
import type { Reporter } from '../diagnostics.ts';
import { buildGraph, header, lean, resolveSteps, toNode } from '../parse/graph.ts';
import { renderGraph } from './render-graph.ts';
import { drawText, measureLabel, type NodeShape } from './draw.ts';
import { n } from '../render/svg.ts';

export const DECISION_TREE: DiagramDef<'decision-tree'> = {
  type: 'decision-tree',
  name: 'Decision tree',
  build,
  render(d, context) {
    const outcomes = new Set(d.nodes.filter((node) => !d.edges.some((e) => e.from === node.id)).map((node) => node.id));
    return renderGraph(d, context, {
      direction: 'down',
      shape: (node, domId) => (outcomes.has(node.id) ? outcomeShape(node, domId) : questionShape(node, domId)),
      first: (node) => node.id === d.root,
      svgClass: 'pr-decision-tree',
    });
  },
  withoutMuted(d, pinned) {
    const kept = lean(d, pinned);
    return kept && { ...d, ...kept };
  },
};

type Answer = Edge<'->' | '-->'>;
const isAnswer = (e: Edge): e is Answer => e.arrow !== '<->';

function build(fence: Fence, report: Reporter): DecisionTree {
  const { error } = report;
  const graph = buildGraph(fence, report, {
    label: (id) => id.replace(/_/g, ' '),
    empty: 'Add at least one edge, e.g. `a -> b : label`.',
    chain(s) {
      if (!s.arrows.includes('<->')) return true;
      error(
        s.line,
        '`<->` is not allowed in a decision tree: an answer leads one way.',
        `Write the answer as \`${s.ends[0].node} -> ${s.ends[1].node} : yes\`.`,
      );
      return false;
    },
  });
  const nodes = graph.nodes.map(toNode);
  const edges = graph.edges.filter(isAnswer);
  const root = nodes.find((node) => !edges.some((e) => e.to === node.id));
  checkTree(nodes, edges, report);
  const steps = resolveSteps(fence.steps, nodes, edges, report);
  const tree: DecisionTree = { ...header(fence, 'decision-tree'), nodes, edges, groups: graph.groups, steps };
  if (root) tree.root = root.id;
  return tree;
}

function checkTree(nodes: readonly Node[], edges: readonly Answer[], { error }: Reporter): void {
  if (!nodes.length) return;
  const out = new Map(nodes.map((node) => [node.id, edges.filter((e) => e.from === node.id)]));
  for (const [id, answers] of out) {
    if (answers.length < 2) continue;
    for (const e of answers)
      if (e.label === undefined)
        error(
          e.line,
          `\`${id}\` has ${answers.length} answers, and \`${e.from} -> ${e.to}\` does not say which this is.`,
          `Label it with the answer: \`${e.from} -> ${e.to} : yes\`.`,
        );
  }
  const state = new Map<NodeId, 'open' | 'done'>();
  const visit = (id: NodeId, path: NodeId[]): boolean => {
    state.set(id, 'open');
    for (const e of out.get(id) ?? []) {
      if (state.get(e.to) === 'open') {
        const loop = [...path.slice(path.indexOf(e.to)), id, e.to].filter((x, i, a) => i === 0 || x !== a[i - 1]);
        error(
          e.line,
          `\`${e.from} -> ${e.to}\` loops back: ${loop.join(' -> ')}. A decision tree only moves forward.`,
          'If the process can return to an earlier point, draw it as a `state-machine`. Otherwise point this answer at a new outcome.',
        );
        return true;
      }
      if (!state.has(e.to) && visit(e.to, [...path, id])) return true;
    }
    state.set(id, 'done');
    return false;
  };
  for (const node of nodes) if (!state.has(node.id) && visit(node.id, [])) return;
  const [first, second, ...rest] = nodes.filter((node) => !edges.some((e) => e.to === node.id));
  if (first && second)
    error(
      second.line,
      `A decision tree has one root, and this one has ${rest.length + 2}: ${[first, second, ...rest].map((r) => `\`${r.id}\``).join(', ')}.`,
      `Lead every question from the first one, e.g. \`${first.id} -> ${second.id} : …\`, or split them into separate trees.`,
    );
}

const PAD_X = 16;
const PAD_Y = 11;
const MIN_W = 80;
const MAX_LABEL = 170;

function questionShape(node: Node, domId: string): NodeShape {
  const text = measureLabel(node.label, node.note, MAX_LABEL);
  return {
    w: Math.max(MIN_W, Math.ceil(text.w + 2 * PAD_X)),
    h: text.h + 2 * PAD_Y,
    draw(b, attrs) {
      let body = `<rect class="pr-box pr-question" x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="6"/>`;
      if (node.role === 'error')
        body += `<rect class="pr-hatch-fill" x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="6" fill="url(#${domId}-hatch)"/>`;
      body += drawText(text, b.x + b.w / 2, b.y + b.h / 2);
      return `<g class="pr-node"${attrs}>${body}</g>`;
    },
  };
}

function outcomeShape(node: Node, domId: string): NodeShape {
  const text = measureLabel(node.label, node.note, MAX_LABEL);
  return {
    w: Math.max(MIN_W, Math.ceil(text.w + 2 * PAD_X + 8)),
    h: text.h + 2 * PAD_Y,
    draw(b, attrs) {
      const r = Math.min(b.h / 2, 18);
      let body = `<rect class="pr-box pr-outcome" x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="${n(r)}"/>`;
      if (node.role === 'error')
        body += `<rect class="pr-hatch-fill" x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="${n(r)}" fill="url(#${domId}-hatch)"/>`;
      body += drawText(text, b.x + b.w / 2, b.y + b.h / 2);
      return `<g class="pr-node pr-outcome-node"${attrs}>${body}</g>`;
    },
  };
}
