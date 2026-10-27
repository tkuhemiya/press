import { describe, expect, it } from 'vitest';
import { parseDocument, renderHtml, type Diagram, type DiagramType, type Document } from '../src/index.ts';

const fence = (type: string, body: string, header = '') =>
  `# Doc\n\n\`\`\`${type}${header ? ' ' + header : ''}\n${body}\n\`\`\`\n`;
const parse = (type: string, body: string, header = '') => parseDocument(fence(type, body, header));
const is = <T extends DiagramType>(d: Diagram, type: T): d is Diagram<T> => d.type === type;
const first = <T extends DiagramType>(doc: Document, type: T): Diagram<T> => {
  const d = doc.figures[0]?.diagram;
  if (!d || !is(d, type)) throw new Error(`expected a ${type}`);
  return d;
};
const errors = (doc: ReturnType<typeof parseDocument>) => doc.diagnostics.filter((d) => d.severity === 'error');

describe('shared grammar', () => {
  it('parses the spec state machine', () => {
    const doc = parse(
      'state-machine',
      `start -> draft
draft -> submitted : submit
submitted -> paid : payment ok {role=happy}
submitted -> failed : declined {role=error}
failed -> submitted : retry
paid -> shipped : ship
shipped -> end`,
      'id=order title="Order lifecycle"',
    );
    expect(doc.diagnostics).toEqual([]);
    const d = first(doc, 'state-machine');
    expect(d.id).toBe('order');
    expect(d.title).toBe('Order lifecycle');
    expect(d.nodes.map((n) => n.id)).toEqual(['start', 'draft', 'submitted', 'paid', 'failed', 'shipped', 'end']);
    expect(d.edges[2]).toMatchObject({
      from: 'submitted',
      to: 'paid',
      label: 'payment ok',
      role: 'happy',
      arrow: '->',
    });
  });

  it('reads arrows, declarations, bare nodes and comments', () => {
    const doc = parse(
      'sequence',
      `# who talks
client: user "Browser"
api {role=focus}
client -> api : GET /   # first call
api --> client : 200 OK
a <-> b`,
    );
    expect(doc.diagnostics).toEqual([]);
    const d = first(doc, 'sequence');
    expect(d.nodes[0]).toMatchObject({ id: 'client', kind: 'user', label: 'Browser' });
    expect(d.nodes[1]).toMatchObject({ id: 'api', role: 'focus' });
    expect(d.edges.map((e) => e.arrow)).toEqual(['->', '-->', '<->']);
    expect(d.edges[0].label).toBe('GET /');
  });

  it('keeps hyphens inside ids apart from arrows', () => {
    const d = first(parse('state-machine', 'a-b-->c-d'), 'state-machine');
    expect(d.edges[0]).toMatchObject({ from: 'a-b', to: 'c-d', arrow: '-->' });
  });

  it('expands chains and applies attributes to every segment', () => {
    const d = first(parse('state-machine', 'start -> draft -> paid --> end {role=happy}'), 'state-machine');
    expect(d.edges.map((e) => [e.from, e.to, e.arrow, e.role])).toEqual([
      ['start', 'draft', '->', 'happy'],
      ['draft', 'paid', '->', 'happy'],
      ['paid', 'end', '-->', 'happy'],
    ]);
  });

  it('rejects a label on a chain and says how to fix it', () => {
    const doc = parse('state-machine', 'a -> b -> c : go');
    expect(errors(doc)[0]).toMatchObject({ line: 4, message: expect.stringContaining('chain') });
    expect(errors(doc)[0].hint).toContain('b -> c : go');
  });

  it('nests groups', () => {
    const d = first(
      parse(
        'state-machine',
        'group "Active" {\n  playing -> paused\n  group "Inner" {\n    x\n  }\n}\nidle -> playing',
      ),
      'state-machine',
    );
    expect(d.groups).toEqual([
      { label: 'Active', line: 4 },
      { label: 'Inner', parent: 0, line: 6 },
    ]);
    expect(d.nodes.find((n) => n.id === 'x')?.group).toBe(1);
    expect(d.nodes.find((n) => n.id === 'idle')?.group).toBeUndefined();
  });
});

describe('architecture', () => {
  it('reads kinds, and moves a declared node into the group that lists it', () => {
    const doc = parse(
      'architecture',
      `web: client "Storefront"
api: service "Orders API"
group "VPC" {
  api
  db: database "Postgres"
}
web -> api : HTTPS
api --> db`,
    );
    expect(doc.diagnostics).toEqual([]);
    const d = first(doc, 'architecture');
    expect(d.nodes.map((n) => [n.id, n.kind, n.group])).toEqual([
      ['web', 'client', undefined],
      ['api', 'service', 0],
      ['db', 'database', 0],
    ]);
  });

  it('warns when a node is listed in two groups', () => {
    const doc = parse('architecture', 'group "A" {\n  x\n}\ngroup "B" {\n  x\n}');
    expect(doc.diagnostics).toMatchObject([
      { severity: 'warning', line: 4, message: expect.stringContaining('Group "A" has no members') },
      { severity: 'warning', line: 8, message: expect.stringContaining('already in group "A"') },
    ]);
    expect(first(doc, 'architecture').nodes[0].group).toBe(1);
  });

  it('suggests a known kind', () => {
    const doc = parse('architecture', 'db: databse "Postgres"');
    expect(doc.diagnostics[0]).toMatchObject({ severity: 'warning', hint: expect.stringContaining('`database`') });
  });
});

describe('diagnostics name the line and suggest a fix', () => {
  const cases: [string, string, string, RegExp, RegExp][] = [
    ['uppercase id', 'state-machine', 'Draft -> paid', /uppercase/, /draft: "Draft"/],
    ['unknown arrow', 'state-machine', 'a => b', /Unknown arrow/, /->/],
    ['unknown role', 'state-machine', 'a -> b {role=danger}', /Unknown role/, /role=error/],
    ['typo in role', 'state-machine', 'a -> b {role=hapy}', /Unknown role/, /role=happy/],
    ['colon in attribute', 'state-machine', 'a -> b {role: error}', /not `:`/, /role=error/],
    ['attribute without value', 'state-machine', 'a {focus}', /no value/, /role=focus/],
    ['unclosed group', 'state-machine', 'group "G" {\n  a -> b', /never closed/, /`}`/],
    ['stray brace', 'state-machine', '}', /no group is open/, /group "Name"/],
    ['declaring start', 'state-machine', 'start: "Begin"', /reserved/, /edges only/],
    ['steps as id', 'state-machine', 'steps -> b', /reserved/, /steps:/],
    ['edge into start', 'state-machine', 'a -> start', /into `start`/, /entry/],
    ['bad direction', 'state-machine', 'a -> b', /Unknown direction/, /right/],
    ['quoted id', 'state-machine', '"Paid" -> b', /quoted label/, /paid: "Paid in full"/],
    ['missing caption', 'state-machine', 'a -> b\nsteps:\n  a -> b', /quoted caption/, /draft -> submitted/],
  ];
  for (const [name, type, body, message, hint] of cases) {
    it(name, () => {
      const doc = parse(type, body, name === 'bad direction' ? 'direction=sideways' : '');
      const e = errors(doc)[0];
      expect(e, JSON.stringify(doc.diagnostics)).toBeDefined();
      expect(e.message).toMatch(message);
      expect(e.hint).toMatch(hint);
      expect(e.line).toBeGreaterThanOrEqual(3);
    });
  }

  it('reports the exact source line', () => {
    const doc = parseDocument('# T\n\nSome prose.\n\n```state-machine\na -> b\nb -> C\n```\n');
    expect(errors(doc)[0].line).toBe(7);
  });

  it('warns on unknown kinds and styling attributes, naming the known ones', () => {
    const doc = parse('sequence', 'db: databse "DB"\na -> db {color=red}');
    const warnings = doc.diagnostics.filter((d) => d.severity === 'warning');
    expect(warnings[0].hint).toContain('`database`');
    expect(warnings[1].hint).toMatch(/meaning, not styling/);
  });

  it('warns that direction means nothing in a sequence', () => {
    const doc = parse('sequence', 'a -> b', 'direction=right');
    expect(doc.diagnostics[0]).toMatchObject({ severity: 'warning', message: expect.stringContaining('no meaning') });
  });

  it('suggests a diagram type for a near miss', () => {
    const doc = parseDocument('```state-machin\na -> b\n```\n');
    expect(doc.diagnostics[0].hint).toContain('state-machine');
    expect(doc.figures).toHaveLength(0);
  });
});

describe('steps', () => {
  it('resolves node and edge steps', () => {
    const d = parse(
      'state-machine',
      'start -> draft\ndraft -> paid : pay\nsteps:\n  draft "Starts here"\n  draft -> paid "Pays"',
    ).figures[0].diagram;
    expect(d.steps).toEqual([
      { target: { type: 'node', id: 'draft' }, caption: 'Starts here', line: 7 },
      { target: { type: 'edge', index: 1 }, caption: 'Pays', line: 8 },
    ]);
  });

  it('treats -> and --> as the same in a step', () => {
    const d = parse('sequence', 'db --> api : ok\nsteps:\n  db -> api "Replies"').figures[0].diagram;
    expect(d.steps[0].target).toEqual({ type: 'edge', index: 0 });
  });

  it('matches <-> edges in either direction', () => {
    const d = parse('sequence', 'a <-> b : sync\nsteps:\n  b -> a "Syncs"').figures[0].diagram;
    expect(d.steps[0].target).toEqual({ type: 'edge', index: 0 });
  });

  it('disambiguates repeated messages by label', () => {
    const doc = parse(
      'sequence',
      'api -> db : insert\napi -> db : update\nsteps:\n  api -> db : update "Second write"',
    );
    expect(doc.diagnostics).toEqual([]);
    expect(doc.figures[0].diagram.steps[0].target).toEqual({ type: 'edge', index: 1 });
  });

  it('lists the candidates when a step is ambiguous', () => {
    const doc = parse('sequence', 'api -> db : insert\napi -> db : update\nsteps:\n  api -> db "Which?"');
    expect(errors(doc)[0].message).toMatch(/ambiguous/);
    expect(errors(doc)[0].hint).toContain('api -> db : insert');
    expect(errors(doc)[0].hint).toContain('api -> db : update');
  });

  it('suggests the closest node for a typo', () => {
    const doc = parse('state-machine', 'draft -> submitted\nsteps:\n  submited "x"');
    expect(errors(doc)[0].hint).toBe('Did you mean `submitted`?');
  });

  it('names the edges that do exist when a step edge is missing', () => {
    const doc = parse('state-machine', 'a -> b\na -> c\nb -> c\nsteps:\n  a -> d "x"\n  c -> a "y"');
    expect(errors(doc)[0].message).toMatch(/`d`/);
    expect(errors(doc)[1].message).toMatch(/does not have/);
  });

  it('rejects content lines after steps', () => {
    const doc = parse('state-machine', 'a -> b\nsteps:\n  a "x"\nb -> c');
    expect(errors(doc)[0]).toMatchObject({ line: 7, message: expect.stringContaining('caption') });
  });
});

describe('prose references', () => {
  const src = `# T

\`\`\`state-machine id=order
draft -> failed
\`\`\`

See [failed](#order.failed) and [draft](#order.draft), then [failed again](#order.failed).
Broken: [x](#ordr.failed) and
[y](#order.faild).
`;

  it('assigns one letter per node, in reading order', () => {
    const doc = parseDocument(src);
    expect(doc.refs.map((r) => [r.target, r.marker])).toEqual([
      [{ type: 'node', id: 'failed' }, 'a'],
      [{ type: 'node', id: 'draft' }, 'b'],
      [{ type: 'node', id: 'failed' }, 'a'],
    ]);
  });

  it('reports unknown diagrams and nodes on their own lines', () => {
    const errs = errors(parseDocument(src));
    expect(errs).toHaveLength(2);
    expect(errs[0]).toMatchObject({ line: 8, hint: 'Did you mean `#order.failed`?' });
    expect(errs[1]).toMatchObject({ line: 9, hint: 'Did you mean `#order.failed`?' });
  });

  it('flags duplicate diagram ids', () => {
    const doc = parseDocument('```state-machine id=a\nx -> y\n```\n\n```sequence id=a\nx -> y\n```\n');
    expect(errors(doc)[0].message).toMatch(/already used on line 1/);
  });
});

describe('timeline', () => {
  const warnings = (doc: ReturnType<typeof parseDocument>) => doc.diagnostics.filter((d) => d.severity === 'warning');
  const dated = (doc: ReturnType<typeof parseDocument>) => {
    const d = first(doc, 'timeline');
    if (d.dating === 'undated') throw new Error('expected a dated timeline');
    return d;
  };

  it('reads events with every form of time, spans and groups', () => {
    const doc = parse(
      'timeline',
      [
        '2019 founded: "Founded"',
        '2019-03 seed: "Seed round" {until=2019-09}',
        '2019-10-01 launch: "Launch" {role=happy}',
        '2019-10-02T09:30 outage: "First outage"',
        'group "Year one" {',
        '  seed',
        '  launch',
        '}',
        'seed -> launch : funded',
      ].join('\n'),
    );
    expect(doc.diagnostics).toEqual([]);
    const d = dated(doc);
    expect(d.dating).toBe('calendar');
    expect(d.nodes.map((n) => n.at.form)).toEqual(['year', 'month', 'day', 'datetime']);
    expect(d.nodes[1].lastsMs).toBe(Date.UTC(2019, 8) - Date.UTC(2019, 2));
    expect(d.nodes[1].group).toBe(0);
    expect(d.edges).toHaveLength(1);
  });

  it('reads clock times and an event without a label', () => {
    const doc = parse('timeline', '9:05 a\n14:02:30 b: "Later"');
    expect(doc.diagnostics).toEqual([]);
    expect(dated(doc).dating).toBe('clock');
    expect(dated(doc).nodes.map((n) => [n.id, n.label, n.at.value])).toEqual([
      ['a', 'a', 32_700_000],
      ['b', 'Later', 50_550_000],
    ]);
  });

  it('spaces an undated timeline in source order', () => {
    const doc = parse('timeline', 'a: "One"\nb: "Two"\na -> b');
    expect(doc.diagnostics).toEqual([]);
    expect(first(doc, 'timeline')).toMatchObject({ type: 'timeline', dating: 'undated' });
  });

  const cases: [string, string, RegExp, RegExp][] = [
    ['impossible date', '2019-02-30 a: "A"', /no day 30/, /2019-03-14/],
    ['impossible time', '25:00 a: "A"', /not a time of day/, /14:02/],
    ['edge on an event line', '14:02 a -> b', /one event/, /a -> other/],
    ['mixed dated and undated', '14:02 a: "A"\nb: "B"', /has no time/, /14:02 b: "B"/],
    ['clock mixed with dates', '2019-03-14 a: "A"\n14:02 b: "B"', /clock time/, /one kind/],
    ['until in another form', '2019 a: "A" {until=2020-01}', /same form/, /until=2019/],
    ['span ending before it starts', '14:30 a: "A" {until=14:00}', /ends .* before it starts/, /until/],
    ['until without dates', 'a: "A" {until=14:00}', /needs a dated timeline/, /\{until=2021\}/],
    ['a date as an id', '2019 -> b', /cannot be an id/, /2019 launch: "Label"/],
  ];
  for (const [name, body, message, hint] of cases) {
    it(name, () => {
      const e = errors(parse('timeline', body))[0];
      expect(e, name).toBeDefined();
      expect(e.message).toMatch(message);
      expect(e.hint).toMatch(hint);
    });
  }

  it('warns when an event is out of order', () => {
    const w = warnings(parse('timeline', '14:05 a: "A"\n14:01 b: "B"'));
    expect(w[0].message).toMatch(/earlier than `a`/);
    expect(w[0].line).toBe(5);
  });

  it('knows until only in a timeline', () => {
    const w = warnings(parse('state-machine', 'a -> b {until=14:00}'));
    expect(w[0].message).toMatch(/Unknown attribute `until`/);
  });
});

describe('causal-loop', () => {
  const growth = [
    'customers -> referrals : +',
    'referrals -> customers : +',
    'customers -> saturation : +',
    'saturation -> referrals : -',
    'price -> customers : - {delay=yes}',
    'loop "Word of mouth": customers -> referrals -> customers',
    'loop "Saturation": customers -> saturation -> referrals -> customers',
  ].join('\n');

  it('reads polarities, delays and loops, and works out each loop type', () => {
    const doc = parse('causal-loop', growth);
    expect(doc.diagnostics).toEqual([]);
    const d = first(doc, 'causal-loop');
    expect(d.edges.map((e) => e.polarity)).toEqual(['+', '+', '+', '-', '-']);
    expect(d.edges.map((e) => e.delay)).toEqual([false, false, false, false, true]);
    expect(d.loops.map((l) => [l.label, l.name, l.edges.map((i) => d.edges[i].from)])).toEqual([
      ['R1', 'Word of mouth', ['customers', 'referrals']],
      ['B1', 'Saturation', ['customers', 'saturation', 'referrals']],
    ]);
  });

  it('numbers loops per type', () => {
    const doc = parse(
      'causal-loop',
      'a -> b : +\nb -> a : +\nb -> c : -\nc -> b : +\nloop "One": a -> b -> a\nloop "Two": b -> c -> b\nloop "Three": b -> a -> b',
    );
    expect(first(doc, 'causal-loop').loops.map((l) => l.label)).toEqual(['R1', 'B1', 'R2']);
  });

  const cases: [string, string, RegExp, RegExp][] = [
    ['missing polarity', 'a -> b', /needs a polarity/, /a -> b : \+/],
    ['a word for polarity', 'a -> b : positive', /not a polarity/, /a -> b : \+/],
    ['a sentence as label', 'a -> b : drives up', /not a polarity/, /prose/],
    ['two-way arrow', 'a <-> b : +', /`<->` is not allowed/, /b -> a/],
    ['self link', 'a -> a : +', /cannot influence itself/, /outflow/],
    [
      'loop that does not close',
      'a -> b : +\nb -> c : +\nloop "Open": a -> b -> c',
      /does not close/,
      /a -> b -> c -> a/,
    ],
    [
      'loop over a missing edge',
      'a -> b : +\nb -> c : +\nloop "L": a -> b -> a',
      /not an edge/,
      /Edges from `b`: `b -> c`/,
    ],
    [
      'loop with an unknown node',
      'a -> b : +\nb -> a : +\nloop "L": a -> bb -> a',
      /not in the diagram/,
      /Did you mean `b`/,
    ],
    ['loop without a name', 'a -> b : +\nb -> a : +\nloop: a -> b -> a', /quoted name/, /loop "Word of mouth"/],
    ['loop as an id', 'loop -> b : +', /quoted name|reserved/, /loop "/],
    ['delay with another value', 'a -> b : + {delay=long}', /not understood/, /delay=yes/],
  ];
  for (const [name, body, message, hint] of cases) {
    it(name, () => {
      const e = errors(parse('causal-loop', body))[0];
      expect(e, name).toBeDefined();
      expect(e.message).toMatch(message);
      expect(e.hint).toMatch(hint);
    });
  }

  it('warns that direction means nothing in a causal loop', () => {
    const doc = parse('causal-loop', 'a -> b : +', 'direction=down');
    expect(doc.diagnostics[0]).toMatchObject({ severity: 'warning', message: expect.stringContaining('no meaning') });
  });
});

describe('properties', () => {
  it('reads node.key : value with attributes, in types that have them', () => {
    const doc = parse(
      'tradeoffs',
      'redis.ops : "another service" {role=error}\nredis.revoke : yes\nredis.latency {role=happy}',
    );
    expect(doc.diagnostics).toEqual([]);
    expect(first(doc, 'tradeoffs').cells.map((c) => [c.option, c.criterion, c.value, c.role])).toEqual([
      ['redis', 'ops', 'another service', 'error'],
      ['redis', 'revoke', 'yes', undefined],
      ['redis', 'latency', undefined, 'happy'],
    ]);
  });

  it('rejects a property in a type without them, naming the types that have them', () => {
    const e = errors(parse('state-machine', 'a.b : c'))[0];
    expect(e.message).toMatch(/is a property/);
    expect(e.hint).toMatch(/`er`.*`tradeoffs`|`tradeoffs`.*`er`/);
  });

  it('warns when a property is given twice', () => {
    const doc = parse('er', 'a.id : uuid\na.id : int');
    expect(doc.diagnostics[0]).toMatchObject({ severity: 'warning', message: expect.stringMatching(/given twice/) });
    expect(first(doc, 'er').nodes[0].fields).toHaveLength(1);
  });

  it('steps and prose references can name a property', () => {
    const doc = parseDocument(
      '```tradeoffs id=t\nredis.ops : x\n\nsteps:\n  redis.ops "Costs"\n```\n\nSee [ops](#t.redis.ops).\n',
    );
    expect(doc.diagnostics).toEqual([]);
    expect(first(doc, 'tradeoffs').steps[0].target).toEqual({ type: 'prop', node: 'redis', key: 'ops' });
    expect(doc.refs[0].target).toEqual({ type: 'prop', node: 'redis', key: 'ops' });
  });

  it('only er edges join fields', () => {
    const e = errors(parse('state-machine', 'a.x -> b'))[0];
    expect(e.message).toMatch(/only er edges join fields/);
  });
});

describe('decision-tree', () => {
  it('parses the spec example cleanly', () => {
    const doc = parse(
      'decision-tree',
      'reads -> stale : yes\nreads -> skip : no\nstale -> cache : yes\nstale --> skip : no',
    );
    expect(doc.diagnostics).toEqual([]);
  });

  const cases: [string, string, RegExp, RegExp][] = [
    ['unlabelled branch', 'a -> b : yes\na -> c', /does not say which/, /a -> c : yes/],
    ['two roots', 'a -> b\nc -> d', /has one root.*2/, /a -> c/],
    ['a path that loops back', 'a -> b\nb -> c\nc -> a', /loops back: a -> b -> c -> a/, /state-machine/],
    ['two-way arrow', 'a <-> b', /`<->` is not allowed/, /a -> b : yes/],
  ];
  for (const [name, body, message, hint] of cases) {
    it(name, () => {
      const e = errors(parse('decision-tree', body))[0];
      expect(e, name).toBeDefined();
      expect(e.message).toMatch(message);
      expect(e.hint).toMatch(hint);
    });
  }

  it('lets branches rejoin', () => {
    expect(parse('decision-tree', 'a -> b : yes\na -> c : no\nb -> d\nc -> d').diagnostics).toEqual([]);
  });
});

describe('tradeoffs', () => {
  const warnings = (doc: ReturnType<typeof parseDocument>) => doc.diagnostics.filter((d) => d.severity === 'warning');

  it('reads options, criteria and cells', () => {
    const doc = parse('tradeoffs', 'a: "A" {role=focus}\na.x : 1\na.y : 2 {role=happy}\nb.x : 3\nb.y : 4');
    expect(doc.diagnostics).toEqual([]);
    const d = first(doc, 'tradeoffs');
    expect(d.options.map((n) => n.id)).toEqual(['a', 'b']);
    expect(d.criteria.map((n) => n.id)).toEqual(['x', 'y']);
  });

  it('rejects edges, suggesting a cell', () => {
    const e = errors(parse('tradeoffs', 'a -> b'))[0];
    expect(e.message).toMatch(/has no edges/);
    expect(e.hint).toMatch(/a\.b : value/);
  });

  it('rejects an id used as both option and criterion', () => {
    expect(errors(parse('tradeoffs', 'a.b : 1\nb.c : 2'))[0].message).toMatch(/both as an option/);
  });

  it('warns about missing cells, naming them', () => {
    const w = warnings(parse('tradeoffs', 'a.x : 1\na.y : 2\nb.x : 3'));
    expect(w[0].message).toMatch(/`b` has no value for `y`/);
    expect(w[0].hint).toMatch(/b\.y : value/);
  });

  it('warns about unused declarations and options inside groups', () => {
    const w = warnings(parse('tradeoffs', 'z: "Unused"\ngroup "G" {\n  a: "A"\n}\na.x : 1'));
    expect(w.map((x) => x.message).join(' ')).toMatch(/`z` is declared but no cell uses it.*`a` is an option/);
  });
});

describe('er', () => {
  const schema = 'users.id : uuid {key=yes}\norders.id : uuid {key=yes}\norders.user_id : uuid {null=yes}';

  it('reads fields and references between them', () => {
    const doc = parse('er', `${schema}\norders.user_id -> users.id : placed by {card=N:0..1}`);
    expect(doc.diagnostics).toEqual([]);
    const [e] = first(doc, 'er').edges;
    expect(e).toMatchObject({
      level: 'field',
      from: { entity: 'orders', field: 'user_id' },
      to: { entity: 'users', field: 'id' },
      label: 'placed by',
      cardinality: ['N', '0..1'],
    });
  });

  it('reads entity-level edges, and steps over field edges', () => {
    const doc = parse(
      'er',
      `${schema}\nusers -> teams : member of {card=N:N}\norders.user_id -> users.id {card=N:1}\n\nsteps:\n  orders.user_id -> users.id "Placed by"`,
    );
    expect(doc.diagnostics).toEqual([]);
    expect(doc.figures[0].diagram.steps[0].target).toEqual({ type: 'edge', index: 1 });
  });

  const cases: [string, string, RegExp, RegExp][] = [
    ['missing card', 'orders.user_id -> users.id', /needs a cardinality/, /card=N:1/],
    ['card in words', 'orders.user_id -> users.id {card=many-to-one}', /not a cardinality/, /card=N:1/],
    [
      'an undeclared field',
      'orders.user_id -> users.uuid {card=N:1}',
      /`users\.uuid` is not a field/,
      /users\.uuid : uuid/,
    ],
    ['field to entity', 'orders.user_id -> users {card=N:1}', /joins a field to a whole entity/, /orders -> users/],
    ['two-way arrow', 'orders <-> users {card=N:1}', /`<->` is not allowed/, /card=N:1/],
    ['key=true', 'users.name : text {key=true}', /`key=true` is not understood/, /key=yes/],
    ['card on a field', 'users.name : text {card=1:1}', /belongs on an edge/, /card=1:1/],
  ];
  for (const [name, body, message, hint] of cases) {
    it(name, () => {
      const e = errors(parse('er', `${schema}\n${body}`))[0];
      expect(e, name).toBeDefined();
      expect(e.message).toMatch(message);
      expect(e.hint).toMatch(hint);
    });
  }
});

describe('fixes from the authoring eval', () => {
  it('reads an undeclared id as words, except an er table name', () => {
    expect(first(parse('causal-loop', 'wage_demands -> prices : +'), 'causal-loop').nodes[0].label).toBe(
      'wage demands',
    );
    expect(first(parse('er', 'channel_members.id : uuid {key=yes}'), 'er').nodes[0].label).toBe('channel_members');
  });

  it('puts the criterion of a cell written inside a group into that category', () => {
    const doc = parse('tradeoffs', 'group "Cost" {\n  a.ops : cheap\n  b.ops : dear\n}');
    expect(doc.diagnostics).toEqual([]);
    expect(first(doc, 'tradeoffs').criteria.find((n) => n.id === 'ops')?.group).toBe(0);
  });

  it('warns about a group with no members', () => {
    const w = parse('architecture', 'a -> b\ngroup "Empty" {\n}').diagnostics[0];
    expect(w).toMatchObject({ severity: 'warning', message: expect.stringMatching(/no members/) });
  });

  it('explains a number with no unit on a timeline', () => {
    const e = errors(parse('timeline', '0ms crash: "Leader crashes"\n180 fire: "B fires"'))[0];
    expect(e.message).toMatch(/`180` has no unit/);
    expect(e.hint).toMatch(/`180ms`/);
  });
});

describe('sequence phases', () => {
  const body = `phase conn "Connection" {
  phase tcp "TCP" {
    a -> b : SYN
    b --> a : SYN-ACK
  }
  a -> b : hello
}
a -> b : GET
steps:
  tcp "Handshake"
  a -> b : GET "Request"`;

  it('brackets the messages written inside, nesting included', () => {
    const doc = parse('sequence', body, 'id=s');
    expect(doc.diagnostics).toEqual([]);
    const d = first(doc, 'sequence');
    expect(d.phases).toEqual([
      { id: 'conn', label: 'Connection', edges: [0, 1, 2], line: 4 },
      { id: 'tcp', label: 'TCP', parent: 0, edges: [0, 1], line: 5 },
    ]);
    expect(d.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(d.steps.map((s) => s.target)).toEqual([
      { type: 'edges', id: 'tcp' },
      { type: 'edge', index: 3 },
    ]);
  });

  it('takes a phase without an id', () => {
    const d = first(parse('sequence', 'phase "Setup" {\n  a -> b\n}'), 'sequence');
    expect(d.phases).toEqual([{ label: 'Setup', edges: [0], line: 4 }]);
  });

  it('accepts the client kind', () => {
    const doc = parse('sequence', 'web: client "Browser"\nweb -> api');
    expect(doc.diagnostics).toEqual([]);
    expect(first(doc, 'sequence').nodes[0].kind).toBe('client');
  });

  it('reports phase mistakes with a fix', () => {
    const cases: [string, RegExp][] = [
      ['phase "X" {\n  a -> b', /never closed/],
      ['phase X {\n}', /quoted name and an opening brace/],
      ['group "G" {\n  phase "X" {\n  a -> b\n  }\n}', /phase cannot be inside a group/],
      ['phase "X" {\n  group "G" {\n  a\n  }\n  a -> b\n}', /group cannot be inside a phase/],
      ['a -> b\nphase a "X" {\n  a -> b\n}', /already a participant/],
      ['phase p "X" {\n  a -> b\n}\nphase p "Y" {\n  a -> b\n}', /already used on line/],
      ['phase -> b', /quoted name/],
    ];
    for (const [src, message] of cases) {
      const errs = errors(parse('sequence', src));
      expect(errs.map((e) => e.message).join('\n')).toMatch(message);
      expect(errs.every((e) => e.hint)).toBe(true);
    }
  });

  it('warns about an empty phase', () => {
    const doc = parse('sequence', 'a -> b\nphase "Nothing" {\n}');
    expect(doc.diagnostics[0]).toMatchObject({ severity: 'warning', message: expect.stringMatching(/no messages/) });
  });

  it('keeps phases to sequences', () => {
    const errs = errors(parse('state-machine', 'phase "X" {\n  a -> b\n}'));
    expect(errs[0].message).toMatch(/has no phases/);
    expect(errs[0].hint).toMatch(/sequence/);
  });
});

describe('references to edges, phases and loops', () => {
  const doc = parseDocument(`# T

\`\`\`sequence id=s
phase tcp "TCP" {
  a -> b : SYN
}
a -> b : GET
b -> c : fetch
\`\`\`

\`\`\`causal-loop id=c
x -> y : +
y -> x : +
loop growth "Growth": x -> y -> x
\`\`\`

See [the fetch](#s.b->c), [the handshake](#s.tcp) and [growth](#c.growth).
Bad: [x](#s.a->b) [y](#s.c->a) [z](#c.x->z).
`);

  it('resolves an edge by its ends, and a phase or loop by its id', () => {
    expect(doc.refs.map((r) => [r.target, r.marker])).toEqual([
      [{ type: 'edge', index: 2 }, 'a'],
      [{ type: 'edges', id: 'tcp' }, 'b'],
      [{ type: 'edges', id: 'growth' }, 'a'],
    ]);
  });

  it('explains ambiguous and missing edges', () => {
    const errs = errors(doc);
    expect(errs.map((e) => e.message)).toEqual([
      expect.stringMatching(/ambiguous: 2 edges join `a` and `b`/),
      expect.stringMatching(/does not have/),
      expect.stringMatching(/does not have/),
    ]);
    expect(errs[1].hint).toBe('Edges in `s`: `a->b`, `a->b`, `b->c`.');
  });

  it('steps through a named loop', () => {
    const d = first(
      parse('causal-loop', 'x -> y : +\ny -> x : +\nloop g "G": x -> y -> x\nsteps:\n  g "Grows"'),
      'causal-loop',
    );
    expect(d.loops[0].id).toBe('g');
    expect(d.steps[0].target).toEqual({ type: 'edges', id: 'g' });
  });
});

describe('timeline: time since the start', () => {
  it('reads durations with units as times', () => {
    const doc = parse('timeline', '0ms crash: "Crash"\n+150ms wait: "Wait" {until=1.5s}\n+2min done: "Done"');
    expect(doc.diagnostics).toEqual([]);
    const d = first(doc, 'timeline');
    expect(d.dating).toBe('elapsed');
    if (d.dating === 'undated') throw new Error('dated');
    expect(d.nodes.map((n) => [n.at.value, n.lastsMs])).toEqual([
      [0, undefined],
      [150, 1350],
      [120_000, undefined],
    ]);
  });

  it('will not mix them with clock times', () => {
    const e = errors(parse('timeline', '0ms a: "A"\n14:02 b: "B"'))[0];
    expect(e.message).toMatch(/clock time, but `0ms` above is a time since the start/);
  });
});

describe('timeline lanes', () => {
  const body = `lane "Server A" {
  0ms crash: "Crash"
}
lane "Server B" {
  +150ms fire: "Fires"
  +180ms lead: "Leads"
}
crash -> fire`;

  it('puts each event in the lane it is written in', () => {
    const doc = parse('timeline', body);
    expect(doc.diagnostics).toEqual([]);
    const d = first(doc, 'timeline');
    expect(d.lanes.map((l) => l.label)).toEqual(['Server A', 'Server B']);
    expect(d.nodes.map((n) => [n.id, n.lane])).toEqual([
      ['crash', 0],
      ['fire', 1],
      ['lead', 1],
    ]);
  });

  it('checks order within a lane only', () => {
    const doc = parse('timeline', 'lane "A" {\n  2020 a: "A"\n}\nlane "B" {\n  2019 b: "B"\n}');
    expect(doc.diagnostics).toEqual([]);
  });

  it('needs every event in a lane once there are lanes', () => {
    const e = errors(parse('timeline', 'lane "A" {\n  2020 a: "A"\n}\n2021 b: "B"'))[0];
    expect(e.message).toMatch(/`b` is in no lane/);
    expect(e.hint).toMatch(/lane "A" \{/);
  });

  it('reports lane mistakes with a fix', () => {
    const cases: [string, string, RegExp][] = [
      ['timeline', 'lane "A" {\n  2020 a', /never closed/],
      ['timeline', 'lane A {\n}', /quoted name/],
      ['timeline', 'group "G" {\n  lane "A" {\n  }\n}', /lane cannot be inside a group/],
      ['timeline', 'lane "A" {\n  group "G" {\n  }\n}', /group cannot be inside a lane/],
      ['sequence', 'lane "A" {\n  a -> b\n}', /has no lanes/],
    ];
    for (const [type, src, message] of cases) {
      const errs = errors(parse(type, src));
      expect(errs.map((e) => e.message).join('\n')).toMatch(message);
      expect(errs.every((e) => e.hint)).toBe(true);
    }
  });
});

describe('tradeoffs caveats', () => {
  it('keeps a cell note as its caveat', () => {
    const d = first(parse('tradeoffs', 'a.x : yes {note="since 4.0"}\nb.x : no'), 'tradeoffs');
    expect(d.cells[0]).toMatchObject({ value: 'yes', note: 'since 4.0' });
  });
});

describe('page hints on headings', () => {
  const headings = (source: string) => {
    const doc = parseDocument(source);
    return { doc, errors: doc.diagnostics.map((d) => ({ line: d.line, message: d.message, hint: d.hint })) };
  };

  it('accepts keep and new without diagnostics, and strips them from the title and heading', () => {
    const doc = parseDocument('# Guide {page=keep}\n\n## Where the writes go {page=keep}\n\n## Appendix {page=new}\n');
    expect(doc.diagnostics).toEqual([]);
    expect(doc.title).toBe('Guide');
    expect(renderHtml(doc)).not.toMatch(/\{page/);
    expect(renderHtml(doc)).toContain('<h2>Where the writes go</h2>');
    expect(renderHtml(doc)).toContain('<h2>Appendix</h2>');
  });

  it('keeps braces that sit in the middle of a heading', () => {
    const doc = parseDocument('## The {x} problem\n');
    expect(doc.diagnostics).toEqual([]);
    expect(renderHtml(doc)).toContain('<h2>The {x} problem</h2>');
  });

  it('strips a hint that follows inline markup', () => {
    const doc = parseDocument('## Foo *bar* {page=new}\n');
    expect(doc.diagnostics).toEqual([]);
    expect(renderHtml(doc)).toContain('<h2>Foo <em>bar</em></h2>');
  });

  it('names an unknown page value, with a fix', () => {
    const { errors } = headings('# Doc\n\n## Foo {page=together}\n');
    expect(errors).toEqual([
      {
        line: 3,
        message: 'Unknown page hint `together`.',
        hint: 'Use `{page=keep}` to keep the section on one page, or `{page=new}` to start it on a new page.',
      },
    ]);
  });

  it('suggests the nearest page value for a near miss', () => {
    const { errors } = headings('## Foo {page=newe}\n');
    expect(errors).toEqual([{ line: 1, message: 'Unknown page hint `newe`.', hint: 'Did you mean `{page=new}`?' }]);
  });

  it('rejects any key other than page', () => {
    const { errors } = headings('# Doc\n\n## Foo {break=new}\n');
    expect(errors).toEqual([
      { line: 3, message: 'Headings take only the `page` hint.', hint: 'Write `{page=new}` or `{page=keep}`.' },
    ]);
  });

  it('rejects a heading with two page hints', () => {
    const { errors } = headings('## Foo {page=keep, page=new}\n');
    expect(errors).toEqual([
      {
        line: 1,
        message: 'A heading takes one page hint, but this one has 2.',
        hint: 'Keep one of `{page=keep}` or `{page=new}`.',
      },
    ]);
  });

  it('rejects a page hint with no value', () => {
    const { errors } = headings('## Foo {page, page=keep}\n');
    expect(errors.map((e) => e.message)).toEqual([
      'The `page` hint has no value.',
      'A heading takes one page hint, but this one has 2.',
    ]);
    expect(headings('## Foo {x=1, page}\n').errors.map((e) => e.message)).toEqual([
      'Headings take only the `page` hint.',
      'The `page` hint has no value.',
    ]);
  });

  it('reports an unclosed brace at the end of a heading', () => {
    const { errors } = headings('## Foo {page=keep\n');
    expect(errors).toEqual([
      { line: 1, message: 'Heading ends in an unclosed `{`.', hint: 'Close the brace, as in `{page=keep}`.' },
    ]);
  });
});
