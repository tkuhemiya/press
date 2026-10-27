import type { Diagram, DiagramEdge, Property } from '../model.ts';
import { cnode, compoundLayout, type CEdge, type CNode } from '../layout/pele/compound.ts';
import { labelSvg, markers, type Box } from './graph.ts';
import { textWidth, wrap } from '../text/measure.ts';
import { esc, n, roleAttr, textBlock, type Rendered } from '../render/svg.ts';

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

interface Entity {
  id: string;
  label: string;
  fields: Property[];
  w: number;
  h: number;
  box: Box;
}

export function renderEr(d: Diagram, refMarkers: Map<string, string>, domId: string): Rendered {
  const dir = (d.direction ?? 'right') === 'right' ? 'LR' : 'TB';
  const entities: Entity[] = d.nodes.map((node) => {
    const own = d.props.filter((p) => p.node === node.id);
    const fields = [...own.filter((p) => p.attrs.key === 'yes'), ...own.filter((p) => p.attrs.key !== 'yes')];
    const fieldW = Math.max(
      0,
      ...fields.map((f) => KEY_W + textWidth(f.key, FIELD_FONT, 'sans500') + GAP + textWidth(typeText(f), TYPE_FONT)),
    );
    const w = Math.ceil(Math.max(MIN_W, textWidth(node.label, FONT, 'sans600') + 2 * PAD_X, fieldW + 2 * PAD_X));
    const h = HEAD_H + fields.length * ROW_H + (fields.length ? 6 : 0);
    return { id: node.id, label: node.label, fields, w, h, box: { x: 0, y: 0, w, h } };
  });
  const byId = new Map(entities.map((e) => [e.id, e]));

  const cnodes: CNode[] = d.groups.map((g) => {
    const c = cnode(0, 0);
    c.isGroup = true;
    c.padX = GROUP_PAD;
    c.padTop = GROUP_TITLE;
    c.padBottom = GROUP_PAD;
    c.parent = g.parent;
    return c;
  });
  const base = cnodes.length;
  entities.forEach((e, i) => {
    const c = cnode(e.w, e.h, d.nodes[i].group);
    c.seq = i;
    cnodes.push(c);
  });
  d.groups.forEach(
    (_, g) => (cnodes[g].seq = Math.min(Infinity, ...d.nodes.map((node, i) => (node.group === g ? i : Infinity)))),
  );
  const index = (id: string) => base + entities.findIndex((e) => e.id === id);
  const labelSize = (e: DiagramEdge): [number, number] => {
    if (!e.label) return [0, 0];
    const lines = wrap(e.label, LABEL_FONT, 150);
    return [Math.max(...lines.map((l) => textWidth(l, LABEL_FONT))) + 10, lines.length * LABEL_LINE + 4];
  };
  const routed = d.edges.filter((e) => e.from !== e.to);
  const cedges: CEdge[] = routed.map((e) => {
    const [labelW, labelH] = labelSize(e);
    return {
      src: index(e.from),
      dst: index(e.to),
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
  entities.forEach((e, i) => {
    const c = cnodes[base + i];
    e.box = { x: MARGIN + c.x - e.w / 2, y: MARGIN + c.y - e.h / 2, w: e.w, h: e.h };
  });

  const rowY = (e: Entity, key?: string): number => {
    const i = key ? e.fields.findIndex((f) => f.key === key) : -1;
    return i < 0 ? e.box.y + HEAD_H / 2 : e.box.y + HEAD_H + i * ROW_H + ROW_H / 2;
  };
  type End = { x: number; y: number; ux: number; uy: number };
  const sides = (e: DiagramEdge): [End, End] => {
    const a = byId.get(e.from)!;
    const b = byId.get(e.to)!;
    const aMid = a.box.x + a.box.w / 2;
    const bMid = b.box.x + b.box.w / 2;
    const apart = a.box.x + a.box.w + 2 * LEAD <= b.box.x || b.box.x + b.box.w + 2 * LEAD <= a.box.x;
    if (!apart && !e.fromKey) {
      const down = b.box.y > a.box.y;
      return [
        { x: aMid, y: down ? a.box.y + a.box.h : a.box.y, ux: 0, uy: down ? 1 : -1 },
        { x: bMid, y: down ? b.box.y : b.box.y + b.box.h, ux: 0, uy: down ? -1 : 1 },
      ];
    }
    const aRight = apart ? bMid > aMid : true;
    const bRight = apart ? aMid > bMid : true;
    return [
      { x: aRight ? a.box.x + a.box.w : a.box.x, y: rowY(a, e.fromKey), ux: aRight ? 1 : -1, uy: 0 },
      { x: bRight ? b.box.x + b.box.w : b.box.x, y: rowY(b, e.toKey), ux: bRight ? 1 : -1, uy: 0 },
    ];
  };
  const placed = new Map<DiagramEdge, [End, End]>(routed.map((e) => [e, sides(e)]));
  const spots = new Map<string, End[]>();
  for (const pair of placed.values())
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
  for (const e of routed) {
    const [p, q] = placed.get(e)!;
    const reach = Math.max(LEAD + 20, (p.ux ? Math.abs(q.x - p.x) : Math.abs(q.y - p.y)) / 2);
    const c1 = { x: p.x + p.ux * reach, y: p.y + p.uy * reach };
    const c2 = { x: q.x + q.ux * reach, y: q.y + q.uy * reach };
    maxX = Math.max(maxX, c1.x, c2.x);
    const [from, to] = (e.attrs.card ?? 'N:1').split(':');
    let s = `<g class="pr-edge${e.arrow === '-->' ? ' pr-dashed' : ''}" data-edge="${e.index}" data-from="${esc(e.from)}" data-to="${esc(e.to)}"${roleAttr(e.role)}>`;
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
  entities.forEach((e, i) => {
    const node = d.nodes[i];
    const b = e.box;
    boxes.set(e.id, { x: b.x, y: b.y, w: b.w, h: HEAD_H });
    let s = `<g class="pr-node pr-entity" data-node="${esc(e.id)}" id="${domId}-node-${esc(e.id)}"${roleAttr(node.role)}>`;
    s += `<rect class="pr-box" x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="8"/>`;
    if (!e.fields.length)
      s += `<rect class="pr-entity-head" x="${n(b.x + 0.6)}" y="${n(b.y + 0.6)}" width="${n(b.w - 1.2)}" height="${n(b.h - 1.2)}" rx="7.5"/>`;
    else
      s += `<path class="pr-entity-head" d="M${n(b.x + 0.6)},${n(b.y + HEAD_H)}V${n(b.y + 8)}Q${n(b.x + 0.6)},${n(b.y + 0.6)} ${n(b.x + 8)},${n(b.y + 0.6)}H${n(b.x + b.w - 8)}Q${n(b.x + b.w - 0.6)},${n(b.y + 0.6)} ${n(b.x + b.w - 0.6)},${n(b.y + 8)}V${n(b.y + HEAD_H)}Z"/>`;
    if (e.fields.length) s += `<path class="pr-entity-rule" d="M${n(b.x)},${n(b.y + HEAD_H)}H${n(b.x + b.w)}"/>`;
    s += textBlock([e.label], b.x + b.w / 2, b.y + HEAD_H / 2, 18, 'pr-label pr-entity-name');
    out.push(s + '</g>');
    e.fields.forEach((f, k) => {
      const id = `${e.id}.${f.key}`;
      const ry = b.y + HEAD_H + k * ROW_H + 3;
      const row = { x: b.x + 3, y: ry, w: b.w - 6, h: ROW_H };
      boxes.set(id, row);
      const cy = ry + ROW_H / 2;
      const key = f.attrs.key === 'yes';
      let r = `<g class="pr-node pr-field${key ? ' pr-key' : ''}" data-node="${esc(id)}" data-in="${esc(e.id)}" id="${domId}-node-${esc(id)}"${roleAttr(f.role)}>`;
      r += `<rect class="pr-box pr-field-box" x="${n(row.x)}" y="${n(row.y)}" width="${n(row.w)}" height="${n(row.h)}" rx="4"/>`;
      if (key) r += keyGlyph(b.x + PAD_X + 5, cy);
      r += `<text class="pr-field-name" x="${n(b.x + PAD_X + KEY_W)}" y="${n(cy)}" dy="0.35em">${esc(f.key)}</text>`;
      r += `<text class="pr-field-type" x="${n(b.x + b.w - PAD_X)}" y="${n(cy)}" dy="0.35em">${esc(typeText(f))}</text>`;
      out.push(r + '</g>');
    });
  });
  out.push(...labels);
  out.push(...markers(d, boxes, anchors, refMarkers));
  out.push('</svg>');
  return { svg: out.join(''), width, height };
}

function typeText(f: Property): string {
  return [f.value ?? '', f.attrs.unique === 'yes' ? 'unique' : '', f.attrs.null === 'yes' ? 'null' : '']
    .filter(Boolean)
    .join(' · ');
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
