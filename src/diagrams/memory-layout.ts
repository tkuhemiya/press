import type { Block, MemoryLayout, Part, Pointer, Slot } from '../model.ts';
import type { DiagramDef, RenderContext, Rendered } from './diagram.ts';
import type { End, Fence } from '../parse/grammar.ts';
import type { Reporter } from '../diagnostics.ts';
import { buildGraph, header, nodeParts, resolvePartSteps, toNode } from '../parse/graph.ts';
import { trusted } from '../brand.ts';
import { edgeTargets, labelItem, markerItems, nodeTargets, propTargets, refMarkers } from './draw.ts';
import type { Anchor, Box } from './draw.ts';
import { textWidth } from '../text/measure.ts';
import { arrowhead, linesItem, n } from '../render/svg.ts';
import { markAttrs, type Item, type Scene } from '../scene/scene.ts';
import { paintSvg } from '../scene/svg.ts';
import { joinNotes } from './sign.ts';
import { rejectChanges } from './unchanged.ts';

export const MEMORY_LAYOUT: DiagramDef<'memory-layout'> = {
  type: 'memory-layout',
  name: 'Memory layout',
  build,
  render,
  targets: (d) => [
    ...nodeParts(d.nodes),
    ...d.nodes.flatMap((b) =>
      b.slots.map((s) => {
        const part: Part = { target: { type: 'prop', node: b.id, key: s.name } };
        if (s.role) part.role = s.role;
        return part;
      }),
    ),
  ],
  ends(d, edge) {
    const e = d.edges[edge];
    if (!e) return undefined;
    return [
      `${e.from.entity}.${e.from.field}`,
      e.to.field === undefined ? e.to.entity : `${e.to.entity}.${e.to.field}`,
    ];
  },
};

const SIZES: Record<string, number> = {
  bool: 1,
  char: 1,
  u8: 1,
  i8: 1,
  u16: 2,
  i16: 2,
  u32: 4,
  i32: 4,
  f32: 4,
  u64: 8,
  i64: 8,
  f64: 8,
  usize: 8,
  isize: 8,
  ptr: 8,
};

const isPointer = (type: string): boolean => type === 'ptr' || type.endsWith('*');

function measure(type: string): { size: number; align: number } | undefined {
  if (isPointer(type)) return { size: 8, align: 8 };
  const scalar = SIZES[type];
  if (scalar !== undefined) return { size: scalar, align: scalar };
  const array = /^(.+)\[(\d+)\]$/.exec(type);
  if (!array) return undefined;
  const element = measure(array[1].trim());
  return element && { size: element.size * Number(array[2]), align: element.align };
}

const refText = (e: End): string => (e.key === undefined ? e.node : `${e.node}.${e.key}`);

function build(fence: Fence, report: Reporter): MemoryLayout {
  const { error, warn } = report;
  rejectChanges(fence, report);
  for (const g of fence.groups)
    if (g.parent !== undefined)
      error(
        g.line,
        'Regions of memory do not nest.',
        'Close the outer group before this one; draw regions side by side.',
      );
  const graph = buildGraph(fence, report, {
    label: (id) => id.replace(/_/g, ' '),
    empty: 'Add fields in memory order, e.g. `order.id : u64`.',
    chain(s) {
      if (!s.arrows.includes('<->')) return true;
      error(
        s.line,
        '`<->` is not allowed in a memory layout: a pointer points one way.',
        `Draw it from the pointer field: \`${refText(s.ends[0])} -> ${refText(s.ends[1])}\`.`,
      );
      return false;
    },
  });

  const nodes = graph.nodes.map((draft): Block => {
    const packed = draft.attrs.get('packed');
    if (packed !== undefined && packed !== 'yes')
      error(draft.line, `\`packed=${packed}\` is not understood.`, 'Write `{packed=yes}`, or leave it out.');
    let offset = 0;
    const slots: Slot[] = [];
    for (const p of graph.props.filter((q) => q.node === draft.id)) {
      const name = `${p.node}.${p.key}`;
      if (p.value === undefined) {
        error(
          p.line,
          `\`${name}\` needs a type.`,
          `Give it one, as in \`${name} : u64\` or \`${name} : padding {size=4}\`.`,
        );
        continue;
      }
      const sizeText = p.attrs.get('size');
      const given = sizeText === undefined ? undefined : Number(sizeText);
      if (given !== undefined && !(Number.isInteger(given) && given > 0)) {
        error(
          p.line,
          `\`size=${sizeText}\` is not a number of bytes.`,
          'Write a whole number above zero: `{size=16}`.',
        );
        continue;
      }
      const padding = p.value === 'padding';
      const known = padding ? undefined : measure(p.value);
      const size = given ?? known?.size;
      if (size === undefined) {
        error(
          p.line,
          padding ? `\`${name}\` is padding with no size.` : `\`${p.value}\` has no size Press knows.`,
          `Give it one in bytes: \`${name} : ${p.value} {size=${padding ? 4 : 16}}\`.`,
        );
        continue;
      }
      if (known && packed !== 'yes' && offset % known.align !== 0) {
        const pad = known.align - (offset % known.align);
        warn(
          p.line,
          `\`${name}\` (${p.value}) starts at byte ${offset}, which is not a multiple of ${known.align}.`,
          `Add \`${p.node}.pad${slots.filter((s) => s.padding).length || ''} : padding {size=${pad}}\` before it, or mark the block packed: \`${p.node} {packed=yes}\`.`,
        );
      }
      const slot: Slot = {
        block: p.node,
        name: p.key,
        type: p.value,
        offset,
        size,
        padding,
        pointer: isPointer(p.value),
        line: p.line,
      };
      const role = p.role ?? (padding ? 'muted' : undefined);
      if (role) slot.role = role;
      if (p.note !== undefined) slot.note = p.note;
      slots.push(slot);
      offset += size;
    }
    return { ...toNode(draft), slots, size: offset };
  });

  const slotOf = (end: End): Slot | undefined =>
    nodes.find((b) => b.id === end.node)?.slots.find((s) => s.name === end.key);
  const edges = graph.links.flatMap(({ edge: e, from, to }): Pointer[] => {
    if (e.arrow === '<->') return [];
    if (from.key === undefined) {
      error(
        e.line,
        `A pointer starts at a field, not a whole block: \`${from.node} -> ${refText(to)}\`.`,
        `Draw it from the field that holds the address: \`${from.node}.next -> ${refText(to)}\`.`,
      );
      return [];
    }
    const source = slotOf(from);
    if (!source) {
      error(
        e.line,
        `\`${refText(from)}\` is not a field in the diagram.`,
        `Declare it with its type first: \`${refText(from)} : ptr\`.`,
      );
      return [];
    }
    if (to.key !== undefined && !slotOf(to)) {
      error(
        e.line,
        `\`${refText(to)}\` is not a field in the diagram.`,
        `Point at the block instead: \`${refText(from)} -> ${to.node}\`.`,
      );
      return [];
    }
    if (!source.pointer)
      warn(
        e.line,
        `\`${refText(from)}\` is a ${source.type}, not a pointer.`,
        `Give it a pointer type such as \`ptr\` or \`Node*\`: \`${refText(from)} : ptr\`.`,
      );
    const pointer: Pointer = {
      index: e.index,
      arrow: e.arrow,
      line: e.line,
      from: { entity: from.node, field: from.key },
      to: to.key === undefined ? { entity: to.node } : { entity: to.node, field: to.key },
    };
    if (e.label !== undefined) pointer.label = e.label;
    if (e.role) pointer.role = e.role;
    return [pointer];
  });

  const steps = resolvePartSteps(fence.steps, nodes, graph.edges, { props: graph.props, keyed: graph.links }, report);
  return { ...header(fence, 'memory-layout'), nodes, edges, groups: graph.groups, steps };
}

const MARGIN = 14;
const BYTE = 40;
const WORD = 8;
const CELL_H = 38;
const OFFSET_H = 15;
const BREAK_H = 22;
const HEAD = 26;
const BLOCK_GAP = 22;
const COL_GAP = 88;
const REGION_HEAD = 26;
const REGION_PAD = 12;
const LABEL_FONT = 14;
const TYPE_FONT = 11.5;
const ROW_W = WORD * BYTE;

type Entry = { kind: 'row'; r: number } | { kind: 'break'; bytes: number };

interface Placed {
  block: Block;
  x: number;
  y: number;
  h: number;
  column: number;
}

const LEGEND_LINE = 15;

function entries(b: Block): Entry[] {
  const count = Math.ceil(b.size / WORD);
  const hidden = new Set<number>();
  for (const s of b.slots) {
    const first = Math.floor(s.offset / WORD);
    const last = Math.floor((s.offset + s.size - 1) / WORD);
    for (let r = first + 1; r < last; r++) hidden.add(r);
  }
  const out: Entry[] = [];
  for (let r = 0; r < count; r++) {
    const prev = out.at(-1);
    if (!hidden.has(r)) out.push({ kind: 'row', r });
    else if (prev?.kind === 'break') prev.bytes += WORD;
    else out.push({ kind: 'break', bytes: WORD });
  }
  return out;
}

const widestBytes = (s: Slot): number => {
  const end = s.offset + s.size;
  const firstEnd = Math.min(end, (Math.floor(s.offset / WORD) + 1) * WORD);
  const lastStart = Math.max(s.offset, Math.floor((end - 1) / WORD) * WORD);
  return Math.max(firstEnd - s.offset, end - lastStart);
};

const fieldName = (s: Slot): string => s.name.replace(/_/g, ' ');

const named = (s: Slot): boolean => textWidth(fieldName(s), LABEL_FONT, 'sans500') <= widestBytes(s) * BYTE - 8;

const blockHeight = (b: Block): number => {
  if (!b.slots.length) return HEAD + CELL_H;
  const rows = entries(b).reduce((h, e) => h + (e.kind === 'row' ? CELL_H + OFFSET_H : BREAK_H), 0);
  const legend = b.slots.filter((s) => !named(s)).length;
  return HEAD + rows + (legend ? 4 + legend * LEGEND_LINE : 0);
};

function render(d: MemoryLayout, context: RenderContext): Rendered {
  const { domId } = context;
  const regions = d.groups.length > 0;
  const columns: { group?: number; blocks: Block[] }[] = [];
  const loose = d.nodes.filter((b) => b.group === undefined);
  if (loose.length) columns.push({ blocks: loose });
  d.groups.forEach((_, g) => {
    const blocks = d.nodes.filter((b) => b.group === g);
    if (blocks.length) columns.push({ group: g, blocks });
  });

  const placed: Placed[] = [];
  const top = MARGIN + (regions ? REGION_HEAD : 0);
  let bottom = top;
  const columnBottom: number[] = [];
  columns.forEach((col, ci) => {
    const x = MARGIN + (regions ? REGION_PAD : 0) + ci * (ROW_W + COL_GAP);
    let y = top;
    for (const block of col.blocks) {
      const h = blockHeight(block);
      placed.push({ block, x, y, h, column: ci });
      y += h + BLOCK_GAP;
    }
    columnBottom.push(y - BLOCK_GAP + REGION_PAD);
    bottom = Math.max(bottom, y - BLOCK_GAP);
  });
  const regionBottom = bottom + REGION_PAD;
  const items: Item[] = columns.flatMap((col, ci): Item[] => {
    if (col.group === undefined) return [];
    const g = d.groups[col.group];
    const x = MARGIN + ci * (ROW_W + COL_GAP);
    return [
      {
        type: 'group',
        cls: 'pr-group pr-depth-1',
        attrs: markAttrs(g),
        items: [
          {
            type: 'rect',
            x,
            y: MARGIN,
            w: ROW_W + 2 * REGION_PAD,
            h: (columnBottom[ci] ?? regionBottom) - MARGIN,
            r: 8,
          },
          { type: 'text', x: x + 10, y: MARGIN + 17, text: g.label },
        ],
      },
    ];
  });

  const boxes = new Map<string, Box>();
  const fieldBoxes = new Map<string, Box>();
  for (const p of placed) items.push(blockItem(p, domId, boxes, fieldBoxes));

  const anchors = new Map<number, Anchor>();
  const at = new Map(placed.map((p) => [p.block.id, p]));
  for (const e of d.edges) {
    const from = at.get(e.from.entity);
    const to = at.get(e.to.entity);
    const field = fieldBoxes.get(`${e.from.entity}.${e.from.field}`);
    if (!from || !to || !field) continue;
    const target = (e.to.field === undefined ? undefined : fieldBoxes.get(`${e.to.entity}.${e.to.field}`)) ?? {
      x: to.x,
      y: to.y + HEAD,
      w: ROW_W,
      h: CELL_H,
    };
    const sy = field.y + field.h / 2;
    const ty = target.y + target.h / 2;
    const forward = to.column > from.column;
    const back = to.column < from.column;
    const sx = back ? from.x : from.x + ROW_W;
    const tx = forward ? to.x : to.x + ROW_W;
    const bend = forward || back ? Math.abs(tx - sx) / 2 : 44;
    const out = back ? -bend : bend;
    const into = forward ? -bend : bend;
    const path = `M${n(sx)},${n(sy)}C${n(sx + out)},${n(sy)} ${n(tx + into)},${n(ty)} ${n(tx)},${n(ty)}`;
    items.push({
      type: 'group',
      cls: `pr-edge${e.arrow === '-->' ? ' pr-dashed' : ''}`,
      attrs: [
        ['data-edge', String(e.index)],
        ['data-from', `${e.from.entity}.${e.from.field}`],
        ['data-to', e.to.field === undefined ? e.to.entity : `${e.to.entity}.${e.to.field}`],
        ...markAttrs(e),
      ],
      items: [
        { type: 'circle', cls: 'pr-ptr', cx: sx, cy: sy, r: 3 },
        { type: 'path', cls: 'pr-line', d: path },
        { type: 'path', cls: 'pr-head', d: arrowhead(tx, ty, forward ? 1 : -1, 0) },
      ],
    });
    const mx = (sx + out * 0.75 + tx + into * 0.75) / 2;
    const my = (sy + ty) / 2;
    anchors.set(e.index, { x: mx, y: my });
    if (e.label !== undefined) items.push(labelItem(e, mx, my, 0));
  }

  const right = Math.max(...placed.map((p) => p.x + ROW_W), MARGIN) + (regions ? REGION_PAD : 0);
  const sameColumnLoop = d.edges.some((e) => at.get(e.from.entity)?.column === at.get(e.to.entity)?.column);
  const width = Math.ceil(right + MARGIN + (sameColumnLoop ? 48 : 0));
  const height = Math.ceil((regions ? regionBottom : bottom) + MARGIN);
  const fields = d.nodes.flatMap((b) => b.slots.map((s) => ({ node: b.id, key: s.name })));
  for (const [id, b] of fieldBoxes) boxes.set(id, { ...b, x: b.x + 10, w: Math.max(0, b.w - 20) });
  items.push(
    ...markerItems(
      d,
      boxes,
      anchors,
      refMarkers(context, [...nodeTargets(d.nodes), ...propTargets(fields), ...edgeTargets(d.edges)]),
    ),
  );
  const scene: Scene = { id: domId, cls: 'pr-memory-layout', width, height, hatch: true, items };
  return { svg: trusted(paintSvg(scene)), width, height, scene };
}

function blockItem(p: Placed, domId: string, boxes: Map<string, Box>, fieldBoxes: Map<string, Box>): Item {
  const { block: b, x, y } = p;
  const sizeText = `${b.size} byte${b.size === 1 ? '' : 's'}`;
  const labelW = textWidth(b.label, LABEL_FONT, 'sans500');
  const head: Item[] = [
    linesItem([b.label], x, y + HEAD / 2 - 2, 18, 'pr-label pr-start'),
    ...(b.slots.length ? [linesItem([sizeText], x + labelW + 10, y + HEAD / 2 - 2, 15, 'pr-note pr-start')] : []),
  ];
  boxes.set(b.id, { x, y, w: ROW_W, h: p.h });
  if (!b.slots.length) {
    const box = { x, y: y + HEAD, w: ROW_W, h: CELL_H };
    if (b.note !== undefined) head.push(linesItem([b.note], x + ROW_W / 2, box.y + box.h / 2, 15, 'pr-note'));
    return {
      type: 'group',
      cls: 'pr-node pr-block',
      attrs: [['data-node', b.id], ['id', `${domId}-node-${b.id}`], ...markAttrs(b)],
      items: [{ type: 'rect', cls: 'pr-box pr-faint', ...box, r: 4 }, ...head],
    };
  }

  const rowY = new Map<number, number>();
  const breakAfter = new Map<number, { y: number; bytes: number }>();
  let cy = y + HEAD;
  let lastRow = -1;
  for (const e of entries(b)) {
    if (e.kind === 'row') {
      rowY.set(e.r, cy);
      lastRow = e.r;
      cy += CELL_H + OFFSET_H;
    } else {
      breakAfter.set(lastRow, { y: cy, bytes: e.bytes });
      cy += BREAK_H;
    }
  }

  const fieldItems: Item[] = [];
  const offsets = new Map<number, Set<number>>();
  const offsetAt = (r: number, byte: number): void => {
    offsets.set(r, (offsets.get(r) ?? new Set()).add(byte));
  };
  let legend = 0;
  const legendItems: Item[] = [];
  for (const s of b.slots) {
    const end = s.offset + s.size;
    const pieces: Box[] = [];
    for (let r = Math.floor(s.offset / WORD); r * WORD < end; r++) {
      const ry = rowY.get(r);
      if (ry === undefined) continue;
      const from = Math.max(s.offset, r * WORD);
      const to = Math.min(end, (r + 1) * WORD);
      pieces.push({ x: x + (from - r * WORD) * BYTE, y: ry, w: (to - from) * BYTE, h: CELL_H });
      offsetAt(r, from);
    }
    const [first] = pieces;
    if (!first) continue;
    fieldBoxes.set(`${b.id}.${s.name}`, first);
    const widest = pieces.reduce((a, c) => (c.w > a.w ? c : a));
    const cls = `pr-box${s.padding ? ' pr-faint' : ''}`;
    const parts: Item[] = pieces.map((pc) => ({ type: 'rect', cls, ...pc, r: 3 }));
    const ticks = pieces
      .flatMap((pc) =>
        Array.from({ length: pc.w / BYTE - 1 }, (_, i) => pc.x + (i + 1) * BYTE).map(
          (tx) => `M${n(tx)},${n(pc.y)}v5M${n(tx)},${n(pc.y + pc.h)}v-5`,
        ),
      )
      .join('');
    if (ticks) parts.push({ type: 'path', cls: 'pr-box-detail', d: ticks });
    const brk = breakAfter.get(Math.floor(s.offset / WORD));
    if (brk && s.size > 2 * WORD)
      parts.push(
        { type: 'rect', cls: `${cls} pr-external`, x, y: brk.y + 3, w: ROW_W, h: BREAK_H - 6, r: 3 },
        linesItem([`⋯ ${brk.bytes} more bytes`], x + ROW_W / 2, brk.y + BREAK_H / 2, 14, 'pr-note'),
      );
    const name = fieldName(s);
    const detail = s.padding ? undefined : joinNotes(s.type, s.note);
    const fits = (text: string, size: number, face: 'sans400' | 'sans500') =>
      textWidth(text, size, face) <= widest.w - 8;
    const mid = widest.x + widest.w / 2;
    const cyMid = widest.y + widest.h / 2;
    if (named(s)) {
      const withType = detail !== undefined && fits(detail, TYPE_FONT, 'sans400');
      parts.push(linesItem([name], mid, withType ? cyMid - 7 : cyMid, 18, 'pr-label'));
      if (withType && detail !== undefined) parts.push(linesItem([detail], mid, cyMid + 9, 15, 'pr-note'));
    } else {
      legend++;
      parts.push(linesItem([String(legend)], mid, cyMid, 15, 'pr-note'));
      legendItems.push(
        linesItem([`${legend}  ${joinNotes(name, detail) ?? name}`], x, 0, LEGEND_LINE, 'pr-note pr-start'),
      );
    }
    fieldItems.push({
      type: 'group',
      cls: 'pr-node pr-field',
      attrs: [
        ['data-node', `${b.id}.${s.name}`],
        ['data-in', `${b.id} ${s.name}`],
        ['id', `${domId}-node-${b.id}.${s.name}`],
        ...markAttrs(s),
      ],
      items: parts,
    });
  }

  const offsetItems: Item[] = [];
  for (const [r, set] of offsets) {
    const ry = rowY.get(r);
    if (ry === undefined) continue;
    for (const byte of set)
      offsetItems.push(
        linesItem([String(byte)], x + (byte - r * WORD) * BYTE + 6, ry + CELL_H + 8, 13, 'pr-note pr-offset'),
      );
  }
  const lastY = rowY.get(Math.floor((b.size - 1) / WORD));
  const lastByte = b.size % WORD === 0 ? WORD : b.size % WORD;
  if (lastY !== undefined)
    offsetItems.push(linesItem([String(b.size)], x + lastByte * BYTE - 6, lastY + CELL_H + 8, 13, 'pr-note pr-offset'));

  const legendPlaced = legendItems.map((it, i): Item =>
    it.type === 'lines' ? { ...it, cy: cy + 4 + LEGEND_LINE / 2 + i * LEGEND_LINE } : it,
  );
  return {
    type: 'group',
    cls: 'pr-node pr-block',
    attrs: [['data-node', b.id], ['id', `${domId}-node-${b.id}`], ...markAttrs(b)],
    items: [...head, ...fieldItems, ...offsetItems, ...legendPlaced],
  };
}
