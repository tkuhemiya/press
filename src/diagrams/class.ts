import type { ClassDiagram, Classifier, ClassKind, ClassLink, ClassRel, Member, Part } from '../model.ts';
import { CLASS_KINDS, CLASS_RELS } from '../model.ts';
import type { DiagramDef, RenderContext, Rendered } from './diagram.ts';
import type { End as Ref, Fence } from '../parse/grammar.ts';
import type { Reporter } from '../diagnostics.ts';
import { buildGraph, header, leanBy, nodeParts, resolvePartSteps, toNode } from '../parse/graph.ts';
import { trusted } from '../brand.ts';
import { closest, list } from '../diagnostics.ts';
import { cnode, compoundLayout, type CEdge, type CNode } from '../layout/pele/compound.ts';
import {
  groupClass,
  groupDepths,
  depthWhere,
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
import { arrowhead, linesItem, n } from '../render/svg.ts';
import { markAttrs, type Item, type Scene } from '../scene/scene.ts';
import { paintSvg } from '../scene/svg.ts';
import { renameOf, renamedItems, signedText, struck } from './sign.ts';

export const CLASS: DiagramDef<'class'> = {
  type: 'class',
  name: 'Class',
  build,
  render,
  targets: (d) => [
    ...nodeParts(d.nodes),
    ...d.nodes.flatMap((node) =>
      node.members.map((m) => {
        const part: Part = { target: { type: 'prop', node: m.owner, key: m.name } };
        if (m.role) part.role = m.role;
        return part;
      }),
    ),
  ],
  ends(d, edge) {
    const e = d.edges[edge];
    return e ? [e.from, e.to] : undefined;
  },
  turnable: (d) => d.direction === undefined,
  withoutMuted(d, pinned) {
    const kept = leanBy(
      d,
      pinned,
      (e) => [e.from, e.to],
      (index) => ({ type: 'edge', index }),
    );
    return kept && { ...d, ...kept, nodes: kept.nodes };
  },
};

const isRel = (s: string | undefined): s is ClassRel => CLASS_RELS.some((r) => r === s);
const isKind = (s: string | undefined): s is ClassKind => CLASS_KINDS.some((k) => k === s);

function build(fence: Fence, report: Reporter): ClassDiagram {
  const { error } = report;
  const graph = buildGraph(fence, report, {
    label: (id) => id.replace(/_/g, ' '),
    empty: 'Add at least one type, e.g. `order: "Order"` then `order.id : Uuid`.',
    chain(s) {
      const rel = s.attrs.get('rel');
      if (s.arrows.includes('<->') && rel !== undefined) {
        error(
          s.line,
          '`<->` cannot take `rel`.',
          'A bidirectional line is an association. For inheritance or composition, use `->` with `{rel=extends}` or `{rel=contains}`.',
        );
        return false;
      }
      return true;
    },
  });

  for (const p of graph.props) {
    const op = p.attrs.get('op');
    if (op !== undefined && op !== 'yes')
      error(p.line, `\`op=${op}\` is not understood.`, 'Write `{op=yes}` on a method, or leave it out for a field.');
    const rel = p.attrs.get('rel');
    if (rel !== undefined)
      error(
        p.line,
        '`rel` belongs on an edge, not a member.',
        `Move it to the relationship: \`${p.node} -> other {rel=${rel}}\`.`,
      );
  }

  const nodes = graph.nodes.map((draft): Classifier => {
    const node: Classifier = { ...toNode(draft), members: [] };
    if (draft.kind !== undefined && isKind(draft.kind)) node.kind = draft.kind;
    node.members = graph.props
      .filter((p) => p.node === draft.id)
      .map((p): Member => {
        const member: Member = { owner: p.node, name: p.key, op: p.attrs.get('op') === 'yes', line: p.line };
        if (p.value !== undefined) member.type = p.value;
        if (p.role) member.role = p.role;
        if (p.change) member.change = p.change;
        return member;
      });
    return node;
  });

  const edges = graph.links.flatMap(({ edge: e, from, to, attrs }): ClassLink[] => {
    if (from.key !== undefined || to.key !== undefined) {
      error(
        e.line,
        `\`${refText(from)} -> ${refText(to)}\` joins a member.`,
        'Join two types: `order -> user : places`. Members live inside the box; relationships go between boxes.',
      );
      return [];
    }
    const raw = attrs.get('rel');
    if (raw !== undefined && !isRel(raw)) {
      const near = closest(raw, CLASS_RELS);
      error(
        e.line,
        `\`rel=${raw}\` is not a relationship.`,
        `${near ? `Did you mean \`rel=${near}\`? ` : ''}Relationships: ${list(CLASS_RELS)}.`,
      );
    }
    const rel = isRel(raw) ? raw : undefined;
    if (rel === 'uses' && e.arrow === '<->') return [];
    const link: ClassLink = { ...e, arrow: rel === 'uses' || rel === 'implements' ? '-->' : e.arrow };
    if (rel) link.rel = rel;
    return [link];
  });

  const steps = resolvePartSteps(fence.steps, nodes, graph.edges, { props: graph.props, keyed: graph.links }, report);
  return { ...header(fence, 'class'), nodes, edges, groups: graph.groups, steps };
}

const refText = (e: Ref): string => (e.key === undefined ? e.node : `${e.node}.${e.key}`);

const MARGIN = 16;
const FONT = 14;
const MEMBER_FONT = 13;
const TYPE_FONT = 11.5;
const HEAD_H = 34;
const RENAME_H = 16;
const STEREO_H = 14;
const ROW_H = 26;
const PAD_X = 12;
const MIN_W = 150;
const GROUP_PAD = 16;
const GROUP_TITLE = 30;
const LABEL_FONT = 12.5;
const LABEL_LINE = 16;
const LEAD = 28;

interface Point {
  x: number;
  y: number;
}

interface End extends Point {
  ux: number;
  uy: number;
}

interface Card {
  node: Classifier;
  fields: Member[];
  methods: Member[];
  w: number;
  h: number;
  box: Box;
}

const titleH = (node: Classifier): number =>
  HEAD_H + (node.kind === 'interface' ? STEREO_H : 0) + (renameOf(node) === undefined ? 0 : RENAME_H);

const rowBox = (c: Card, k: number): Box => ({
  x: c.box.x + 3,
  y: c.box.y + titleH(c.node) + k * ROW_H + 3,
  w: c.box.w - 6,
  h: ROW_H,
});

const memberText = (m: Member): { name: string; type: string } => ({
  name: `${signedText(m.name, m.change)}${m.op ? '()' : ''}`,
  type: m.type ?? '',
});

function render(d: ClassDiagram, context: RenderContext): Rendered {
  const { domId } = context;
  const dir = (context.direction ?? d.direction ?? 'down') === 'right' ? 'LR' : 'TB';
  const cards: Card[] = d.nodes.map((node) => {
    const fields = node.members.filter((m) => !m.op);
    const methods = node.members.filter((m) => m.op);
    const members = [...fields, ...methods];
    const memberW = Math.max(
      0,
      ...members.map((m) => {
        const t = memberText(m);
        return textWidth(t.name, MEMBER_FONT, 'sans500') + 16 + textWidth(t.type, TYPE_FONT);
      }),
    );
    const stereo = node.kind === 'interface' ? textWidth('«interface»', TYPE_FONT) : 0;
    const w = Math.ceil(
      Math.max(
        MIN_W,
        ...[node.label, ...(renameOf(node) === undefined ? [] : [`− ${renameOf(node)}`, `+ ${node.label}`])].map(
          (t) => textWidth(t, FONT, 'sans600') + 2 * PAD_X,
        ),
        stereo + 2 * PAD_X,
        memberW + 2 * PAD_X,
      ),
    );
    const h = titleH(node) + members.length * ROW_H + (members.length ? 6 : 0);
    return { node, fields, methods, w, h, box: { x: 0, y: 0, w, h } };
  });
  const byId = new Map(cards.map((c) => [c.node.id, c]));

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
  const boxed = cards.map((card, i) => {
    const c = cnode(card.w, card.h, card.node.group ?? -1);
    c.seq = i;
    cnodes.push(c);
    return { card, c };
  });
  d.groups.forEach(
    (_, g) => (cnodes[g].seq = Math.min(Infinity, ...d.nodes.map((node, i) => (node.group === g ? i : Infinity)))),
  );
  const index = new Map(d.nodes.map((node, i) => [node.id, base + i]));
  const labelSize = (e: ClassLink): [number, number] => {
    if (!e.label) return [0, 0];
    const lines = wrap(e.label, LABEL_FONT, 150);
    return [Math.max(...lines.map((l) => textWidth(l, LABEL_FONT))) + 10, lines.length * LABEL_LINE + 4];
  };
  const inherit = (e: ClassLink) => e.rel === 'extends' || e.rel === 'implements';
  const routed = d.edges.flatMap((e) => {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    const srcId = inherit(e) ? e.to : e.from;
    const dstId = inherit(e) ? e.from : e.to;
    const src = index.get(srcId);
    const dst = index.get(dstId);
    return a && b && src !== undefined && dst !== undefined && e.from !== e.to ? [{ e, a, b, src, dst }] : [];
  });
  const cedges: CEdge[] = routed.map(({ e, src, dst }) => {
    const [labelW, labelH] = labelSize(e);
    return { src, dst, minlen: 1, labelW: labelW + 2 * LEAD, labelH, route: [], labelX: 0, labelY: 0 };
  });
  const layout = compoundLayout(cnodes, cedges, dir, {
    nodeSep: 40,
    edgeSep: 16,
    rankSep: 64,
    portSep: 20,
    headRoom: 0,
  });
  for (const { card, c } of boxed)
    card.box = { x: MARGIN + c.x - card.w / 2, y: MARGIN + c.y - card.h / 2, w: card.w, h: card.h };

  const sides = ({ a, b }: (typeof routed)[number]): [End, End] => {
    const aMid = a.box.x + a.box.w / 2;
    const bMid = b.box.x + b.box.w / 2;
    const apart = a.box.x + a.box.w + 2 * LEAD <= b.box.x || b.box.x + b.box.w + 2 * LEAD <= a.box.x;
    const down = b.box.y > a.box.y;
    if (!apart) {
      return [
        {
          x: a.box.x + a.box.w / 2,
          y: down ? a.box.y + a.box.h : a.box.y,
          ux: 0,
          uy: down ? 1 : -1,
        },
        {
          x: b.box.x + b.box.w / 2,
          y: down ? b.box.y : b.box.y + b.box.h,
          ux: 0,
          uy: down ? -1 : 1,
        },
      ];
    }
    const aRight = bMid > aMid;
    return [
      { x: aRight ? a.box.x + a.box.w : a.box.x, y: a.box.y + a.box.h / 2, ux: aRight ? 1 : -1, uy: 0 },
      { x: aRight ? b.box.x : b.box.x + b.box.w, y: b.box.y + b.box.h / 2, ux: aRight ? -1 : 1, uy: 0 },
    ];
  };

  let maxX = layout.width + MARGIN;
  const depths = groupDepths(d.groups);
  const groups: Item[] = d.groups.map((g, i) => {
    const c = cnodes[i];
    const x = MARGIN + c.x - c.w / 2;
    const y = MARGIN + c.y - c.h / 2;
    return {
      type: 'group',
      cls: groupClass(depths[i]),
      attrs: markAttrs(g),
      items: [
        { type: 'rect', x, y, w: c.w, h: c.h, r: 12 },
        { type: 'text', x: x + 14, y: y + 19, text: g.label },
      ],
    };
  });
  const edges: Item[] = [];
  const labels: Item[] = [];
  const anchors = new Map<number, Anchor>();
  for (const r of routed) {
    const [p, q] = sides(r);
    const reach = Math.max(LEAD + 16, (p.ux ? Math.abs(q.x - p.x) : Math.abs(q.y - p.y)) / 2);
    const c1 = { x: p.x + p.ux * reach, y: p.y + p.uy * reach };
    const c2 = { x: q.x + q.ux * reach, y: q.y + q.uy * reach };
    maxX = Math.max(maxX, c1.x, c2.x);
    edges.push(relation(r.e, p, q, c1, c2));
    const mx = 0.125 * p.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * q.x;
    const my = 0.125 * p.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * q.y;
    if (r.e.label) {
      labels.push(labelItem(r.e, mx, my, onGroup(mx, my)));
      anchors.set(r.e.index, { x: mx - labelSize(r.e)[0] / 2 - 4, y: my, w: labelSize(r.e)[0] + 8 });
    } else anchors.set(r.e.index, { x: mx, y: my });
  }

  function onGroup(x: number, y: number): number {
    return depthWhere(depths, (i) => {
      const c = cnodes[i];
      return Math.abs(MARGIN + c.x - x) < c.w / 2 && Math.abs(MARGIN + c.y - y) < c.h / 2;
    });
  }

  const width = Math.ceil(maxX + MARGIN);
  const height = Math.ceil(layout.height + 2 * MARGIN);
  const boxes = new Map<string, Box>();
  for (const c of cards) {
    boxes.set(c.node.id, { x: c.box.x, y: c.box.y, w: c.box.w, h: titleH(c.node) });
    [...c.fields, ...c.methods].forEach((m, k) => boxes.set(`${c.node.id}.${m.name}`, rowBox(c, k)));
  }
  const members = d.nodes.flatMap((node) => node.members.map((m) => ({ node: node.id, key: m.name })));
  const scene: Scene = {
    id: domId,
    cls: 'pr-class',
    width,
    height,
    hatch: true,
    items: [
      ...groups,
      ...edges,
      ...cards.flatMap((c) => classItems(c, domId)),
      ...labels,
      ...markerItems(
        d,
        boxes,
        anchors,
        refMarkers(context, [...nodeTargets(d.nodes), ...propTargets(members), ...edgeTargets(d.edges)]),
      ),
    ],
  };
  return { svg: trusted(paintSvg(scene)), width, height, scene };
}

function relation(e: ClassLink, p: End, q: End, c1: Point, c2: Point): Item {
  const gen = e.rel === 'extends' || e.rel === 'implements';
  const dash = e.arrow === '-->' || e.rel === 'implements' || e.rel === 'uses';
  const tip = gen ? shift(q, 14) : q;
  const start = e.rel === 'contains' ? shift(p, 16) : p;
  const heads: Item[] = gen
    ? [triangle(q)]
    : e.rel === 'contains'
      ? [diamond(p), { type: 'path', cls: 'pr-head', d: arrowhead(q.x, q.y, -q.ux, -q.uy) }]
      : [
          { type: 'path', cls: 'pr-head', d: arrowhead(q.x, q.y, -q.ux, -q.uy) },
          ...(e.arrow === '<->'
            ? [{ type: 'path' as const, cls: 'pr-head', d: arrowhead(p.x, p.y, -p.ux, -p.uy) }]
            : []),
        ];
  return {
    type: 'group',
    cls: `pr-edge${dash ? ' pr-dashed' : ''}`,
    attrs: [['data-edge', String(e.index)], ['data-from', e.from], ['data-to', e.to], ...markAttrs(e)],
    items: [
      {
        type: 'path',
        cls: 'pr-line',
        d: `M${n(start.x)},${n(start.y)}C${n(c1.x)},${n(c1.y)} ${n(c2.x)},${n(c2.y)} ${n(tip.x)},${n(tip.y)}`,
      },
      ...heads,
    ],
  };
}

const shift = (e: End, d: number): Point => ({ x: e.x + e.ux * d, y: e.y + e.uy * d });

function triangle(e: End): Item {
  const base = shift(e, 14);
  const l: Point = { x: base.x - e.uy * 8, y: base.y + e.ux * 8 };
  const r: Point = { x: base.x + e.uy * 8, y: base.y - e.ux * 8 };
  return {
    type: 'path',
    cls: 'pr-gen',
    d: `M${n(e.x)},${n(e.y)}L${n(l.x)},${n(l.y)}L${n(r.x)},${n(r.y)}Z`,
  };
}

function diamond(e: End): Item {
  const far = shift(e, 16);
  const mid = shift(e, 8);
  const l: Point = { x: mid.x - e.uy * 6, y: mid.y + e.ux * 6 };
  const r: Point = { x: mid.x + e.uy * 6, y: mid.y - e.ux * 6 };
  return {
    type: 'path',
    cls: 'pr-diamond',
    d: `M${n(e.x)},${n(e.y)}L${n(l.x)},${n(l.y)}L${n(far.x)},${n(far.y)}L${n(r.x)},${n(r.y)}Z`,
  };
}

function classItems(c: Card, domId: string): Item[] {
  const { node } = c;
  const b = c.box;
  const hh = titleH(node);
  const stereo = node.kind === 'interface';
  const members = [...c.fields, ...c.methods];
  const head: Item = members.length
    ? {
        type: 'path',
        cls: 'pr-class-head',
        d: `M${n(b.x + 0.6)},${n(b.y + hh)}V${n(b.y + 8)}Q${n(b.x + 0.6)},${n(b.y + 0.6)} ${n(b.x + 8)},${n(b.y + 0.6)}H${n(b.x + b.w - 8)}Q${n(b.x + b.w - 0.6)},${n(b.y + 0.6)} ${n(b.x + b.w - 0.6)},${n(b.y + 8)}V${n(b.y + hh)}Z`,
      }
    : { type: 'rect', cls: 'pr-class-head', x: b.x + 0.6, y: b.y + 0.6, w: b.w - 1.2, h: b.h - 1.2, r: 7.5 };
  const split = c.fields.length && c.methods.length ? hh + c.fields.length * ROW_H : 0;
  const rules: Item[] = members.length
    ? [
        { type: 'path', cls: 'pr-class-rule', d: `M${n(b.x)},${n(b.y + hh)}H${n(b.x + b.w)}` },
        ...(split
          ? [{ type: 'path' as const, cls: 'pr-class-rule', d: `M${n(b.x)},${n(b.y + split)}H${n(b.x + b.w)}` }]
          : []),
      ]
    : [];
  const nameY = b.y + (stereo ? STEREO_H + (hh - STEREO_H) / 2 : hh / 2);
  const name: Item[] = [
    ...(stereo ? [linesItem(['«interface»'], b.x + b.w / 2, b.y + 12, 14, 'pr-stereo')] : []),
    ...(renameOf(node) === undefined
      ? [linesItem([node.label], b.x + b.w / 2, nameY, 18, 'pr-label pr-class-name')]
      : renamedItems(renameOf(node) ?? '', node.label, b.x + b.w / 2, nameY, 18, 'pr-label pr-class-name')),
  ];
  const kind = node.kind ?? 'class';
  const entity: Item = {
    type: 'group',
    cls: `pr-node pr-classifier${kind === 'abstract' ? ' pr-abstract' : kind === 'interface' ? ' pr-interface' : ''}`,
    attrs: [['data-node', node.id], ['data-kind', kind], ['id', `${domId}-node-${node.id}`], ...markAttrs(node)],
    items: [{ type: 'rect', cls: 'pr-box', x: b.x, y: b.y, w: b.w, h: b.h, r: 8 }, head, ...rules, ...name],
  };
  return [entity, ...members.map((m, k) => memberItem(c, m, k, domId))];
}

function memberItem(c: Card, m: Member, k: number, domId: string): Item {
  const { node } = c;
  const b = c.box;
  const row = rowBox(c, k);
  const id = `${node.id}.${m.name}`;
  const cy = row.y + ROW_H / 2;
  const t = memberText(m);
  const replaced = m.change === 'removed' && node.members.some((o) => o.name === m.name && o.change === 'added');
  return {
    type: 'group',
    cls: `pr-node pr-member${m.op ? ' pr-op' : ''}`,
    attrs: [
      ['data-node', id],
      ['data-in', node.id],
      ...(replaced ? [] : [['id', `${domId}-node-${id}`] as const]),
      ...markAttrs(m),
    ],
    items: [
      { type: 'rect', cls: 'pr-box pr-member-box', x: row.x, y: row.y, w: row.w, h: row.h, r: 4 },
      {
        type: 'text',
        cls: m.change === 'removed' ? struck('pr-member-name') : 'pr-member-name',
        x: b.x + PAD_X,
        y: cy,
        text: t.name,
        dy: '0.35em',
      },
      { type: 'text', cls: 'pr-member-type', x: b.x + b.w - PAD_X, y: cy, text: t.type, dy: '0.35em' },
    ],
  };
}
