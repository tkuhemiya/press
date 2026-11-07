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
const svgOf = (body: string): string =>
  build(fence(body), { embedFonts: false }).html.match(/<svg[\s\S]*?<\/svg>/)?.[0] ?? '';
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
  it('marks messages with data-change and keeps the hover hooks', () => {
    const svg = svgOf(DIFF);
    const added = tagOf(svg, 'class="pr-edge[ "]', 'data-edge="1"');
    expect(added).toContain('data-from="a" data-to="b"');
    expect(added).toContain('data-change="added"');
    expect(tagOf(svg, 'class="pr-edge[ "]', 'data-edge="2"')).toContain('data-change="removed"');
    expect(tagOf(svg, 'class="pr-edge[ "]', 'data-edge="0"')).not.toContain('data-change');
  });

  it('marks participants, group boxes and phase frames', () => {
    const svg = svgOf(`${DIFF}\nphase confirm "Confirm" {\n+ b --> a : ok {role=happy}\n}`);
    expect(tagOf(svg, 'pr-participant"', 'data-node="c"')).toContain('data-change="added"');
    expect(tagOf(svg, 'pr-participant"', 'data-node="d"')).toContain('data-change="removed"');
    expect(svg.match(/<g class="pr-group"[^>]*>/g)).toEqual([
      '<g class="pr-group" data-change="added">',
      '<g class="pr-group" data-change="removed">',
    ]);
    expect(tagOf(svg, 'class="pr-phase"', 'data-node="confirm"')).toContain('data-change="added"');
  });

  it('draws a changed participant with its old label, and a diff mark in place of a role', () => {
    const svg = svgOf(`user: user "Shopper"
- api: service "Orders API"
+ api: service "Checkout API"
+ user -> api : check {role=error}`);
    const node = tagOf(svg, 'pr-participant"', 'data-node="api"');
    expect(node).toContain('data-change="changed"');
    expect(node).not.toContain('data-role');
    expect(svg).toContain('was &quot;Orders API&quot;');
    const message = tagOf(svg, 'class="pr-edge[ "]', 'data-edge="0"');
    expect(message).toContain('data-change="added"');
    expect(message).not.toContain('data-role');
  });

  it('draws an unchanged diagram with no data-change, and keeps roles', () => {
    const svg = svgOf(`a -> b : ok {role=happy}\nphase "Round" {\n  b --> a : done\n}`);
    expect(svg).not.toContain('data-change');
    expect(tagOf(svg, 'class="pr-edge"', 'data-edge="0"')).toContain('data-role="happy"');
  });
});
