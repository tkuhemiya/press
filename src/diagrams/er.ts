import type { Cardinality, Entity, Er, Field, NodeId, Part, Reference } from '../model.ts';
import type { DiagramDef, RenderContext, Rendered } from './diagram.ts';
import type { End as Ref, Fence } from '../parse/grammar.ts';
import type { Reporter } from '../diagnostics.ts';
import { buildGraph, header, leanBy, nodeParts, resolvePartSteps, toNode } from '../parse/graph.ts';
import { trusted } from '../brand.ts';
import { cnode, compoundLayout, type CEdge, type CNode } from '../layout/pele/compound.ts';
import {
  labelItem,
  markerItems,
  refMarkers,
  type Box,
  nodeTargets,
  edgeTargets,
  propTargets,
  type Anchor,
} from './draw.ts';
import { textWidth, wrap } from '../text/measure.ts';
import { linesItem, n } from '../render/svg.ts';
import { attr, type Item, type Scene } from '../scene/scene.ts';
import { paintSvg } from '../scene/svg.ts';

export const ER: DiagramDef<'er'> = {
  type: 'er',
  name: 'Entity-relationship',
  build,
  render,
  targets: (d) => [
    ...nodeParts(d.nodes),
    ...d.nodes.flatMap((node) =>
      node.fields.map((f) => {
        const part: Part = { target: { type: 'prop', node: node.id, key: f.name } };
        if (f.role) part.role = f.role;
        return part;
      }),
    ),
  ],
  ends(d, edge) {
    const e = d.edges[edge];
    if (!e) return undefined;
    const [from, to] = ends(e);
    const name = (end: { entity: NodeId; field?: NodeId }) =>
      end.field === undefined ? end.entity : `${end.entity}.${end.field}`;
    return [name(from), name(to)];
  },
  turnable: (d) => d.direction === undefined,
  withoutMuted(d, pinned) {
    const kept = leanBy(
      d,
      pinned,
      (e) => {
        const [from, to] = ends(e);
        return [from.entity, to.entity];
      },
      (index) => ({ type: 'edge', index }),
    );
    return kept && { ...d, ...kept };
  },
};

const CARDINALITIES = ['1', '0..1', 'N', '1..N'] as const;
const isCardinality = (s: string | undefined): s is Cardinality => CARDINALITIES.some((c) => c === s);

function cardinality(text: string): [Cardinality, Cardinality] | undefined {
  const [from, to, ...rest] = text.split(':');
  return isCardinality(from) && isCardinality(to) && !rest.length ? [from, to] : undefined;
}

const refText = (e: Ref): string => (e.key === undefined ? e.node : `${e.node}.${e.key}`);

function build(fence: Fence, report: Reporter): Er {
  const { error } = report;
  const graph = buildGraph(fence, report, {
    label: (id) => id,
    empty: 'Add at least one edge, e.g. `a -> b : label`.',
    chain(s) {
      if (!s.arrows.includes('<->')) return true;
      error(
        s.line,
        '`<->` is not allowed in an er diagram: a reference has a direction.',
        `Draw it from the field that refers to the field it refers to: \`${refText(s.ends[0])} -> ${refText(s.ends[1])} {card=N:1}\`.`,
      );
      return false;
    },
  });
  const isField = (end: Ref) => graph.props.some((p) => p.node === end.node && p.key === end.key);

  const edges = graph.links.flatMap(({ edge: e, from, to, attrs }): Reference[] => {
    if (e.arrow === '<->') return [];
    const pair = `${refText(from)} -> ${refText(to)}`;
    const card = attrs.get('card');
    const parsed = card === undefined ? undefined : cardinality(card);
    if (card === undefined)
      error(
        e.line,
        `\`${pair}\` needs a cardinality.`,
        `Add \`{card=N:1}\` and adjust it: each end is \`1\`, \`0..1\`, \`N\` (zero or more) or \`1..N\`, read from \`${from.node}\` to \`${to.node}\`.`,
      );
    else if (!parsed) {
      const fixed = card
        .toUpperCase()
        .replace(/ONE/g, '1')
        .replace(/MANY|M/g, 'N')
        .replace(/-TO-/g, ':')
        .replace(/\*/g, 'N');
      error(
        e.line,
        `\`card=${card}\` is not a cardinality.`,
        `${cardinality(fixed) ? `Did you mean \`card=${fixed}\`? ` : ''}Write two ends joined by \`:\`, each \`1\`, \`0..1\`, \`N\` or \`1..N\`: \`{card=N:1}\`.`,
      );
    }
    if ((from.key === undefined) !== (to.key === undefined))
      error(
        e.line,
        `\`${pair}\` joins a field to a whole entity.`,
        'Join two fields, as in `orders.user_id -> users.id`, or two entities, as in `orders -> users`.',
      );
    for (const end of [from, to])
      if (end.key !== undefined && !isField(end))
        error(
          e.line,
          `\`${refText(end)}\` is not a field in the diagram.`,
          `Declare it with its type first: \`${refText(end)} : uuid\`.`,
        );
    const base = { index: e.index, arrow: e.arrow, line: e.line, cardinality: parsed ?? ['N', '1'] } as const;
    const ref: Reference =
      from.key !== undefined && to.key !== undefined
        ? {
            ...base,
            level: 'field',
            from: { entity: from.node, field: from.key },
            to: { entity: to.node, field: to.key },
          }
        : { ...base, level: 'entity', from: from.node, to: to.node };
    if (e.label !== undefined) ref.label = e.label;
    if (e.role) ref.role = e.role;
    return [ref];
  });

  for (const p of graph.props) {
    for (const k of ['key', 'unique', 'null']) {
      const value = p.attrs.get(k);
      if (value !== undefined && value !== 'yes')
        error(p.line, `\`${k}=${value}\` is not understood.`, `Write \`{${k}=yes}\`, or leave it out.`);
    }
    const card = p.attrs.get('card');
    if (card !== undefined)
      error(
        p.line,
        '`card` belongs on an edge, not a field.',
        `Move it to the reference: \`${p.node}.${p.key} -> other.id {card=${card}}\`.`,
      );
  }

  const nodes = graph.nodes.map((draft): Entity => ({
    ...toNode(draft),
    fields: graph.props
      .filter((p) => p.node === draft.id)
      .map((p): Field => {
        const field: Field = {
          entity: p.node,
          name: p.key,
          primary: p.attrs.get('key') === 'yes',
          unique: p.attrs.get('unique') === 'yes',
          nullable: p.attrs.get('null') === 'yes',
          line: p.line,
        };
        if (p.value !== undefined) field.type = p.value;
        if (p.role) field.role = p.role;
        return field;
      }),
  }));
  const steps = resolvePartSteps(
    fence.steps,
    nodes,
    graph.edges,
    {
      props: graph.props,
      keyed: graph.links,
    },
    report,
  );
  return { ...header(fence, 'er'), nodes, edges, groups: graph.groups, steps };
}

const MARGIN = 16;
const FONT = 14;
const FIELD_FONT = 13;
const TYPE_FONT = 11.5;
const HEAD_H = 34;
const ROW_H = 26;
const PAD_X = 12;
const GAP = 22;
const MIN_W = 150;
const KEY_W = 16;
const GROUP_PAD = 16;
const GROUP_TITLE = 30;
const LABEL_FONT = 12.5;
const LABEL_LINE = 16;

const LEAD = 30;

interface Table {
  node: Entity;
  fields: Field[];
  w: number;
  h: number;
  box: Box;
}

interface Point {
  x: number;
  y: number;
}

interface End extends Point {
  ux: number;
  uy: number;
}

const rowBox = (e: Table, k: number): Box => ({
  x: e.box.x + 3,
  y: e.box.y + HEAD_H + k * ROW_H + 3,
  w: e.box.w - 6,
  h: ROW_H,
});

function render(d: Er, context: RenderContext): Rendered {
  const { domId } = context;
  const dir = (context.direction ?? d.direction ?? 'right') === 'right' ? 'LR' : 'TB';
  const entities: Table[] = d.nodes.map((node) => {
    const fields = [...node.fields.filter((f) => f.primary), ...node.fields.filter((f) => !f.primary)];
    const fieldW = Math.max(
      0,
      ...fields.map((f) => KEY_W + textWidth(f.name, FIELD_FONT, 'sans500') + GAP + textWidth(typeText(f), TYPE_FONT)),
    );
    const w = Math.ceil(Math.max(MIN_W, textWidth(node.label, FONT, 'sans600') + 2 * PAD_X, fieldW + 2 * PAD_X));
    const h = HEAD_H + fields.length * ROW_H + (fields.length ? 6 : 0);
    return { node, fields, w, h, box: { x: 0, y: 0, w, h } };
  });
  const byId = new Map(entities.map((e) => [e.node.id, e]));

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
  const boxed = entities.map((e, i) => {
    const c = cnode(e.w, e.h, e.node.group ?? -1);
    c.seq = i;
    cnodes.push(c);
    return { e, c };
  });
  d.groups.forEach(
    (_, g) => (cnodes[g].seq = Math.min(Infinity, ...d.nodes.map((node, i) => (node.group === g ? i : Infinity)))),
  );
  const index = new Map(d.nodes.map((node, i) => [node.id, base + i]));
  const labelSize = (e: Reference): [number, number] => {
    if (!e.label) return [0, 0];
    const lines = wrap(e.label, LABEL_FONT, 150);
    return [Math.max(...lines.map((l) => textWidth(l, LABEL_FONT))) + 10, lines.length * LABEL_LINE + 4];
  };
  const routed = d.edges.flatMap((e) => {
    const [from, to] = ends(e);
    const a = byId.get(from.entity);
    const b = byId.get(to.entity);
    const src = index.get(from.entity);
    const dst = index.get(to.entity);
    return a && b && src !== undefined && dst !== undefined && from.entity !== to.entity
      ? [{ e, from, to, a, b, src, dst }]
      : [];
  });
  const cedges: CEdge[] = routed.map(({ e, src, dst }) => {
    const [labelW, labelH] = labelSize(e);
    return {
      src,
      dst,
      minlen: 1,
      labelW: labelW + 2 * LEAD,
      labelH,
      route: [],
      labelX: 0,
      labelY: 0,
    };
  });
  const layout = compoundLayout(cnodes, cedges, dir, {
    nodeSep: 36,
    edgeSep: 16,
    rankSep: 60,
    portSep: 20,
    headRoom: 0,
  });
  for (const { e, c } of boxed) e.box = { x: MARGIN + c.x - e.w / 2, y: MARGIN + c.y - e.h / 2, w: e.w, h: e.h };

  const rowY = (e: Table, key?: NodeId): number => {
    const i = key ? e.fields.findIndex((f) => f.name === key) : -1;
    return i < 0 ? e.box.y + HEAD_H / 2 : e.box.y + HEAD_H + i * ROW_H + ROW_H / 2;
  };
  const sides = ({ from, to, a, b }: (typeof routed)[number]): [End, End] => {
    const aMid = a.box.x + a.box.w / 2;
    const bMid = b.box.x + b.box.w / 2;
    const apart = a.box.x + a.box.w + 2 * LEAD <= b.box.x || b.box.x + b.box.w + 2 * LEAD <= a.box.x;
    if (!apart && from.field === undefined) {
      const down = b.box.y > a.box.y;
      return [
        { x: aMid, y: down ? a.box.y + a.box.h : a.box.y, ux: 0, uy: down ? 1 : -1 },
        { x: bMid, y: down ? b.box.y : b.box.y + b.box.h, ux: 0, uy: down ? -1 : 1 },
      ];
    }
    const aRight = apart ? bMid > aMid : true;
    const bRight = apart ? aMid > bMid : true;
    return [
      { x: aRight ? a.box.x + a.box.w : a.box.x, y: rowY(a, from.field), ux: aRight ? 1 : -1, uy: 0 },
      { x: bRight ? b.box.x + b.box.w : b.box.x, y: rowY(b, to.field), ux: bRight ? 1 : -1, uy: 0 },
    ];
  };
  const placed = routed.map((r) => ({ e: r.e, from: r.from.entity, to: r.to.entity, ends: sides(r) }));
  const spots = new Map<string, End[]>();
  for (const { ends: pair } of placed)
    for (const end of pair) {
      const k = `${Math.round(end.x)},${Math.round(end.y)},${end.ux},${end.uy}`;
      spots.set(k, [...(spots.get(k) ?? []), end]);
    }
  for (const group of spots.values()) {
    group.forEach((end, i) => {
      const off = (i - (group.length - 1) / 2) * 22;
      end.x += -end.uy * off;
      end.y += end.ux * off;
    });
  }

  let maxX = layout.width + MARGIN;
  const groups: Item[] = d.groups.map((g, i) => {
    const c = cnodes[i];
    const x = MARGIN + c.x - c.w / 2;
    const y = MARGIN + c.y - c.h / 2;
    return {
      type: 'group',
      cls: 'pr-group',
      items: [
        { type: 'rect', x, y, w: c.w, h: c.h, r: 12 },
        { type: 'text', x: x + 14, y: y + 19, text: g.label },
      ],
    };
  });
  const edges: Item[] = [];
  const labels: Item[] = [];
  const anchors = new Map<number, Anchor>();
  for (const { e, from: fromId, to: toId, ends: pair } of placed) {
    const [p, q] = pair;
    const reach = Math.max(LEAD + 20, (p.ux ? Math.abs(q.x - p.x) : Math.abs(q.y - p.y)) / 2);
    const c1 = { x: p.x + p.ux * reach, y: p.y + p.uy * reach };
    const c2 = { x: q.x + q.ux * reach, y: q.y + q.uy * reach };
    maxX = Math.max(maxX, c1.x, c2.x);
    edges.push(relation(e, fromId, toId, p, q, c1, c2));
    const mx = 0.125 * p.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * q.x;
    const my = 0.125 * p.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * q.y;
    if (e.label) {
      labels.push(labelItem(e, mx, my, onGroup(mx, my)));
      anchors.set(e.index, { x: mx - labelSize(e)[0] / 2 - 4, y: my, w: labelSize(e)[0] + 8 });
    } else anchors.set(e.index, { x: mx, y: my });
  }

  function onGroup(x: number, y: number): boolean {
    return d.groups.some((_, i) => {
      const c = cnodes[i];
      return Math.abs(MARGIN + c.x - x) < c.w / 2 && Math.abs(MARGIN + c.y - y) < c.h / 2;
    });
  }

  const width = Math.ceil(maxX + MARGIN);
  const height = Math.ceil(layout.height + 2 * MARGIN);
  const boxes = new Map<string, Box>();
  for (const e of entities) {
    boxes.set(e.node.id, { x: e.box.x, y: e.box.y, w: e.box.w, h: HEAD_H });
    e.fields.forEach((f, k) => boxes.set(`${e.node.id}.${f.name}`, rowBox(e, k)));
  }
  const fields = d.nodes.flatMap((node) => node.fields.map((f) => ({ node: node.id, key: f.name })));
  const scene: Scene = {
    id: domId,
    cls: 'pr-er',
    width,
    height,
    hatch: true,
    items: [
      ...groups,
      ...edges,
      ...entities.flatMap((e) => entityItems(e, domId)),
      ...labels,
      ...markerItems(
        d,
        boxes,
        anchors,
        refMarkers(context, [...nodeTargets(d.nodes), ...propTargets(fields), ...edgeTargets(d.edges)]),
      ),
    ],
  };
  return { svg: trusted(paintSvg(scene)), width, height, scene };
}

function relation(e: Reference, fromId: NodeId, toId: NodeId, p: End, q: End, c1: Point, c2: Point): Item {
  const [from, to] = e.cardinality;
  return {
    type: 'group',
    cls: `pr-edge${e.arrow === '-->' ? ' pr-dashed' : ''}`,
    attrs: [['data-edge', String(e.index)], ['data-from', fromId], ['data-to', toId], ...attr('data-role', e.role)],
    items: [
      {
        type: 'path',
        cls: 'pr-line',
        d: `M${n(p.x)},${n(p.y)}C${n(c1.x)},${n(c1.y)} ${n(c2.x)},${n(c2.y)} ${n(q.x)},${n(q.y)}`,
      },
      ...crowsFoot(p, from),
      ...crowsFoot(q, to),
    ],
  };
}

function entityItems(e: Table, domId: string): Item[] {
  const { node } = e;
  const b = e.box;
  const head: Item = e.fields.length
    ? {
        type: 'path',
        cls: 'pr-entity-head',
        d: `M${n(b.x + 0.6)},${n(b.y + HEAD_H)}V${n(b.y + 8)}Q${n(b.x + 0.6)},${n(b.y + 0.6)} ${n(b.x + 8)},${n(b.y + 0.6)}H${n(b.x + b.w - 8)}Q${n(b.x + b.w - 0.6)},${n(b.y + 0.6)} ${n(b.x + b.w - 0.6)},${n(b.y + 8)}V${n(b.y + HEAD_H)}Z`,
      }
    : { type: 'rect', cls: 'pr-entity-head', x: b.x + 0.6, y: b.y + 0.6, w: b.w - 1.2, h: b.h - 1.2, r: 7.5 };
  const rule: Item[] = e.fields.length
    ? [{ type: 'path', cls: 'pr-entity-rule', d: `M${n(b.x)},${n(b.y + HEAD_H)}H${n(b.x + b.w)}` }]
    : [];
  const entity: Item = {
    type: 'group',
    cls: 'pr-node pr-entity',
    attrs: [['data-node', node.id], ['id', `${domId}-node-${node.id}`], ...attr('data-role', node.role)],
    items: [
      { type: 'rect', cls: 'pr-box', x: b.x, y: b.y, w: b.w, h: b.h, r: 8 },
      head,
      ...rule,
      linesItem([node.label], b.x + b.w / 2, b.y + HEAD_H / 2, 18, 'pr-label pr-entity-name'),
    ],
  };
  return [entity, ...e.fields.map((f, k) => fieldItem(e, f, k, domId))];
}

function fieldItem(e: Table, f: Field, k: number, domId: string): Item {
  const { node } = e;
  const b = e.box;
  const row = rowBox(e, k);
  const id = `${node.id}.${f.name}`;
  const cy = row.y + ROW_H / 2;
  const key = f.primary;
  return {
    type: 'group',
    cls: `pr-node pr-field${key ? ' pr-key' : ''}`,
    attrs: [['data-node', id], ['data-in', node.id], ['id', `${domId}-node-${id}`], ...attr('data-role', f.role)],
    items: [
      { type: 'rect', cls: 'pr-box pr-field-box', x: row.x, y: row.y, w: row.w, h: row.h, r: 4 },
      ...(key ? [keyGlyph(b.x + PAD_X + 5, cy)] : []),
      { type: 'text', cls: 'pr-field-name', x: b.x + PAD_X + KEY_W, y: cy, text: f.name, dy: '0.35em' },
      { type: 'text', cls: 'pr-field-type', x: b.x + b.w - PAD_X, y: cy, text: typeText(f), dy: '0.35em' },
    ],
  };
}

function ends(e: Reference): [{ entity: NodeId; field?: NodeId }, { entity: NodeId; field?: NodeId }] {
  return e.level === 'field'
    ? [
        { entity: e.from.entity, field: e.from.field },
        { entity: e.to.entity, field: e.to.field },
      ]
    : [{ entity: e.from }, { entity: e.to }];
}

function typeText(f: Field): string {
  return [f.type ?? '', f.unique ? 'unique' : '', f.nullable ? 'null' : ''].filter(Boolean).join(' · ');
}

function keyGlyph(x: number, y: number): Item {
  return {
    type: 'group',
    cls: 'pr-glyph pr-key-glyph',
    items: [
      { type: 'circle', cx: x - 2, cy: y, r: 2.6 },
      { type: 'path', d: `M${n(x + 0.6)},${n(y)}H${n(x + 6)}M${n(x + 4)},${n(y)}v2.4` },
    ],
  };
}

function crowsFoot(e: End, end: string): Item[] {
  const at = (d: number, w: number): Point => ({ x: e.x + e.ux * d - e.uy * w, y: e.y + e.uy * d + e.ux * w });
  const str = (d: number, w: number): string => {
    const p = at(d, w);
    return `${n(p.x)},${n(p.y)}`;
  };
  const bar = (d: number) => `M${str(d, -7)}L${str(d, 7)}`;
  const many = end === 'N' || end === '1..N';
  const zero = end === 'N' || end === '0..1';
  let s = many ? `M${str(0, -7)}L${str(13, 0)}L${str(0, 7)}` : bar(9);
  if (!zero) s += bar(many ? 17 : 15);
  const items: Item[] = [{ type: 'path', cls: 'pr-crow', d: s }];
  if (zero) {
    const ring = at(22, 0);
    items.push({ type: 'circle', cls: 'pr-crow-ring', cx: ring.x, cy: ring.y, r: 4.2 });
  }
  return items;
}
