import type { Dependency, Edge, NodeId, Use } from '../model.ts';
import type { DiagramDef, RenderContext, Rendered } from './diagram.ts';
import type { Fence } from '../parse/grammar.ts';
import type { Reporter } from '../diagnostics.ts';
import { buildGraph, header, lean, nodeParts, resolveSteps, toNode } from '../parse/graph.ts';
import { trusted } from '../brand.ts';
import { roleMarks, markerItems, refMarkers, type Box, nodeTargets, edgeTargets } from './draw.ts';
import { textWidth, wrap } from '../text/measure.ts';
import { linesItem, n } from '../render/svg.ts';
import { markAttrs, type Item, type Scene } from '../scene/scene.ts';
import { paintSvg } from '../scene/svg.ts';
import { list } from '../diagnostics.ts';

export const DEPENDENCY: DiagramDef<'dependency'> = {
  type: 'dependency',
  name: 'Dependency',
  build,
  render,
  targets: (d) => nodeParts(d.nodes),
  ends: (d, edge) => {
    const e = d.edges[edge];
    return e ? [e.from, e.to] : undefined;
  },
  turnable: () => false,
  withoutMuted(d, pinned) {
    const kept = lean(d, pinned);
    return kept && { ...d, ...kept };
  },
};

function build(fence: Fence, report: Reporter): Dependency {
  const { error, warn } = report;
  if (fence.direction !== undefined)
    warn(fence.line, '`direction` has no meaning on a dependency matrix; it is ignored.', 'Leave it off.');
  const graph = buildGraph(fence, report, {
    label: (id) => id.replace(/_/g, ' '),
    empty: 'Add at least one module, e.g. `checkout -> billing`.',
    chain(s) {
      for (let i = 0; i + 1 < s.ends.length; i++) {
        const from = s.ends[i].node;
        const to = s.ends[i + 1].node;
        if (from === to)
          error(
            s.line,
            `\`${from}\` cannot use itself.`,
            'A dependency is between two modules. Drop this edge, or point it at another module.',
          );
      }
      return true;
    },
  });
  const nodes = graph.nodes.map(toNode);
  const edges: Use[] = graph.edges.filter((e) => e.from !== e.to);
  const cycles = components(
    nodes.map((n) => n.id),
    edges,
  ).filter((c) => c.length > 1);
  for (const cycle of cycles)
    warn(
      edges.find((e) => cycle.includes(e.from) && cycle.includes(e.to))?.line ?? fence.line,
      `These modules form a cycle: ${list(cycle)}.`,
      'Layered code has no cycles. Break one edge, or leave the cycle and the matrix will draw a square around it.',
    );
  return {
    ...header(fence, 'dependency'),
    nodes,
    edges,
    groups: graph.groups,
    steps: resolveSteps(fence.steps, nodes, edges, report),
  };
}

function components(ids: readonly NodeId[], edges: readonly Edge[]): NodeId[][] {
  const at = new Map(ids.map((id, i) => [id, i]));
  const adj = ids.map((): number[] => []);
  for (const e of edges) {
    const a = at.get(e.from);
    const b = at.get(e.to);
    if (a === undefined || b === undefined || a === b) continue;
    adj[a].push(b);
    if (e.arrow === '<->') adj[b].push(a);
  }
  const idx = ids.map(() => -1);
  const low = ids.map(() => 0);
  const on = ids.map(() => false);
  const stack: number[] = [];
  let time = 0;
  const out: NodeId[][] = [];
  const visit = (v: number): void => {
    idx[v] = low[v] = time++;
    stack.push(v);
    on[v] = true;
    for (const w of adj[v]) {
      if (idx[w] < 0) {
        visit(w);
        low[v] = Math.min(low[v], low[w]);
      } else if (on[w]) low[v] = Math.min(low[v], idx[w]);
    }
    if (low[v] !== idx[v]) return;
    const scc: NodeId[] = [];
    for (;;) {
      const w = stack.pop();
      if (w === undefined) break;
      on[w] = false;
      scc.push(ids[w]);
      if (w === v) break;
    }
    out.push(scc);
  };
  ids.forEach((_, v) => {
    if (idx[v] < 0) visit(v);
  });
  return out;
}

interface CellUse {
  edge: Use;
  weak: boolean;
}

function usesOf(d: Dependency): Map<string, CellUse> {
  const cells = new Map<string, CellUse>();
  const put = (from: NodeId, to: NodeId, e: Use): void => {
    if (from === to) return;
    const key = `${from}>${to}`;
    const weak = e.arrow === '-->';
    const prev = cells.get(key);
    if (!prev || (prev.weak && !weak) || (e.role === 'error' && prev.edge.role !== 'error'))
      cells.set(key, { edge: e, weak: prev ? prev.weak && weak : weak });
  };
  for (const e of d.edges) {
    put(e.from, e.to, e);
    if (e.arrow === '<->') put(e.to, e.from, e);
  }
  return cells;
}

const MARGIN = 12;
const FONT = 13;
const LINE = 16;
const PAD = 8;
const MIN_CELL = 28;
const HEAD_MIN = 72;
const MARK = 7;
const BAND = 22;
const CAPTION = 18;

function render(d: Dependency, context: RenderContext): Rendered {
  const { domId } = context;
  const uses = usesOf(d);
  const modules = d.nodes;
  const head = modules.map((m) => wrap(m.label, FONT, 88, 'sans500'));
  const rowHead = modules.map((m) => wrap(m.label, FONT, 120, 'sans500'));
  const lineW = (lines: string[], face: 'sans500' | 'sans400' = 'sans400') =>
    Math.max(0, ...lines.map((l) => textWidth(l, FONT, face)));

  const labelW = Math.ceil(Math.max(HEAD_MIN, ...rowHead.map((l) => lineW(l, 'sans500'))) + 2 * PAD);
  const colW = modules.map((_, i) => Math.ceil(Math.max(MIN_CELL, lineW(head[i], 'sans500') + 2 * PAD)));
  const headH = Math.max(MIN_CELL, Math.max(0, ...head.map((l) => l.length)) * LINE + 2 * PAD);
  const rowH = modules.map((_, i) => Math.max(MIN_CELL, rowHead[i].length * LINE + 2 * PAD));

  const grouped = modules.map((m) => m.group);
  const bandRows: { group: number; y: number; i: number; j: number }[] = [];
  let y = MARGIN + headH;
  const rowY: number[] = [];
  modules.forEach((m, i) => {
    if (m.group !== undefined && (i === 0 || grouped[i - 1] !== m.group)) {
      const j = modules.findLastIndex((n) => n.group === m.group);
      bandRows.push({ group: m.group, y, i, j });
      y += BAND;
    }
    rowY.push(y);
    y += rowH[i];
  });
  const tableBottom = y;
  const colX: number[] = [];
  let x = MARGIN + labelW;
  for (const w of colW) {
    colX.push(x);
    x += w;
  }
  const width = Math.ceil(x + MARGIN);
  const height = Math.ceil(tableBottom + CAPTION + MARGIN);

  const items: Item[] = [];
  const boxes = new Map<string, Box>();

  for (const b of bandRows) {
    const g = d.groups[b.group];
    const top = b.y;
    const bottom = rowY[b.j] + rowH[b.j];
    const left = colX[b.i];
    const right = colX[b.j] + colW[b.j];
    items.push({
      type: 'group',
      cls: 'pr-group pr-band',
      attrs: markAttrs(g),
      items: [
        { type: 'rect', x: MARGIN, y: top, w: x - MARGIN, h: bottom - top, r: 6 },
        { type: 'rect', x: left, y: MARGIN, w: right - left, h: tableBottom - MARGIN, r: 6 },
        { type: 'text', x: MARGIN + 10, y: top + 15, text: g.label },
      ],
    });
  }

  const cycles = components(
    modules.map((m) => m.id),
    d.edges,
  ).filter((c) => c.length > 1);
  for (const cycle of cycles) {
    const idx = cycle.map((id) => modules.findIndex((m) => m.id === id)).filter((i) => i >= 0);
    const lo = Math.min(...idx);
    const hi = Math.max(...idx);
    const contiguous = idx.every((i) => i >= lo && i <= hi) && hi - lo + 1 === idx.length;
    if (!contiguous) continue;
    items.push({
      type: 'group',
      cls: 'pr-cycle',
      attrs: [['data-role', 'error']],
      items: [
        {
          type: 'rect',
          cls: 'pr-cycle-box',
          x: colX[lo] - 2,
          y: rowY[lo] - 2,
          w: colX[hi] + colW[hi] - colX[lo] + 4,
          h: rowY[hi] + rowH[hi] - rowY[lo] + 4,
          r: 6,
        },
      ],
    });
  }

  const rules = [MARGIN + headH, ...rowY.slice(1)].map((ry) => `M${MARGIN},${n(ry)}H${n(x)}`).join('');
  items.push({ type: 'path', cls: 'pr-rule', d: rules });
  items.push({
    type: 'path',
    cls: 'pr-rule',
    d: colX.map((cx) => `M${n(cx)},${MARGIN}V${n(tableBottom)}`).join(''),
  });

  modules.forEach((m, i) => {
    boxes.set(m.id, { x: MARGIN, y: rowY[i], w: labelW, h: rowH[i] });
    items.push({
      type: 'group',
      cls: 'pr-node pr-row',
      attrs: [['data-node', m.id], ['id', `${domId}-node-${m.id}`], ...markAttrs(m)],
      items: [
        { type: 'rect', cls: 'pr-box pr-line-box', x: MARGIN, y: rowY[i], w: x - MARGIN, h: rowH[i], r: 6 },
        linesItem(rowHead[i], MARGIN + PAD, rowY[i] + rowH[i] / 2, LINE, 'pr-label pr-start pr-row-head'),
      ],
    });
    items.push({
      type: 'group',
      cls: 'pr-node pr-col',
      attrs: [['data-node', m.id], ...markAttrs(m)],
      items: [
        { type: 'rect', cls: 'pr-box pr-line-box', x: colX[i], y: MARGIN, w: colW[i], h: headH, r: 6 },
        linesItem(head[i], colX[i] + colW[i] / 2, MARGIN + headH / 2, LINE, 'pr-label pr-head'),
      ],
    });
  });

  modules.forEach((row, ri) => {
    modules.forEach((col, ci) => {
      const b = { x: colX[ci] + 3, y: rowY[ri] + 3, w: colW[ci] - 6, h: rowH[ri] - 6 };
      const cell = uses.get(`${row.id}>${col.id}`);
      const self = ri === ci;
      const cls = self ? 'pr-cell pr-self' : cell ? 'pr-cell pr-use' : 'pr-cell pr-empty';
      const cellItems: Item[] = [
        { type: 'rect', cls: 'pr-box pr-cell-box', x: b.x, y: b.y, w: b.w, h: b.h, r: 4 },
        ...roleMarks({ role: cell?.edge.role }, b, 4),
      ];
      if (cell) {
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        cellItems.push({
          type: 'rect',
          cls: cell.weak ? 'pr-mark pr-weak' : 'pr-mark',
          x: cx - MARK,
          y: cy - MARK,
          w: MARK * 2,
          h: MARK * 2,
          r: 2.5,
        });
      }
      const attrs = cell ? markAttrs(cell.edge) : [];
      items.push({
        type: 'group',
        cls: `pr-node ${cls}`,
        attrs: [
          ['data-from', row.id],
          ['data-to', col.id],
          ...(cell ? ([['data-edge', String(cell.edge.index)]] as const) : []),
          ...attrs,
        ],
        items: cellItems,
      });
    });
  });

  items.push(linesItem(['Row uses column'], MARGIN + labelW, tableBottom + 12, 14, 'pr-note pr-caption pr-start'));
  items.push(
    ...markerItems(d, boxes, new Map(), refMarkers(context, [...nodeTargets(d.nodes), ...edgeTargets(d.edges)])),
  );
  const scene: Scene = { id: domId, cls: 'pr-dependency', width, height, hatch: true, items };
  return { svg: trusted(paintSvg(scene)), width, height, scene };
}
