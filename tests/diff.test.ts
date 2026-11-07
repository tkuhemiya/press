import { describe, expect, it } from 'vitest';
import { parseDocument, type Diagram, type DiagramType, type Document } from '../src/index.ts';

const fence = (type: string, body: string, header = '') =>
  `# Doc\n\n\`\`\`${type}${header ? ' ' + header : ''}\n${body}\n\`\`\`\n`;
const parse = (type: string, body: string, header = '') => parseDocument(fence(type, body, header));
const is = <T extends DiagramType>(d: Diagram, type: T): d is Diagram<T> => d.type === type;
const first = <T extends DiagramType>(doc: Document, type: T): Diagram<T> => {
  const d = doc.figures[0]?.diagram;
  if (!d || !is(d, type)) throw new Error(`expected a ${type}`);
  return d;
};
const messages = (doc: Document) => doc.diagnostics.map((d) => `${d.severity}: ${d.message}`);

describe('diff marks', () => {
  it('marks added and removed edges and keeps unmarked ones', () => {
    const doc = parse(
      'state-machine',
      `draft -> submitted : submit
- submitted -> failed : declined
+ submitted -> failed : declined {role=error}`,
    );
    expect(messages(doc)).toEqual([]);
    const d = first(doc, 'state-machine');
    expect(d.edges.map((e) => [e.from, e.to, e.change])).toEqual([
      ['draft', 'submitted', undefined],
      ['submitted', 'failed', 'removed'],
      ['submitted', 'failed', 'added'],
    ]);
    expect(d.edges[2].role).toBe('error');
  });

  it('gives a node the status of the sides that mention it', () => {
    const doc = parse(
      'state-machine',
      `start -> draft
draft -> submitted
- submitted -> failed : declined
+ submitted -> review : needs review
+ review -> paid : approved
- review2 -> failed : rejected`,
    );
    const d = first(doc, 'state-machine');
    const change = Object.fromEntries(d.nodes.map((n) => [n.id, n.change ?? 'kept']));
    expect(change).toEqual({
      start: 'kept',
      draft: 'kept',
      submitted: 'kept',
      failed: 'removed',
      review: 'added',
      paid: 'added',
      review2: 'removed',
    });
  });

  it('pairs a - declaration and a + declaration of one id as a changed node', () => {
    const doc = parse(
      'state-machine',
      `start -> paid
- paid: "Paid"
+ paid: "Paid in full"`,
    );
    expect(messages(doc)).toEqual([]);
    const d = first(doc, 'state-machine');
    const paid = d.nodes.find((n) => n.id === 'paid');
    expect(paid).toMatchObject({ label: 'Paid in full', change: 'changed', was: 'Paid' });
    expect(paid?.note).toBeUndefined();
  });

  it('pairs the lines in either order', () => {
    const doc = parse(
      'state-machine',
      `start -> paid
+ paid: "Paid in full"
- paid: "Paid"`,
    );
    expect(messages(doc)).toEqual([]);
    expect(first(doc, 'state-machine').nodes.find((n) => n.id === 'paid')).toMatchObject({
      label: 'Paid in full',
      change: 'changed',
      was: 'Paid',
    });
  });

  it('warns about a kept declaration that is declared twice, as before', () => {
    const doc = parse(
      'state-machine',
      `paid: "Paid"
+ paid: "Paid in full"
start -> paid`,
    );
    expect(messages(doc)).toEqual(['warning: `paid` is declared twice; the later declaration wins.']);
  });

  it('keeps a removed edge and its endpoints when the rest of the graph is kept', () => {
    const doc = parse(
      'architecture',
      `api -> db : SQL
- api -> cache : read`,
    );
    const d = first(doc, 'architecture');
    expect(d.nodes.map((n) => [n.id, n.change])).toEqual([
      ['api', undefined],
      ['db', undefined],
      ['cache', 'removed'],
    ]);
  });

  it('pairs cells in tradeoffs and records the old value', () => {
    const doc = parse(
      'tradeoffs',
      `redis: "Redis"
redis.ops : "another service" {role=error}
- redis.latency : "<1 ms"
+ redis.latency : "<2 ms"`,
    );
    expect(messages(doc)).toEqual([]);
    const d = first(doc, 'tradeoffs');
    expect(d.cells).toHaveLength(2);
    expect(d.cells.find((c) => c.criterion === 'latency')).toMatchObject({
      value: '<2 ms',
      change: 'changed',
      was: '<1 ms',
    });
  });

  it('marks a removed criterion when only removed cells use it', () => {
    const doc = parse(
      'tradeoffs',
      `redis: "Redis"
redis.ops : "another service"
- redis.revoke : yes`,
    );
    const d = first(doc, 'tradeoffs');
    expect(d.criteria.find((c) => c.id === 'revoke')?.change).toBe('removed');
    expect(d.criteria.find((c) => c.id === 'ops')?.change).toBeUndefined();
  });

  it('leaves a group with kept members unmarked', () => {
    const doc = parse(
      'state-machine',
      `start -> a
group "Fulfilment" {
  b
  c
}
a -> b
+ b -> c
- c -> a`,
    );
    expect(first(doc, 'state-machine').groups[0].change).toBeUndefined();
  });

  it('gives a group whose members are all added or all removed that status', () => {
    const doc = parse(
      'state-machine',
      `start -> a
a -> end
group "New" {
  + b
  + c
}
group "Old" {
  - d
}
+ b -> c
- a -> d`,
    );
    expect(messages(doc)).toEqual([]);
    const d = first(doc, 'state-machine');
    expect(d.groups.map((g) => [g.label, g.change])).toEqual([
      ['New', 'added'],
      ['Old', 'removed'],
    ]);
  });

  it('marks loops in causal diagrams', () => {
    const doc = parse(
      'causal-loop',
      `a -> b : +
b -> a : +
+ c -> a : -
+ a -> c : +
loop "Old": a -> b -> a
+ loop "New": a -> c -> a`,
    );
    expect(messages(doc)).toEqual([]);
    const d = first(doc, 'causal-loop');
    expect(d.loops.map((l) => [l.name, l.change])).toEqual([
      ['Old', undefined],
      ['New', 'added'],
    ]);
  });

  it('rejects a mark on a group, phase, closing brace or step', () => {
    const doc = parse(
      'sequence',
      `client -> api : GET
- group "Edge" {
  api
}
- phase "Retry" {
  api -> client : 503
}
steps:
  - client -> api "caption"`,
    );
    const errors = doc.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message);
    expect(errors).toEqual(
      expect.arrayContaining([
        '`-` cannot mark `group`: a group, phase or lane takes its status from what it holds.',
        '`-` cannot mark `phase`: a group, phase or lane takes its status from what it holds.',
        '`-` cannot mark a step: a step shows a statement, which carries its own status.',
      ]),
    );
  });

  it('leaves signed timeline durations alone', () => {
    const doc = parse(
      'timeline',
      `+150ms wait: "Waits"
+ +180ms fire: "Becomes candidate"`,
    );
    expect(messages(doc)).toEqual([]);
    const d = first(doc, 'timeline');
    expect(d.nodes.map((n) => [n.id, n.change])).toEqual([
      ['wait', undefined],
      ['fire', 'added'],
    ]);
  });
});
