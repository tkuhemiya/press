import { describe, expect, it } from 'vitest';
import { build, parseDocument, type Diagram, type DiagramType, type Document } from '../src/index.ts';

const fence = (body: string, header = '') =>
  `# Doc\n\n\`\`\`causal-loop${header ? ' ' + header : ''}\n${body}\n\`\`\`\n`;
const is = <T extends DiagramType>(d: Diagram, type: T): d is Diagram<T> => d.type === type;
const first = <T extends DiagramType>(doc: Document, type: T): Diagram<T> => {
  const d = doc.figures[0]?.diagram;
  if (!d || !is(d, type)) throw new Error(`expected a ${type}`);
  return d;
};
const html = (body: string): string => {
  const out = build(fence(body), { embedFonts: false }).html;
  return out.slice(out.indexOf('<figure'), out.indexOf('</figure>') + 9);
};
const openTag = (out: string, text: string): string => {
  const at = out.indexOf(text);
  return out.slice(out.lastIndexOf('<g ', at), out.indexOf('>', at) + 1);
};
const wholeGroup = (out: string, text: string): string => {
  const at = out.indexOf(text);
  return out.slice(out.lastIndexOf('<g ', at), out.indexOf('</g>', at) + 4);
};

describe('diff marks in causal loops', () => {
  it('marks an added variable and a removed one, and leaves neither with a role', () => {
    const body = `customers: "Customers"
+ ads: "Paid ads"
- price: "Price"
+ ads -> customers : +
- price -> customers : -`;
    const doc = parseDocument(fence(body));
    expect(doc.diagnostics).toEqual([]);
    const d = first(doc, 'causal-loop');
    expect(d.nodes.map((n) => [n.id, n.change])).toEqual([
      ['customers', undefined],
      ['ads', 'added'],
      ['price', 'removed'],
    ]);
    const out = html(body);
    expect(openTag(out, 'data-node="ads"')).toContain('data-change="added"');
    expect(openTag(out, 'data-node="price"')).toContain('data-change="removed"');
    expect(openTag(out, 'data-node="ads"')).not.toContain('data-role');
    expect(openTag(out, 'data-node="customers"')).not.toContain('data-change');
  });

  it('marks an added link and a removed link, polarity sign included', () => {
    const body = `a -> b : +
+ b -> c : -
- a -> c : +`;
    const doc = parseDocument(fence(body));
    expect(doc.diagnostics).toEqual([]);
    const d = first(doc, 'causal-loop');
    expect(d.edges.map((e) => [e.from, e.to, e.change])).toEqual([
      ['a', 'b', undefined],
      ['b', 'c', 'added'],
      ['a', 'c', 'removed'],
    ]);
    const out = html(body);
    expect(openTag(out, 'data-from="b" data-to="c"')).toContain('data-change="added"');
    expect(openTag(out, 'data-from="a" data-to="c"')).toContain('data-change="removed"');
    expect(openTag(out, 'data-from="a" data-to="c"')).not.toContain('data-role');
    expect(out).toContain('data-edge="1" data-change="added"');
    expect(out).toContain('data-edge="2" data-change="removed"');
    expect(out).not.toContain('data-edge="0" data-change');
  });

  it('marks a changed variable amber and keeps what it was called', () => {
    const body = `- sat: "Market saturation"
+ sat: "Saturated market"
a -> sat : +`;
    const doc = parseDocument(fence(body));
    expect(doc.diagnostics).toEqual([]);
    const d = first(doc, 'causal-loop');
    const sat = d.nodes.find((n) => n.id === 'sat');
    expect(sat?.change).toBe('changed');
    expect(sat?.was).toBe('Market saturation');
    expect(sat?.note).toBeUndefined();
    expect(html(body)).toContain('>was &quot;Market</tspan>');
    expect(openTag(html(body), 'data-node="sat"')).toContain('data-change="changed"');
  });

  it('marks an added loop green and a removed loop red, keeping its name', () => {
    const body = `customers -> referrals : +
referrals -> customers : +
+ customers -> ads : +
+ ads -> customers : +
- price -> customers : -
- customers -> price : +
loop wom "Word of mouth": customers -> referrals -> customers
+ loop "Ads reinvest": customers -> ads -> customers
- loop "Price": customers -> price -> customers`;
    const doc = parseDocument(fence(body));
    expect(doc.diagnostics).toEqual([]);
    const d = first(doc, 'causal-loop');
    expect(d.loops.map((l) => [l.name, l.change])).toEqual([
      ['Word of mouth', undefined],
      ['Ads reinvest', 'added'],
      ['Price', 'removed'],
    ]);
    const out = html(body);
    const added = wholeGroup(out, 'data-loop="R2"');
    expect(openTag(out, 'data-loop="R2"')).toContain('data-change="added"');
    expect(added).toContain('>+ Ads reinvest<');
    const removed = wholeGroup(out, 'data-loop="B1"');
    expect(openTag(out, 'data-loop="B1"')).toContain('data-change="removed"');
    expect(removed).toContain('class="pr-loop-arc"');
    expect(removed).toContain('>B1<');
    expect(removed).toContain('>− Price<');
    expect(openTag(out, 'data-loop="R1"')).not.toContain('data-change');
  });

  it('reads a loop through the side it is on when a link has been flipped', () => {
    const body = `- a -> b : +
+ a -> b : -
b -> a : +
loop "Kept": a -> b -> a
- loop "Old": a -> b -> a
+ loop "New": a -> b -> a`;
    const doc = parseDocument(fence(body));
    expect(doc.diagnostics).toEqual([]);
    const d = first(doc, 'causal-loop');
    expect(d.loops.map((l) => [l.name, l.change, l.reinforcing])).toEqual([
      ['Kept', undefined, false],
      ['Old', 'removed', true],
      ['New', 'added', false],
    ]);
  });

  it('builds and draws a kept loop that runs through a removed link', () => {
    const body = `a -> b : +
- b -> a : +
loop "Cycle": a -> b -> a`;
    const doc = parseDocument(fence(body));
    expect(doc.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warning',
        message:
          'Loop "Cycle" is not marked, but one of its links is removed, so the loop does not exist after the change.',
      }),
    ]);
    const d = first(doc, 'causal-loop');
    expect(d.loops.map((l) => [l.name, l.change, l.reinforcing])).toEqual([['Cycle', undefined, true]]);
    const out = html(body);
    expect(out).toContain('data-loop="R1"');
    expect(out).toContain('data-change="removed"');
  });

  it('draws an unchanged diagram with no diff marks and no key', () => {
    const body = `a -> b : +
b -> a : +
loop "Loop": a -> b -> a`;
    const doc = parseDocument(fence(body));
    expect(doc.diagnostics).toEqual([]);
    const d = first(doc, 'causal-loop');
    expect(d.nodes.every((n) => n.change === undefined)).toBe(true);
    expect(d.edges.every((e) => e.change === undefined)).toBe(true);
    expect(d.loops.every((l) => l.change === undefined)).toBe(true);
    const out = html(body);
    expect(out).not.toContain('data-change');
    expect(out).not.toContain('pr-key');
    expect(out).toContain('data-loop="R1"');
  });
});
