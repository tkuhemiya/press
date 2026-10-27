import {
  SEQUENCE_KINDS,
  type Edge,
  type GroupId,
  type Participant,
  type Sequence,
  type SequenceKind,
} from './model.ts';
import type { DiagramDef, RenderContext, Rendered } from './diagram.ts';
import type { Fence } from './grammar.ts';
import type { Reporter } from './diagnostics.ts';
import { GRAMMARS } from './grammars.ts';
import { buildGraph, header, inGroup, lean, resolveSteps, toNode } from './graph.ts';
import { groupId, trusted } from './brand.ts';
import { textWidth, wrap } from '../text/measure.ts';
import { arrowhead, badge, esc, HEAD, n, roleAttr, textBlock } from '../render/svg.ts';
import { GLYPH_W, glyph, kindShape } from '../diagrams/kinds.ts';

export const SEQUENCE: DiagramDef<'sequence'> = {
  type: 'sequence',
  name: 'Sequence',
  grammar: GRAMMARS.sequence,
  build,
  render,
  withoutMuted(d, pinned) {
    const kept = lean(d, pinned);
    return kept && { ...d, ...kept };
  },
};

const isKind = (kind: string | undefined): kind is SequenceKind => SEQUENCE_KINDS.some((k) => k === kind);

function build(fence: Fence, report: Reporter): Sequence {
  const graph = buildGraph(fence, report, {
    label: (id) => id.replace(/_/g, ' '),
    empty: 'Add at least one edge, e.g. `a -> b : label`.',
  });
  const nodes = graph.nodes.map((draft): Participant => {
    const node: Participant = toNode(draft);
    if (isKind(draft.kind)) node.kind = draft.kind;
    return node;
  });
  const steps = resolveSteps(fence.steps, nodes, graph.edges, report);
  return { ...header(fence, 'sequence'), nodes, edges: graph.edges, groups: graph.groups, steps };
}

const FONT = 14;
const LABEL_FONT = 12.5;
const LABEL_LINE = 16;
const MAX_LABEL = 220;
const HEADER_H = 42;
const NOTE_FONT = 11.5;
const NOTE_LINE = 15;
const HEADER_PAD = 16;
const MIN_HEADER = 84;
const GAP = 32;
const ROW = 24;
const SELF_W = 34;
const SELF_H = 22;
const MARGIN = 16;
const GROUP_PAD = 12;
const GROUP_TITLE = 26;

interface Column {
  node: Participant;
  note: string[];
  w: number;
  x: number;
}

function render(d: Sequence, context: RenderContext): Rendered {
  const { domId } = context;
  const order = participantOrder(d);
  const cols: Column[] = order.map((node) => {
    const glyphW = hasGlyph(node) ? GLYPH_W : 0;
    const note = node.note ? wrap(node.note, NOTE_FONT, MAX_LABEL) : [];
    const w = Math.max(textWidth(node.label, FONT, 'sans500') + glyphW, ...note.map((l) => textWidth(l, NOTE_FONT)));
    return { node, note, w: Math.max(MIN_HEADER, Math.ceil(w + 2 * HEADER_PAD)), x: 0 };
  });
  const at = new Map(cols.map((c, i) => [c.node.id, i]));

  const labelLines = (e: Edge): string[] => (e.label ? wrap(e.label, LABEL_FONT, MAX_LABEL) : []);
  const labelW = (e: Edge): number => Math.max(0, ...labelLines(e).map((l) => textWidth(l, LABEL_FONT)));

  const gaps = cols.slice(1).map((c, i) => (cols[i].w + c.w) / 2 + GAP);
  const need = (lo: number, hi: number, width: number): void => {
    let have = 0;
    for (let i = lo; i < hi; i++) have += gaps[i];
    if (have >= width) return;
    const extra = (width - have) / (hi - lo);
    for (let i = lo; i < hi; i++) gaps[i] += extra;
  };
  let rightOverflow = 0;
  const rows = d.edges.flatMap((e) => {
    const a = at.get(e.from);
    const b = at.get(e.to);
    return a === undefined || b === undefined ? [] : [{ e, a: cols[a], b: cols[b], ai: a, bi: b }];
  });
  const spans = rows
    .map(({ e, ai, bi }) => ({ e, a: ai, b: bi }))
    .sort((p, q) => Math.abs(p.a - p.b) - Math.abs(q.a - q.b));
  for (const { e, a, b } of spans) {
    if (a === b) {
      const width = SELF_W + 10 + labelW(e) + 12;
      if (a < gaps.length) need(a, a + 1, width + 8);
      else rightOverflow = Math.max(rightOverflow, width - cols[a].w / 2);
    } else need(Math.min(a, b), Math.max(a, b), labelW(e) + 36);
  }

  const depthBelow = d.groups.map(() => 0);
  d.groups.forEach((group) => {
    let depth = 0;
    for (let p = group.parent; p !== undefined; p = d.groups[p].parent)
      depthBelow[p] = Math.max(depthBelow[p], ++depth);
  });
  const outerPad = d.groups.length ? GROUP_PAD + Math.max(...depthBelow) * 10 : 0;

  let x = cols.length ? MARGIN + outerPad + cols[0].w / 2 : 0;
  cols.forEach((c, i) => {
    if (i > 0) x += gaps[i - 1];
    c.x = x;
  });
  const last = cols[cols.length - 1];
  const width = Math.ceil((last ? last.x + last.w / 2 + Math.max(outerPad, rightOverflow) : 0) + MARGIN);

  const headerTop = MARGIN + (d.groups.length ? GROUP_TITLE + Math.max(...depthBelow) * 18 : 0);
  const noteH = Math.max(0, ...cols.map((c) => c.note.length)) * NOTE_LINE;
  const headH = HEADER_H + (noteH ? noteH - 4 : 0);
  const headerBottom = headerTop + headH;

  let y = headerBottom + 18;
  const placed = rows.map((r) => {
    const lines = labelLines(r.e);
    const self = r.e.from === r.e.to;
    const labelH = lines.length * LABEL_LINE;
    y += self ? Math.max(ROW, labelH / 2 + 6) : ROW + labelH;
    const row = { ...r, y, lines, self };
    y += self ? SELF_H + 10 : 6;
    return row;
  });
  const bottom = y + 18;
  const height = Math.ceil(bottom + MARGIN + (d.groups.length ? GROUP_PAD : 0));

  const out: string[] = [];
  out.push(
    `<svg class="pr-svg pr-sequence" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">`,
  );

  const groupOrder = d.groups.map((_, i) => i).sort((a, b) => depthBelow[b] - depthBelow[a]);
  for (const g of groupOrder) {
    const members = cols.filter((c) => inGroup(d.groups, c.node.group, g));
    if (!members.length) continue;
    const pad = GROUP_PAD + depthBelow[g] * 10;
    const gx = Math.min(...members.map((c) => c.x - c.w / 2)) - pad;
    const gr = Math.max(...members.map((c) => c.x + c.w / 2)) + pad;
    const gy = headerTop - GROUP_TITLE - depthBelow[g] * 18;
    out.push(
      `<g class="pr-group"><rect x="${n(gx)}" y="${n(gy)}" width="${n(gr - gx)}" height="${n(bottom + GROUP_PAD - gy + depthBelow[g] * 4)}" rx="12"/><text x="${n(gx + 12)}" y="${n(gy + 17)}">${esc(d.groups[g].label)}</text></g>`,
    );
  }

  for (const c of cols) {
    const left = c.x - c.w / 2;
    const attrs = ` data-node="${esc(c.node.id)}" id="${domId}-node-${esc(c.node.id)}"${roleAttr(c.node.role)}${c.node.kind ? ` data-kind="${c.node.kind}"` : ''}`;
    let s = `<g class="pr-node pr-participant"${attrs}>`;
    s += `<line class="pr-lifeline" x1="${n(c.x)}" y1="${headerBottom}" x2="${n(c.x)}" y2="${n(bottom)}"/>`;
    s += kindShape(c.node.kind, left, headerTop, c.w, headH);
    const glyphW = hasGlyph(c.node) ? GLYPH_W : 0;
    const tx = c.x + glyphW / 2;
    const labelY = headerTop + HEADER_H / 2 - (c.note.length ? 3 : 0);
    if (glyphW && c.node.kind) s += glyph(c.node.kind, tx - textWidth(c.node.label, FONT, 'sans500') / 2 - 15, labelY);
    s += `<text class="pr-label" x="${n(tx)}" y="${n(labelY)}" dy="0.35em">${esc(c.node.label)}</text>`;
    if (c.note.length)
      s += textBlock(c.note, c.x, labelY + 17 + ((c.note.length - 1) * NOTE_LINE) / 2, NOTE_LINE, 'pr-note');
    out.push(s + '</g>');
  }

  const labels: string[] = [];
  const anchors = new Map<number, { x: number; y: number }>();
  for (const row of placed) {
    const { e, a, b } = row;
    const both = e.arrow === '<->';
    let s = `<g class="pr-edge${e.arrow === '-->' ? ' pr-dashed' : ''}" data-edge="${e.index}" data-from="${esc(e.from)}" data-to="${esc(e.to)}"${roleAttr(e.role)}>`;
    if (row.self) {
      const x0 = a.x;
      const y0 = row.y;
      const y1 = y0 + SELF_H;
      s += `<path class="pr-line" d="M${n(x0)},${n(y0)}H${n(x0 + SELF_W - 8)}Q${n(x0 + SELF_W)},${n(y0)} ${n(x0 + SELF_W)},${n(y0 + 8)}V${n(y1 - 8)}Q${n(x0 + SELF_W)},${n(y1)} ${n(x0 + SELF_W - 8)},${n(y1)}H${n(x0 + HEAD - 1)}"/>`;
      s += `<path class="pr-head" d="${arrowhead(x0 + 1, y1, -1, 0)}"/>`;
      if (row.lines.length)
        labels.push(
          `<g class="pr-edge-label" data-edge="${e.index}"${roleAttr(e.role)}>${leftBlock(row.lines, x0 + SELF_W + 10, (y0 + y1) / 2)}</g>`,
        );
      anchors.set(e.index, { x: x0 - 14, y: (y0 + y1) / 2 });
    } else {
      const dir = Math.sign(b.x - a.x);
      const x0 = a.x + (both ? dir * (HEAD - 1) : 0);
      const x1 = b.x - dir * (HEAD - 1);
      s += `<path class="pr-line" d="M${n(x0)},${n(row.y)}H${n(x1)}"/>`;
      s += `<path class="pr-head" d="${arrowhead(b.x - dir, row.y, dir, 0)}"/>`;
      if (both) s += `<path class="pr-head" d="${arrowhead(a.x + dir, row.y, -dir, 0)}"/>`;
      const cx = (a.x + b.x) / 2;
      if (row.lines.length) {
        const ly = row.y - 7 - ((row.lines.length - 1) * LABEL_LINE) / 2 - LABEL_LINE / 2 + 3;
        labels.push(
          `<g class="pr-edge-label" data-edge="${e.index}"${roleAttr(e.role)}>${textBlock(row.lines, cx, ly, LABEL_LINE, 'pr-elabel')}</g>`,
        );
        const w = Math.max(...row.lines.map((l) => textWidth(l, LABEL_FONT)));
        anchors.set(e.index, { x: cx - w / 2 - 12, y: ly });
      } else anchors.set(e.index, { x: cx, y: row.y - 12 });
    }
    out.push(s + '</g>');
  }
  out.push(...labels);

  const stacked = new Map<string, number>();
  d.steps.forEach((s, i) => {
    const t = s.target;
    const c = t.type === 'node' ? cols[at.get(t.id) ?? -1] : undefined;
    const a = t.type === 'edge' ? anchors.get(t.index) : undefined;
    const spot = c ? { x: c.x - c.w / 2, y: headerTop } : a;
    if (!spot) return;
    const mx = spot.x;
    const my = spot.y;
    const key = t.type === 'node' ? 'n:' + t.id : 'e:' + t.index;
    const k = stacked.get(key) ?? 0;
    stacked.set(key, k + 1);
    out.push(badge('pr-step-marker', ` data-step="${i + 1}"`, mx - k * 18, my, String(i + 1)));
  });
  for (const c of cols) {
    const letter = context.marker({ type: 'node', id: c.node.id });
    if (letter !== undefined)
      out.push(badge('pr-ref-marker', ` data-node="${esc(c.node.id)}"`, c.x + c.w / 2, headerTop, letter));
  }
  out.push('</svg>');
  return { svg: trusted(out.join('')), width, height };
}

function participantOrder(d: Sequence): Participant[] {
  const first = new Map(d.nodes.map((node, i) => [node.id, i]));
  const at = (node: Participant) => first.get(node.id) ?? Infinity;
  const items = (g: GroupId | undefined): { at: number; nodes: Participant[] }[] => {
    const own = d.nodes.filter((node) => node.group === g).map((node) => ({ at: at(node), nodes: [node] }));
    const sub = d.groups
      .map((grp, i) => ({ grp, i: groupId(i) }))
      .filter(({ grp }) => grp.parent === g)
      .map(({ i }) => {
        const nodes = items(i).flatMap((it) => it.nodes);
        return { at: Math.min(Infinity, ...nodes.map(at)), nodes };
      })
      .filter((it) => it.nodes.length);
    return [...own, ...sub].sort((a, b) => a.at - b.at);
  };
  return items(undefined).flatMap((it) => it.nodes);
}

function leftBlock(lines: string[], x: number, cy: number): string {
  const top = cy - ((lines.length - 1) * LABEL_LINE) / 2;
  return `<text class="pr-elabel pr-left" x="${n(x)}" y="${n(top)}">${lines.map((l, i) => `<tspan x="${n(x)}" ${i ? `dy="${LABEL_LINE}"` : 'dy="0.35em"'}>${esc(l)}</tspan>`).join('')}</text>`;
}

function hasGlyph(node: Participant): boolean {
  return node.kind !== undefined && node.kind !== 'database';
}
