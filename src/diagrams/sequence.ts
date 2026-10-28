import {
  SEQUENCE_KINDS,
  type Edge,
  type EdgeIndex,
  type EdgesTarget,
  type GroupId,
  type NodeId,
  type Participant,
  type Phase,
  type PhaseIndex,
  type Sequence,
  type SequenceKind,
} from '../model.ts';
import type { DiagramDef, RenderContext, Rendered } from './diagram.ts';
import type { Fence } from '../parse/grammar.ts';
import type { Reporter } from '../diagnostics.ts';
import {
  buildGraph,
  edgeEnds,
  edgeMembers,
  header,
  inGroup,
  lean,
  nodeParts,
  resolveSteps,
  toNode,
} from '../parse/graph.ts';
import { groupId, trusted } from '../brand.ts';
import { textWidth, wrap } from '../text/measure.ts';
import { arrowhead, badgeItem, HEAD, linesItem, n } from '../render/svg.ts';
import { attr, type Attrs, type Item, type Scene } from '../scene/scene.ts';
import { paintSvg } from '../scene/svg.ts';
import { GLYPH_W, ICON_W, glyphItems, iconItems, kindItems } from './kinds.ts';

export const SEQUENCE: DiagramDef<'sequence'> = {
  type: 'sequence',
  name: 'Sequence',
  build,
  render,
  targets: (d) => [
    ...nodeParts(d.nodes),
    ...d.phases.flatMap((p) => (p.id === undefined ? [] : [{ target: { type: 'edges' as const, id: p.id } }])),
  ],
  ends: (d, edge) => edgeEnds(d.edges, edge),
  members(d, id) {
    const phase = d.phases.find((p) => p.id === id);
    return phase && edgeMembers(d.edges, phase.edges);
  },
  withoutMuted(d, pinned) {
    const steps = d.steps.flatMap((s) => (s.target.type === 'edges' ? [] : [{ ...s, target: s.target }]));
    if (d.phases.length || steps.length < d.steps.length) return undefined;
    const kept = lean({ ...d, steps }, pinned);
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
    if (draft.icon !== undefined) node.icon = draft.icon;
    return node;
  });
  const phases = buildPhases(fence, graph.edges, new Set(nodes.map((node) => node.id)), report);
  const named = new Map(phases.flatMap((p) => (p.id === undefined ? [] : [[p.id, p] as const])));
  const steps = fence.steps.flatMap((raw): Sequence['steps'] => {
    const id = raw.to === undefined && raw.from.key === undefined ? raw.from.node : undefined;
    if (id !== undefined && named.has(id)) {
      const target: EdgesTarget = { type: 'edges', id };
      return [{ target, caption: raw.caption, line: raw.line }];
    }
    return resolveSteps([raw], nodes, graph.edges, report);
  });
  return { ...header(fence, 'sequence'), nodes, edges: graph.edges, groups: graph.groups, phases, steps };
}

function buildPhases(
  fence: Fence,
  edges: readonly Edge[],
  participants: ReadonlySet<NodeId>,
  report: Reporter,
): Phase[] {
  const lineOf = new Map<number, PhaseIndex>();
  for (const s of fence.statements) if (s.type === 'chain' && s.phase !== undefined) lineOf.set(s.line, s.phase);
  const within = (p: PhaseIndex | undefined, outer: number): boolean => {
    for (let q = p; q !== undefined; q = fence.phases[q].parent) if (q === outer) return true;
    return false;
  };
  const seen = new Map<NodeId, number>();
  return fence.phases.map((fp, i): Phase => {
    const phase: Phase = { label: fp.label, edges: [], line: fp.line };
    if (fp.parent !== undefined) phase.parent = fp.parent;
    phase.edges = edges.filter((e) => within(lineOf.get(e.line), i)).map((e) => e.index);
    if (!phase.edges.length)
      report.warn(
        fp.line,
        `Phase "${fp.label}" has no messages, so it is not drawn.`,
        'Put the messages it covers inside the braces: `phase "Name" {`, then `a -> b : label`, then `}`.',
      );
    if (fp.id !== undefined) {
      const earlier = seen.get(fp.id);
      if (participants.has(fp.id))
        report.error(
          fp.line,
          `\`${fp.id}\` is already a participant, so it cannot also name a phase.`,
          `Phases and participants share ids. Rename the phase, e.g. \`phase ${fp.id}_phase "${fp.label}" {\`.`,
        );
      else if (earlier !== undefined)
        report.error(
          fp.line,
          `Phase id \`${fp.id}\` is already used on line ${earlier}.`,
          'Give each phase its own id.',
        );
      else {
        seen.set(fp.id, fp.line);
        phase.id = fp.id;
      }
    }
    return phase;
  });
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
const PHASE_TITLE = 16;
const PHASE_GAP = 6;
const PHASE_END = 10;
const PHASE_SIDE = 10;
const PHASE_INSET = 8;
const TAG_H = 19;

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
    const glyphW = slotW(node);
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
  const phaseDepth = d.phases.map((p) => {
    let k = 0;
    for (let q = p.parent; q !== undefined; q = d.phases[q].parent) k++;
    return k;
  });
  const drawn = d.phases.map((p, i) => ({ p, i, depth: phaseDepth[i] })).filter(({ p }) => p.edges.length);
  const deepest = Math.max(0, ...drawn.map((x) => x.depth));
  const phaseSide = drawn.length ? PHASE_SIDE + deepest * PHASE_INSET : 0;
  const outerPad = Math.max(d.groups.length ? GROUP_PAD + Math.max(...depthBelow) * 10 : 0, phaseSide);

  let x = cols.length ? MARGIN + outerPad + cols[0].w / 2 : 0;
  cols.forEach((c, i) => {
    if (i > 0) x += gaps[i - 1];
    c.x = x;
  });
  const last = cols[cols.length - 1];
  const width = Math.ceil((last ? last.x + last.w / 2 + Math.max(outerPad, rightOverflow + phaseSide) : 0) + MARGIN);

  const headerTop = MARGIN + (d.groups.length ? GROUP_TITLE + Math.max(...depthBelow) * 18 : 0);
  const noteH = Math.max(0, ...cols.map((c) => c.note.length)) * NOTE_LINE;
  const headH = HEADER_H + (noteH ? noteH - 4 : 0);
  const headerBottom = headerTop + headH;

  const rowOf = new Map(rows.map((r, i) => [r.e.index, i]));
  const bands = drawn.flatMap(({ p, i, depth }) => {
    const at = p.edges.flatMap((e) => rowOf.get(e) ?? []);
    return at.length ? [{ p, i, depth, first: Math.min(...at), last: Math.max(...at), top: 0, bottom: 0 }] : [];
  });
  let y = headerBottom + 18;
  const placed = rows.map((r, k) => {
    for (const span of bands.filter((x) => x.first === k).sort((a, b) => a.depth - b.depth)) {
      if (k) y += PHASE_GAP;
      span.top = y - (k ? 4 : 10);
      y += PHASE_TITLE;
    }
    const lines = labelLines(r.e);
    const self = r.e.from === r.e.to;
    const labelH = lines.length * LABEL_LINE;
    y += self ? Math.max(ROW, labelH / 2 + 6) : ROW + labelH;
    const row = { ...r, y, lines, self };
    y += self ? SELF_H + 10 : 6;
    for (const span of bands.filter((x) => x.last === k).sort((a, b) => b.depth - a.depth)) {
      y += PHASE_END;
      span.bottom = y;
    }
    return row;
  });
  const bottom = y + 18;
  const height = Math.ceil(bottom + MARGIN + (d.groups.length ? GROUP_PAD : 0));

  const groupOrder = d.groups.map((_, i) => i).sort((a, b) => depthBelow[b] - depthBelow[a]);
  const groupItems = groupOrder.flatMap((g): Item[] => {
    const members = cols.filter((c) => inGroup(d.groups, c.node.group, g));
    if (!members.length) return [];
    const pad = GROUP_PAD + depthBelow[g] * 10;
    const gx = Math.min(...members.map((c) => c.x - c.w / 2)) - pad;
    const gr = Math.max(...members.map((c) => c.x + c.w / 2)) + pad;
    const gy = headerTop - GROUP_TITLE - depthBelow[g] * 18;
    return [
      {
        type: 'group',
        cls: 'pr-group',
        items: [
          { type: 'rect', x: gx, y: gy, w: gr - gx, h: bottom + GROUP_PAD - gy + depthBelow[g] * 4, r: 12 },
          { type: 'text', x: gx + 12, y: gy + 17, text: d.groups[g].label },
        ],
      },
    ];
  });

  const firstCol = cols[0];
  const bandBox = (depth: number) => {
    const out = PHASE_SIDE + (deepest - depth) * PHASE_INSET;
    const x0 = firstCol ? firstCol.x - firstCol.w / 2 - out : 0;
    const x1 = last ? last.x + last.w / 2 + Math.max(0, rightOverflow) + out : 0;
    return { x0, x1 };
  };
  const bandSpot = new Map<NodeId, { x0: number; x1: number; top: number }>();
  const phaseItems = [...bands]
    .sort((a, b) => a.depth - b.depth)
    .map((span): Item => {
      const { x0, x1 } = bandBox(span.depth);
      const id = span.p.id;
      if (id !== undefined) bandSpot.set(id, { x0, x1, top: span.top });
      return {
        type: 'group',
        cls: 'pr-phase',
        attrs: id === undefined ? undefined : nodeAttrs(id, domId),
        items: [
          { type: 'rect', cls: 'pr-phase-box', x: x0, y: span.top, w: x1 - x0, h: span.bottom - span.top, r: 6 },
          { type: 'path', cls: 'pr-phase-tag', d: tag(x0, span.top, span.p.label) },
          {
            type: 'text',
            cls: 'pr-phase-label',
            x: x0 + 10,
            y: span.top + TAG_H / 2,
            dy: '0.35em',
            text: span.p.label,
          },
        ],
      };
    });

  const columnItems = cols.map((c): Item => {
    const left = c.x - c.w / 2;
    const glyphW = slotW(c.node);
    const tx = c.x + glyphW / 2;
    const labelY = headerTop + HEADER_H / 2 - (c.note.length ? 3 : 0);
    return {
      type: 'group',
      cls: 'pr-node pr-participant',
      attrs: [...nodeAttrs(c.node.id, domId), ...attr('data-role', c.node.role), ...attr('data-kind', c.node.kind)],
      items: [
        { type: 'line', cls: 'pr-lifeline', x1: c.x, y1: headerBottom, x2: c.x, y2: bottom },
        ...kindItems(c.node.kind, left, headerTop, c.w, headH),
        ...(c.node.icon
          ? iconItems(c.node.icon, tx - textWidth(c.node.label, FONT, 'sans500') / 2 - ICON_W, labelY)
          : []),
        ...(glyphW && c.node.kind && !c.node.icon
          ? glyphItems(c.node.kind, tx - textWidth(c.node.label, FONT, 'sans500') / 2 - 15, labelY)
          : []),
        { type: 'text', cls: 'pr-label', x: tx, y: labelY, dy: '0.35em', text: c.node.label },
        ...(c.note.length
          ? [linesItem(c.note, c.x, labelY + 17 + ((c.note.length - 1) * NOTE_LINE) / 2, NOTE_LINE, 'pr-note')]
          : []),
      ],
    };
  });

  const labels: Item[] = [];
  const anchors = new Map<EdgeIndex, { x: number; y: number }>();
  const ends = new Map<EdgeIndex, { x: number; y: number }>();
  const edgeItems = placed.map((row): Item => {
    const { e, a, b } = row;
    const both = e.arrow === '<->';
    const cls = `pr-edge${e.arrow === '-->' ? ' pr-dashed' : ''}`;
    const attrs: Attrs = [
      ['data-edge', String(e.index)],
      ['data-from', e.from],
      ['data-to', e.to],
      ...attr('data-role', e.role),
    ];
    if (row.self) {
      const x0 = a.x;
      const y0 = row.y;
      const y1 = y0 + SELF_H;
      const items: Item[] = [
        {
          type: 'path',
          cls: 'pr-line',
          d: `M${n(x0)},${n(y0)}H${n(x0 + SELF_W - 8)}Q${n(x0 + SELF_W)},${n(y0)} ${n(x0 + SELF_W)},${n(y0 + 8)}V${n(y1 - 8)}Q${n(x0 + SELF_W)},${n(y1)} ${n(x0 + SELF_W - 8)},${n(y1)}H${n(x0 + HEAD - 1)}`,
        },
        { type: 'path', cls: 'pr-head', d: arrowhead(x0 + 1, y1, -1, 0) },
      ];
      if (row.lines.length)
        labels.push({
          type: 'group',
          cls: 'pr-edge-label',
          attrs: [['data-edge', String(e.index)], ...attr('data-role', e.role)],
          items: [linesItem(row.lines, x0 + SELF_W + 10, (y0 + y1) / 2, LABEL_LINE, 'pr-elabel pr-left')],
        });
      anchors.set(e.index, { x: x0 - 14, y: (y0 + y1) / 2 });
      const w = Math.max(0, ...row.lines.map((l) => textWidth(l, LABEL_FONT)));
      ends.set(e.index, { x: x0 + SELF_W + (w ? w + 22 : 14), y: (y0 + y1) / 2 });
      return { type: 'group', cls, attrs, items };
    }
    const dir = Math.sign(b.x - a.x);
    const x0 = a.x + (both ? dir * (HEAD - 1) : 0);
    const x1 = b.x - dir * (HEAD - 1);
    const items: Item[] = [
      { type: 'path', cls: 'pr-line', d: `M${n(x0)},${n(row.y)}H${n(x1)}` },
      { type: 'path', cls: 'pr-head', d: arrowhead(b.x - dir, row.y, dir, 0) },
    ];
    if (both) items.push({ type: 'path', cls: 'pr-head', d: arrowhead(a.x + dir, row.y, -dir, 0) });
    const cx = (a.x + b.x) / 2;
    if (row.lines.length) {
      const ly = row.y - 7 - ((row.lines.length - 1) * LABEL_LINE) / 2 - LABEL_LINE / 2 + 3;
      labels.push({
        type: 'group',
        cls: 'pr-edge-label',
        attrs: [['data-edge', String(e.index)], ...attr('data-role', e.role)],
        items: [linesItem(row.lines, cx, ly, LABEL_LINE, 'pr-elabel')],
      });
      const w = Math.max(...row.lines.map((l) => textWidth(l, LABEL_FONT)));
      anchors.set(e.index, { x: cx - w / 2 - 12, y: ly });
      ends.set(e.index, { x: cx + w / 2 + 12, y: ly });
    } else {
      anchors.set(e.index, { x: cx, y: row.y - 12 });
      ends.set(e.index, { x: cx + 18, y: row.y - 12 });
    }
    return { type: 'group', cls, attrs, items };
  });

  const markers: Item[] = [];
  const stacked = new Map<string, number>();
  d.steps.forEach((s, i) => {
    const t = s.target;
    const c = t.type === 'node' ? cols[at.get(t.id) ?? -1] : undefined;
    const band = t.type === 'edges' ? bandSpot.get(t.id) : undefined;
    const spot = c
      ? { x: c.x - c.w / 2, y: headerTop }
      : band
        ? { x: band.x0, y: band.top }
        : t.type === 'edge'
          ? anchors.get(t.index)
          : undefined;
    if (!spot) return;
    const key = t.type === 'edge' ? 'e:' + t.index : 'n:' + t.id;
    const k = stacked.get(key) ?? 0;
    stacked.set(key, k + 1);
    markers.push(badgeItem('pr-step-marker', [['data-step', String(i + 1)]], spot.x - k * 18, spot.y, String(i + 1)));
  });
  for (const c of cols) {
    const letter = context.marker({ type: 'node', id: c.node.id });
    if (letter !== undefined)
      markers.push(badgeItem('pr-ref-marker', [['data-node', c.node.id]], c.x + c.w / 2, headerTop, letter));
  }
  for (const [id, band] of bandSpot) {
    const letter = context.marker({ type: 'edges', id });
    if (letter !== undefined) markers.push(badgeItem('pr-ref-marker', [['data-node', id]], band.x1, band.top, letter));
  }
  for (const [index, spot] of ends) {
    const letter = context.marker({ type: 'edge', index });
    if (letter !== undefined)
      markers.push(badgeItem('pr-ref-marker', [['data-edge', String(index)]], spot.x, spot.y, letter));
  }

  const scene: Scene = {
    id: domId,
    cls: 'pr-sequence',
    width,
    height,
    hatch: false,
    items: [...groupItems, ...phaseItems, ...columnItems, ...edgeItems, ...labels, ...markers],
  };
  return { svg: trusted(paintSvg(scene)), width, height, scene };
}

const nodeAttrs = (id: string, domId: string): Attrs => [
  ['data-node', id],
  ['id', `${domId}-node-${id}`],
];

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

function hasGlyph(node: Participant): boolean {
  return node.kind !== undefined && node.kind !== 'database';
}

function tag(x: number, y: number, label: string): string {
  const w = textWidth(label.toUpperCase(), 10.5, 'sans600') * 1.18 + 22;
  return `M${n(x + 6)},${n(y)}H${n(x + w)}V${n(y + TAG_H - 6)}L${n(x + w - 6)},${n(y + TAG_H)}H${n(x)}V${n(y + 6)}Q${n(x)},${n(y)} ${n(x + 6)},${n(y)}Z`;
}

const slotW = (node: Participant): number => (node.icon ? ICON_W : hasGlyph(node) ? GLYPH_W : 0);
