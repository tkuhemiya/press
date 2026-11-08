import { describe, expect, it } from 'vitest';
import { build } from '../src/index.ts';

const page = (type: string, body: string) =>
  build(`# Doc\n\n\`\`\`${type}\n${body}\n\`\`\`\n`, { embedFonts: false }).html;

const svgs = (html: string): string[] => [...html.matchAll(/<svg[\s\S]*?<\/svg>/g)].map((m) => m[0]);

const pane = (html: string, side: 'before' | 'after'): string => {
  const at = html.indexOf(`data-side="${side}"`);
  return html.slice(at, html.indexOf('</div></div>', at));
};

describe('aligned split diffs on screen', () => {
  it('lays out a causal loop once so price and ads keep different seats', () => {
    const html = page(
      'causal-loop',
      `customers: "Customers"
referrals: "Referrals"
- price: "Price"
+ ads: "Paid ads"
customers -> referrals : +
referrals -> customers : +
- price -> customers : -
- customers -> price : +
+ ads -> customers : +
+ customers -> ads : +`,
    );
    expect(html).toContain('data-side="before"');
    expect(html).toContain('data-side="after"');
    const before = pane(html, 'before');
    const after = pane(html, 'after');
    expect(before).toContain('data-node="price"');
    expect(before).not.toContain('data-node="ads"');
    expect(after).toContain('data-node="ads"');
    expect(after).not.toContain('data-node="price"');
    expect(before).not.toContain('data-change');
    expect(after).not.toContain('data-change');
    const [beforeSvg, afterSvg] = svgs(html);
    const xOf = (svg: string, id: string) => {
      const g = svg.indexOf(`data-node="${id}"`);
      return /x="([\d.]+)"/.exec(svg.slice(g, g + 600))?.[1];
    };
    expect(xOf(beforeSvg, 'customers')).toBe(xOf(afterSvg, 'customers'));
    expect(xOf(beforeSvg, 'price')).not.toBe(xOf(afterSvg, 'ads'));
  });

  it('shows a renamed participant as the old name on the left and the new name on the right', () => {
    const html = page(
      'sequence',
      `user: user "Shopper"
- api: service "Orders API"
+ api: service "Checkout API"
user -> api : place`,
    );
    expect(pane(html, 'before')).toContain('Orders API');
    expect(pane(html, 'before')).not.toContain('Checkout API');
    expect(pane(html, 'after')).toContain('Checkout API');
    expect(pane(html, 'after')).not.toContain('Orders API');
    expect(html).not.toContain('was &quot;Orders API&quot;');
  });

  it('keeps an in-place schema diff as one overlay', () => {
    const html = page(
      'er',
      `orders: "Order"
- orders.sku : text
+ orders.price : int`,
    );
    expect(html).not.toContain('data-side="before"');
    expect(html).toContain('data-change="removed"');
    expect(html).toContain('data-change="added"');
  });

  it('does not split a diagram with no + or - lines', () => {
    const html = page('state-machine', `draft -> submitted\nsubmitted -> paid`);
    const figure = html.slice(html.indexOf('<figure'), html.indexOf('</figure>'));
    expect(figure).not.toContain('data-side="before"');
    expect(figure).not.toContain('data-change');
  });
});
