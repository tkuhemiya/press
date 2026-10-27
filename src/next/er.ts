import type { Cardinality, Entity, Er, Field, NodeId, Reference } from './model.ts';
import type { DiagramDef, RenderContext, Rendered } from './diagram.ts';
import type { End as Ref, Fence } from './grammar.ts';
import type { Reporter } from './diagnostics.ts';
import { GRAMMARS } from './grammars.ts';
import { buildGraph, header, leanBy, resolvePartSteps, toNode } from './graph.ts';
import { trusted } from './brand.ts';
import { cnode, compoundLayout, type CEdge, type CNode } from '../layout/pele/compound.ts';
import { labelSvg, markers, type Box } from '../diagrams/graph.ts';
import { textWidth, wrap } from '../text/measure.ts';
import { esc, n, roleAttr, textBlock } from '../render/svg.ts';

export const ER: DiagramDef<'er'> = {
  type: 'er',
  name: 'Entity-relationship',
  grammar: GRAMMARS.er,
  build,
  render,
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

  const edges = graph.edges.flatMap((e, i): Reference[] => {
    const source = graph.sources[i];
    if (!source || e.arrow === '<->') return [];
    const { from, to, attrs } = source;
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
      keyed: graph.edges.flatMap((e, i) => {
        const source = graph.sources[i];
        if (!source) return [];
        const keyed = { index: e.index, from: source.from, to: source.to };
        return [e.label === undefined ? keyed : { ...keyed, label: e.label }];
      }),
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

function render(d: Er, context: RenderContext): Rendered {
  const { domId } = context;
  const dir = (d.direction ?? 'right') === 'right' ? 'LR' : 'TB';
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
  type End = { x: number; y: number; ux: number; uy: number };
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
  const out: string[] = [];
  const edgeSvgs: string[] = [];
  const labels: string[] = [];
  const anchors = new Map<number, { x: number; y: number }>();
  for (const { e, from: fromId, to: toId, ends: pair } of placed) {
    const [p, q] = pair;
    const reach = Math.max(LEAD + 20, (p.ux ? Math.abs(q.x - p.x) : Math.abs(q.y - p.y)) / 2);
    const c1 = { x: p.x + p.ux * reach, y: p.y + p.uy * reach };
    const c2 = { x: q.x + q.ux * reach, y: q.y + q.uy * reach };
    maxX = Math.max(maxX, c1.x, c2.x);
    const [from, to] = e.cardinality;
    let s = `<g class="pr-edge${e.arrow === '-->' ? ' pr-dashed' : ''}" data-edge="${e.index}" data-from="${esc(fromId)}" data-to="${esc(toId)}"${roleAttr(e.role)}>`;
    s += `<path class="pr-line" d="M${n(p.x)},${n(p.y)}C${n(c1.x)},${n(c1.y)} ${n(c2.x)},${n(c2.y)} ${n(q.x)},${n(q.y)}"/>`;
    s += crowsFoot(p, from) + crowsFoot(q, to);
    edgeSvgs.push(s + '</g>');
    const mx = 0.125 * p.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * q.x;
    const my = 0.125 * p.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * q.y;
    if (e.label) {
      labels.push(labelSvg(e, mx, my, onGroup(mx, my)));
      anchors.set(e.index, { x: mx - labelSize(e)[0] / 2 - 4, y: my });
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
  out.push(
    `<svg class="pr-svg pr-er" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">`,
  );
  out.push(
    `<defs><pattern id="${domId}-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" class="pr-hatch"/></pattern></defs>`,
  );
  d.groups.forEach((g, i) => {
    const c = cnodes[i];
    const x = MARGIN + c.x - c.w / 2;
    const y = MARGIN + c.y - c.h / 2;
    out.push(
      `<g class="pr-group"><rect x="${n(x)}" y="${n(y)}" width="${n(c.w)}" height="${n(c.h)}" rx="12"/><text x="${n(x + 14)}" y="${n(y + 19)}">${esc(g.label)}</text></g>`,
    );
  });
  out.push(...edgeSvgs);

  const boxes = new Map<string, Box>();
  for (const e of entities) {
    const { node } = e;
    const b = e.box;
    boxes.set(node.id, { x: b.x, y: b.y, w: b.w, h: HEAD_H });
    let s = `<g class="pr-node pr-entity" data-node="${esc(node.id)}" id="${domId}-node-${esc(node.id)}"${roleAttr(node.role)}>`;
    s += `<rect class="pr-box" x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="8"/>`;
    if (!e.fields.length)
      s += `<rect class="pr-entity-head" x="${n(b.x + 0.6)}" y="${n(b.y + 0.6)}" width="${n(b.w - 1.2)}" height="${n(b.h - 1.2)}" rx="7.5"/>`;
    else
      s += `<path class="pr-entity-head" d="M${n(b.x + 0.6)},${n(b.y + HEAD_H)}V${n(b.y + 8)}Q${n(b.x + 0.6)},${n(b.y + 0.6)} ${n(b.x + 8)},${n(b.y + 0.6)}H${n(b.x + b.w - 8)}Q${n(b.x + b.w - 0.6)},${n(b.y + 0.6)} ${n(b.x + b.w - 0.6)},${n(b.y + 8)}V${n(b.y + HEAD_H)}Z"/>`;
    if (e.fields.length) s += `<path class="pr-entity-rule" d="M${n(b.x)},${n(b.y + HEAD_H)}H${n(b.x + b.w)}"/>`;
    s += textBlock([node.label], b.x + b.w / 2, b.y + HEAD_H / 2, 18, 'pr-label pr-entity-name');
    out.push(s + '</g>');
    e.fields.forEach((f, k) => {
      const id = `${node.id}.${f.name}`;
      const ry = b.y + HEAD_H + k * ROW_H + 3;
      const row = { x: b.x + 3, y: ry, w: b.w - 6, h: ROW_H };
      boxes.set(id, row);
      const cy = ry + ROW_H / 2;
      const key = f.primary;
      let r = `<g class="pr-node pr-field${key ? ' pr-key' : ''}" data-node="${esc(id)}" data-in="${esc(node.id)}" id="${domId}-node-${esc(id)}"${roleAttr(f.role)}>`;
      r += `<rect class="pr-box pr-field-box" x="${n(row.x)}" y="${n(row.y)}" width="${n(row.w)}" height="${n(row.h)}" rx="4"/>`;
      if (key) r += keyGlyph(b.x + PAD_X + 5, cy);
      r += `<text class="pr-field-name" x="${n(b.x + PAD_X + KEY_W)}" y="${n(cy)}" dy="0.35em">${esc(f.name)}</text>`;
      r += `<text class="pr-field-type" x="${n(b.x + b.w - PAD_X)}" y="${n(cy)}" dy="0.35em">${esc(typeText(f))}</text>`;
      out.push(r + '</g>');
    });
  }
  out.push(...labels);
  const refs = new Map(
    entities.flatMap(({ node }) =>
      [
        { name: node.id, letter: context.marker({ type: 'node', id: node.id }) },
        ...node.fields.map((f) => ({
          name: `${node.id}.${f.name}`,
          letter: context.marker({ type: 'prop', node: node.id, key: f.name }),
        })),
      ].flatMap(({ name, letter }) => (letter === undefined ? [] : [[name, letter] as const])),
    ),
  );
  out.push(...markers(d, boxes, anchors, refs));
  out.push('</svg>');
  return { svg: trusted(out.join('')), width, height };
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

function keyGlyph(x: number, y: number): string {
  return `<g class="pr-glyph pr-key-glyph"><circle cx="${n(x - 2)}" cy="${n(y)}" r="2.6"/><path d="M${n(x + 0.6)},${n(y)}H${n(x + 6)}M${n(x + 4)},${n(y)}v2.4"/></g>`;
}

function crowsFoot(e: { x: number; y: number; ux: number; uy: number }, end: string): string {
  const pt = (d: number, w: number) => `${n(e.x + e.ux * d - e.uy * w)},${n(e.y + e.uy * d + e.ux * w)}`;
  const bar = (d: number) => `M${pt(d, -7)}L${pt(d, 7)}`;
  const many = end === 'N' || end === '1..N';
  const zero = end === 'N' || end === '0..1';
  let s = many ? `M${pt(0, -7)}L${pt(13, 0)}L${pt(0, 7)}` : bar(9);
  if (!zero) s += bar(many ? 17 : 15);
  let out = `<path class="pr-crow" d="${s}"/>`;
  if (zero) {
    const [cx, cy] = pt(22, 0).split(',');
    out += `<circle class="pr-crow-ring" cx="${cx}" cy="${cy}" r="4.2"/>`;
  }
  return out;
}
