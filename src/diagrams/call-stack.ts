import type { Call, CallStack, Frame, NodeId } from '../model.ts';
import type { DiagramDef, RenderContext, Rendered } from './diagram.ts';
import type { Fence } from '../parse/grammar.ts';
import type { Reporter } from '../diagnostics.ts';
import { buildGraph, edgeEnds, header, nodeParts, resolveSteps, toNode } from '../parse/graph.ts';
import { trusted } from '../brand.ts';
import { edgeTargets, roleMarks, markerItems, measureLabel, nodeTargets, refMarkers, textItems } from './draw.ts';
import type { Anchor, Box } from './draw.ts';
import { textWidth } from '../text/measure.ts';
import { arrowhead, linesItem, n } from '../render/svg.ts';
import { markAttrs, type Item, type Scene } from '../scene/scene.ts';
import { paintSvg } from '../scene/svg.ts';
import { rejectChanges } from './unchanged.ts';

export const CALL_STACK: DiagramDef<'call-stack'> = {
  type: 'call-stack',
  name: 'Call stack',
  build,
  render,
  targets: (d) => nodeParts(d.nodes),
  ends: (d, edge) => edgeEnds(d.edges, edge),
  turnable: (d) => d.direction === undefined,
};

interface Live {
  depth: number;
  start: number;
  end?: number;
  cut: boolean;
  line: number;
}

function build(fence: Fence, report: Reporter): CallStack {
  const { error, warn } = report;
  rejectChanges(fence, report);
  for (const g of fence.groups)
    error(
      g.line,
      'A call stack has no groups: frames nest by calling each other.',
      'Remove the group and write the calls: `caller -> callee`.',
    );
  const graph = buildGraph(fence, report, {
    label: (id) => id.replace(/_/g, ' '),
    empty: 'Add calls and returns, e.g. `main -> load` then `load --> main : ok`.',
    chain(s) {
      if (!s.arrows.includes('<->')) return true;
      error(
        s.line,
        '`<->` is not allowed in a call stack.',
        `Write the call and the return as two lines: \`${s.ends[0].node} -> ${s.ends[1].node}\` and \`${s.ends[1].node} --> ${s.ends[0].node}\`.`,
      );
      return false;
    },
  });

  const root = graph.edges[0]?.from ?? graph.nodes[0]?.id;
  const live = new Map<NodeId, Live>();
  const stack: NodeId[] = [];
  if (root !== undefined) {
    live.set(root, { depth: 0, start: 0, cut: false, line: fence.line });
    stack.push(root);
  }
  const edges: Call[] = [];
  graph.edges.forEach((e, i) => {
    if (e.arrow === '<->') return;
    const at = i + 1;
    const top = stack.at(-1);
    if (top === undefined) return;
    if (e.from !== top) {
      const verb = e.arrow === '->' ? 'call' : 'return';
      error(
        e.line,
        `\`${e.from}\` cannot ${verb} here: \`${top}\` is on top of the stack.`,
        e.arrow === '->'
          ? `Only the frame on top calls. Did you mean \`${top} -> ${e.to}\`? If \`${top}\` has finished, return it first: \`${top} --> ${stack.at(-2) ?? top}\`.`
          : `Only the frame on top returns. Return \`${top}\` first: \`${top} --> ${stack.at(-2) ?? top}\`.`,
      );
      return;
    }
    if (e.arrow === '->') {
      const earlier = live.get(e.to);
      if (earlier) {
        const label = graph.nodes.find((d) => d.id === e.to)?.label ?? e.to;
        error(
          e.line,
          `\`${e.to}\` was already called${earlier.line === fence.line ? '' : ` on line ${earlier.line}`}; a frame is called once.`,
          `Give the second call its own id: \`${e.to}_2: "${label}"\`, then \`${e.from} -> ${e.to}_2\`.`,
        );
        return;
      }
      live.set(e.to, { depth: stack.length, start: at, cut: false, line: e.line });
      stack.push(e.to);
    } else {
      const below = stack.indexOf(e.to);
      if (below < 0 || below === stack.length - 1) {
        const caller = stack.at(-2);
        error(
          e.line,
          `\`${e.from}\` cannot return to \`${e.to}\`: it is not below \`${e.from}\` on the stack.`,
          caller === undefined
            ? `\`${e.from}\` is the bottom of the stack and has no caller.`
            : `Return to the caller: \`${e.from} --> ${caller}\`.`,
        );
        return;
      }
      for (const id of stack.splice(below + 1)) {
        const frame = live.get(id);
        if (!frame) continue;
        frame.end = at;
        if (id !== e.from) frame.cut = true;
      }
    }
    edges.push({ ...e, arrow: e.arrow, at });
  });

  const span = graph.edges.length + 1;
  const nodes: Frame[] = graph.nodes.flatMap((draft) => {
    const frame = live.get(draft.id);
    if (!frame) {
      if (graph.edges.some((e) => e.from === draft.id || e.to === draft.id)) return [];
      warn(
        draft.line,
        `\`${draft.id}\` is declared but never called, so it is not drawn.`,
        `Call it from the frame on top, e.g. \`${stack.at(-1) ?? 'main'} -> ${draft.id}\`, or remove the declaration.`,
      );
      return [];
    }
    return [
      {
        ...toNode(draft),
        depth: frame.depth,
        start: frame.start,
        end: frame.end ?? span,
        open: frame.end === undefined,
        cut: frame.cut,
      },
    ];
  });
  nodes.sort((a, b) => a.start - b.start);
  return {
    ...header(fence, 'call-stack'),
    nodes,
    edges,
    groups: [],
    steps: resolveSteps(fence.steps, nodes, edges, report),
    span,
  };
}

const MARGIN = 14;
const PAD = 10;
const MAX_LABEL = 200;
const VALUE_FONT = 12.5;
const RIGHT_LANE = 34;
const RIGHT_GAP = 22;
const DOWN_GAP = 26;
const NUDGE = 9;
const AXIS = 26;

export function slotWidths(
  frames: readonly Frame[],
  span: number,
  need: (f: Frame) => number,
  least: number,
): number[] {
  const widths = Array.from({ length: span }, () => least);
  const byLength = [...frames].sort((a, b) => a.end - a.start - (b.end - b.start));
  for (const f of byLength) {
    const from = f.start;
    const to = Math.max(f.end, f.start + 1);
    const have = widths.slice(from, to).reduce((sum, w) => sum + w, 0);
    const short = need(f) - have;
    if (short <= 0) continue;
    const each = Math.ceil(short / (to - from));
    for (let t = from; t < to; t++) widths[t] += each;
  }
  return widths;
}

const valueText = (e: Call): string | undefined => (e.label === undefined ? undefined : `→ ${e.label}`);

function render(d: CallStack, context: RenderContext): Rendered {
  const { domId } = context;
  const right = (context.direction ?? d.direction ?? 'right') === 'right';
  const labels = new Map(d.nodes.map((f) => [f.id, measureLabel(f.label, f.note, MAX_LABEL)]));
  const returns = new Map<NodeId, Call>();
  for (const e of d.edges) if (e.arrow === '-->') returns.set(e.from, e);
  const valueW = (f: Frame): number => {
    const r = returns.get(f.id);
    const text = r && valueText(r);
    return text ? textWidth(text, VALUE_FONT) + 12 : 0;
  };
  const depth = Math.max(0, ...d.nodes.map((f) => f.depth)) + 1;

  const lane = right
    ? Math.max(RIGHT_LANE, ...[...labels.values()].map((t) => t.h + 14))
    : Math.ceil(Math.max(120, ...[...labels.values()].map((t) => t.w + 2 * PAD), ...d.nodes.map(valueW)));
  const gap = right ? RIGHT_GAP : DOWN_GAP;
  const need = (f: Frame): number => {
    const t = labels.get(f.id);
    if (!t) return 0;
    return right ? t.w + valueW(f) + 2 * PAD + 2 * NUDGE : t.h + (valueW(f) ? 18 : 0) + 2 * PAD + 2 * NUDGE;
  };
  const widths = slotWidths(d.nodes, d.span, need, right ? 40 : 30);
  const starts = widths.reduce<number[]>((acc, w) => [...acc, (acc.at(-1) ?? 0) + w], [0]);
  const along = (t: number): number => MARGIN + (starts[t] ?? 0);
  const across = (k: number): number => MARGIN + k * (lane + gap);
  const extent = along(d.span);
  const breadth = across(depth) - gap;
  const width = Math.ceil((right ? extent : breadth) + MARGIN);
  const height = Math.ceil((right ? breadth + AXIS : extent + AXIS) + MARGIN);

  const boxOf = (f: Frame): Box => {
    const a0 = along(f.start);
    const a1 = along(f.end);
    const c0 = across(f.depth);
    return right ? { x: a0, y: c0, w: a1 - a0, h: lane } : { x: c0, y: a0, w: lane, h: a1 - a0 };
  };

  const items: Item[] = [];
  const boxes = new Map<string, Box>();
  for (const f of d.nodes) {
    const b = boxOf(f);
    boxes.set(f.id, b);
    const t = labels.get(f.id);
    if (!t) continue;
    const cls = `pr-box${f.depth === 0 && !f.role ? ' pr-faint' : ''}${f.cut ? ' pr-external' : ''}`;
    const label = right
      ? textItems(t, b.x + PAD, b.y + b.h / 2, 'start')
      : textItems(t, b.x + b.w / 2, b.y + PAD + t.h / 2);
    items.push({
      type: 'group',
      cls: `pr-node pr-frame${f.open ? ' pr-open' : ''}`,
      attrs: [['data-node', f.id], ['id', `${domId}-node-${f.id}`], ...markAttrs(f)],
      items: [{ type: 'rect', cls, x: b.x, y: b.y, w: b.w, h: b.h, r: 5 }, ...roleMarks(f, b, 5), ...label],
    });
  }

  const anchors = new Map<number, Anchor>();
  const byId = new Map(d.nodes.map((f) => [f.id, f]));
  for (const e of d.edges) {
    const callee = byId.get(e.arrow === '->' ? e.to : e.from);
    const other = byId.get(e.arrow === '->' ? e.from : e.to);
    if (!callee || !other) continue;
    const a = along(e.at) + (e.arrow === '->' ? NUDGE : -NUDGE);
    const near = across(other.depth) + lane;
    const far = across(callee.depth);
    const [from, to] = e.arrow === '->' ? [near, far] : [far, near];
    const dir = Math.sign(to - from);
    const [x1, y1, x2, y2] = right ? [a, from, a, to] : [from, a, to, a];
    const [dx, dy] = right ? [0, dir] : [dir, 0];
    items.push({
      type: 'group',
      cls: `pr-edge${e.arrow === '-->' ? ' pr-dashed' : ''}`,
      attrs: [['data-edge', String(e.index)], ['data-from', e.from], ['data-to', e.to], ...markAttrs(e)],
      items: [
        { type: 'path', cls: 'pr-line', d: `M${n(x1)},${n(y1)}L${n(x2)},${n(y2)}` },
        { type: 'path', cls: 'pr-head', d: arrowhead(x2, y2, dx, dy) },
      ],
    });
    const mid = (from + to) / 2;
    anchors.set(e.index, right ? { x: a - 8, y: mid } : { x: mid, y: a - 12 });
    const text = valueText(e);
    if (e.arrow !== '-->' || text === undefined) continue;
    const b = boxes.get(callee.id);
    if (!b) continue;
    const w = textWidth(text, VALUE_FONT);
    const [cx, cy] = right ? [b.x + b.w - NUDGE - 8 - w / 2, b.y + b.h / 2] : [b.x + b.w / 2, b.y + b.h - PAD - 8];
    items.push({
      type: 'group',
      cls: 'pr-edge-label pr-value',
      attrs: [['data-edge', String(e.index)], ...markAttrs(e)],
      items: [linesItem([text], cx, cy, 16, 'pr-elabel')],
    });
  }

  const axisAt = right ? breadth + 12 : extent + 12;
  items.push({
    type: 'group',
    cls: 'pr-axis',
    items: right
      ? [
          { type: 'line', cls: 'pr-axis-line', x1: MARGIN, y1: axisAt, x2: extent, y2: axisAt },
          {
            type: 'text',
            cls: 'pr-axis-label',
            x: extent - textWidth('TIME →', 10.5) - 6,
            y: axisAt + 15,
            text: 'time →',
          },
        ]
      : [
          { type: 'line', cls: 'pr-axis-line', x1: MARGIN, y1: axisAt, x2: breadth, y2: axisAt },
          { type: 'text', cls: 'pr-axis-label', x: MARGIN, y: axisAt + 15, text: 'time ↓' },
        ],
  });

  items.push(
    ...markerItems(d, boxes, anchors, refMarkers(context, [...nodeTargets(d.nodes), ...edgeTargets(d.edges)])),
  );
  const scene: Scene = { id: domId, cls: 'pr-call-stack', width, height, hatch: true, items };
  return { svg: trusted(paintSvg(scene)), width, height, scene };
}
