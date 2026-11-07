import { describe, expect, it } from 'vitest';
import { build, parseDocument, type Er } from '../src/index.ts';

const fence = (body: string) => `# Doc\n\n\`\`\`er id=orders\n${body}\n\`\`\`\n`;

function figure(body: string): { model: Er; html: string; messages: string[] } {
  const source = fence(body);
  const model = parseDocument(source).figures[0]?.diagram;
  if (model?.type !== 'er') throw new Error('expected an er figure');
  const { html, diagnostics } = build(source, { embedFonts: false });
  return { model, html, messages: diagnostics.map((d) => `${d.severity}: ${d.message}`) };
}

const svg = (html: string): string => html.match(/<svg[\s\S]*?<\/svg>/)?.[0] ?? '';
const tag = (html: string, pattern: RegExp): string => svg(html).match(pattern)?.[0] ?? '';
const entityTag = (html: string, id: string) =>
  tag(html, new RegExp(`<g class="pr-node pr-entity"[^>]*data-node="${id}"[^>]*>`));
const fieldTag = (html: string, id: string) =>
  tag(html, new RegExp(`<g class="pr-node pr-field[^"]*"[^>]*data-node="${id}"[^>]*>`));
const edgeTag = (html: string, index: number) =>
  tag(html, new RegExp(`<g class="pr-edge[^"]*"[^>]*data-edge="${index}"[^>]*>`));

const KEPT = `users.id : uuid {key=yes}
users.email : text
orders.id : uuid {key=yes}
items.order_id : uuid
items.qty : int`;

describe('diff er', () => {
  it('draws an added entity and its fields as added, with no role', () => {
    const { model, html, messages } = figure(`${KEPT}
+ vouchers: "Voucher"
+ vouchers.id : uuid {key=yes}
+ orders.voucher_id : uuid {null=yes}
+ orders.voucher_id -> vouchers.id : used {card=N:0..1}`);
    expect(messages).toEqual([]);
    expect(model.nodes.find((n) => n.id === 'vouchers')).toMatchObject({ change: 'added', label: 'Voucher' });
    expect(model.nodes.find((n) => n.id === 'users')?.change).toBeUndefined();
    expect(entityTag(html, 'vouchers')).toMatch(/data-change="added"/);
    expect(entityTag(html, 'vouchers')).not.toMatch(/data-role/);
    expect(fieldTag(html, 'vouchers.id')).toMatch(/data-change="added"/);
    expect(entityTag(html, 'users')).not.toMatch(/data-change/);
  });

  it('draws a removed entity, its removed fields and its group as removed', () => {
    const { model, html, messages } = figure(`${KEPT}
group "Legacy" {
  - coupons: "Coupon"
}
- coupons.id : uuid {key=yes}`);
    expect(messages).toEqual([]);
    expect(model.nodes.find((n) => n.id === 'coupons')?.change).toBe('removed');
    expect(model.groups.map((g) => g.change)).toEqual(['removed']);
    expect(entityTag(html, 'coupons')).toMatch(/data-change="removed"/);
    expect(fieldTag(html, 'coupons.id')).toMatch(/data-change="removed"/);
    expect([...html.matchAll(/<g class="pr-group[^"]*"([^>]*)>/g)].map((m) => m[1])).toEqual([
      ' data-change="removed"',
    ]);
  });

  it('marks added and removed fields', () => {
    const { model, html, messages } = figure(`${KEPT}
+ items.price : "numeric(10,2)"
- items.sku : text`);
    expect(messages).toEqual([]);
    const fields = model.nodes.find((n) => n.id === 'items')?.fields ?? [];
    expect(fields.map((f) => [f.name, f.change])).toEqual([
      ['order_id', undefined],
      ['qty', undefined],
      ['price', 'added'],
      ['sku', 'removed'],
    ]);
    expect(fieldTag(html, 'items.price')).toMatch(/data-change="added"/);
    expect(fieldTag(html, 'items.sku')).toMatch(/data-change="removed"/);
    expect(fieldTag(html, 'items.qty')).not.toMatch(/data-change/);
  });

  it('shows a changed field with its new type and the old one as a was note', () => {
    const { model, html, messages } = figure(`${KEPT}
- orders.placed_at : timestamp
+ orders.placed_at : timestamptz`);
    expect(messages).toEqual([]);
    expect(model.nodes.find((n) => n.id === 'orders')?.fields.find((f) => f.name === 'placed_at')).toMatchObject({
      change: 'changed',
      type: 'timestamptz',
      was: 'timestamp',
    });
    expect(fieldTag(html, 'orders.placed_at')).toMatch(/data-change="changed"/);
    expect(html).toContain('timestamptz · was &quot;timestamp&quot;');
  });

  it('marks a field changed by an attribute alone without a was note', () => {
    const { model, html, messages } = figure(`${KEPT}
orders.user_id : uuid
- orders.coupon_id : uuid
+ orders.coupon_id : uuid {null=yes}`);
    expect(messages).toEqual([]);
    expect(model.nodes.find((n) => n.id === 'orders')?.fields.find((f) => f.name === 'coupon_id')).toMatchObject({
      change: 'changed',
      was: 'uuid',
      nullable: true,
    });
    expect(fieldTag(html, 'orders.coupon_id')).toMatch(/data-change="changed"/);
    expect(html).toContain('uuid · null');
    expect(html).not.toContain('was &quot;uuid');
  });

  it('draws an added and a removed reference as edges with data-change', () => {
    const { model, html, messages } = figure(`${KEPT}
orders.user_id : uuid
- orders.user_id -> users.id : placed by {card=N:1}
+ orders.user_id -> users.id : placed by {card=N:1, role=focus}
- items.order_id -> orders.id : belongs to {card=1..N:1}
+ items.order_id -> orders.id : belongs to {card=N:1}`);
    expect(messages).toEqual([]);
    expect(model.edges.map((e) => [e.label, e.change])).toEqual([
      ['placed by', 'removed'],
      ['placed by', 'added'],
      ['belongs to', 'removed'],
      ['belongs to', 'added'],
    ]);
    expect(edgeTag(html, 0)).toMatch(/data-change="removed"/);
    expect(edgeTag(html, 1)).toMatch(/data-change="added"/);
    expect(edgeTag(html, 1)).not.toMatch(/data-role/);
  });

  it('shows a changed entity name with its old name as a was note', () => {
    const { model, html, messages } = figure(`${KEPT}
- items: "Line item"
+ items: "Order line"
items.sku : text`);
    expect(messages).toEqual([]);
    expect(model.nodes.find((n) => n.id === 'items')).toMatchObject({
      change: 'changed',
      label: 'Order line',
      was: 'Line item',
    });
    expect(entityTag(html, 'items')).toMatch(/data-change="changed"/);
    expect(html).toContain('was &quot;Line item&quot;');
  });

  it('leaves an unchanged diagram without any change marks, keeping its roles', () => {
    const { model, html, messages } = figure(`${KEPT}
orders.user_id : uuid
orders.user_id -> users.id : placed by {card=N:1, role=focus}`);
    expect(messages).toEqual([]);
    expect(model.edges.every((e) => e.change === undefined)).toBe(true);
    expect(svg(html)).not.toContain('data-change');
    expect(edgeTag(html, 0)).toMatch(/data-role="focus"/);
  });
});
