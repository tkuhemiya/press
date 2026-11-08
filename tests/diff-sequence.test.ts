import { describe, expect, it } from 'vitest';
import { build, parseDocument, type Diagram, type DiagramType, type Document, type Sequence } from '../src/index.ts';

const fence = (body: string) => `# Doc\n\n\`\`\`sequence id=diff\n${body}\n\`\`\`\n`;
const is = <T extends DiagramType>(d: Diagram, type: T): d is Diagram<T> => d.type === type;
const first = (doc: Document): Sequence => {
  const d = doc.figures[0]?.diagram;
  if (!d || !is(d, 'sequence')) throw new Error('expected a sequence');
  return d;
};
const model = (body: string): Sequence => first(parseDocument(fence(body)));
const pageOf = (body: string): string => build(fence(body), { embedFonts: false }).html;
const svgOf = (body: string): string => pageOf(body).match(/<svg[\s\S]*?<\/svg>/)?.[0] ?? '';
const paneOf = (body: string, side: 'before' | 'after'): string => {
  const html = pageOf(body);
  const at = html.indexOf(`data-side="${side}"`);
  return at < 0 ? '' : html.slice(at, html.indexOf('</svg>', at) + 6);
};
const tagOf = (svg: string, ...parts: string[]): string =>
  svg.match(new RegExp(`<g [^>]*${parts.join('[^>]*')}[^>]*>`))?.[0] ?? '';

const DIFF = `a: service "A"
b: service "B"
a -> b : kept
+ a -> b : new
- a -> b : old
+ a -> c : reached
- a -> d : gone
phase "Retry" {
  + b --> a : retry
  + a -> b : resend
}
phase "Mixed" {
  + a -> b : x
  b --> a : kept
}
phase "Old" {
  - a -> b : y
}
group "Cloud" {
  + c: service "C"
}
group "Legacy" {
  - d: service "D"
}`;

describe('sequence model', () => {
  it('marks an added message and leaves the kept one unmarked', () => {
    const d = model(`a -> b : kept\n+ a -> b : new`);
    expect(d.edges.map((e) => e.change)).toEqual([undefined, 'added']);
  });

  it('marks a removed message', () => {
    const d = model(`a -> b : kept\n- a -> b : old`);
    expect(d.edges.map((e) => e.change)).toEqual([undefined, 'removed']);
  });

  it('marks participants that appear on one side only', () => {
    const d = model(DIFF);
    expect(d.nodes.map((n) => [n.id, n.change])).toEqual([
      ['a', undefined],
      ['b', undefined],
      ['c', 'added'],
      ['d', 'removed'],
    ]);
  });

  it('gives a phase the change of its messages, or none when they differ', () => {
    const d = model(DIFF);
    expect(d.phases.map((p) => [p.label, p.change])).toEqual([
      ['Retry', 'added'],
      ['Mixed', undefined],
      ['Old', 'removed'],
    ]);
  });

  it('gives a group the change of its members', () => {
    const d = model(DIFF);
    expect(d.groups.map((g) => [g.label, g.change])).toEqual([
      ['Cloud', 'added'],
      ['Legacy', 'removed'],
    ]);
  });
});

describe('sequence drawing', () => {
  it('keeps hover hooks and puts added and removed messages on opposite panels', () => {
    const before = paneOf(DIFF, 'before');
    const after = paneOf(DIFF, 'after');
    expect(tagOf(after, 'class="pr-edge[ "]', 'data-edge="1"')).toContain('data-from="a" data-to="b"');
    expect(after).toContain('data-edge="1"');
    expect(before).not.toContain('data-edge="1"');
    expect(before).toContain('data-edge="2"');
    expect(after).not.toContain('data-edge="2"');
    expect(tagOf(before, 'class="pr-edge[ "]', 'data-edge="0"')).toContain('data-from="a" data-to="b"');
    expect(before).not.toContain('data-change');
    expect(after).not.toContain('data-change');
  });

  it('puts added participants, groups and phases on after, removed on before', () => {
    const src = `${DIFF}\nphase confirm "Confirm" {\n+ b --> a : ok {role=happy}\n}`;
    const before = paneOf(src, 'before');
    const after = paneOf(src, 'after');
    expect(after).toContain('data-node="c"');
    expect(before).not.toContain('data-node="c"');
    expect(before).toContain('data-node="d"');
    expect(after).not.toContain('data-node="d"');
    expect(after).toContain('data-node="confirm"');
    expect(before).not.toContain('data-node="confirm"');
  });

  it('shows a renamed participant as the old name before and the new name after', () => {
    const src = `user: user "Shopper"
- api: service "Orders API"
+ api: service "Checkout API"
+ user -> api : check {role=error}`;
    const before = paneOf(src, 'before');
    const after = paneOf(src, 'after');
    expect(before).toContain('Orders API');
    expect(before).not.toContain('Checkout API');
    expect(after).toContain('Checkout API');
    expect(after).not.toContain('Orders API');
    expect(tagOf(after, 'class="pr-edge[ "]', 'data-edge="0"')).toContain('data-role="error"');
  });

  it('draws an unchanged diagram with no data-change, and keeps roles', () => {
    const svg = svgOf(`a -> b : ok {role=happy}\nphase "Round" {\n  b --> a : done\n}`);
    expect(svg).not.toContain('data-change');
    expect(tagOf(svg, 'class="pr-edge"', 'data-edge="0"')).toContain('data-role="happy"');
  });
});
