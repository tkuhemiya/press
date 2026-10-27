import { describe, expect, it } from 'vitest';
import { parseDocument } from '../src/parse/document.ts';

const fence = (type: string, body: string, header = '') =>
  `# Doc\n\n\`\`\`${type}${header ? ' ' + header : ''}\n${body}\n\`\`\`\n`;
const parse = (type: string, body: string, header = '') => parseDocument(fence(type, body, header));
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
    const d = doc.diagrams[0];
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
    const d = doc.diagrams[0];
    expect(d.nodes[0]).toMatchObject({ id: 'client', kind: 'user', label: 'Browser' });
    expect(d.nodes[1]).toMatchObject({ id: 'api', role: 'focus' });
    expect(d.edges.map((e) => e.arrow)).toEqual(['->', '-->', '<->']);
    expect(d.edges[0].label).toBe('GET /');
  });

  it('keeps hyphens inside ids apart from arrows', () => {
    const d = parse('state-machine', 'a-b-->c-d').diagrams[0];
    expect(d.edges[0]).toMatchObject({ from: 'a-b', to: 'c-d', arrow: '-->' });
  });

  it('expands chains and applies attributes to every segment', () => {
    const d = parse('state-machine', 'start -> draft -> paid --> end {role=happy}').diagrams[0];
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
    const d = parse(
      'state-machine',
      'group "Active" {\n  playing -> paused\n  group "Inner" {\n    x\n  }\n}\nidle -> playing',
    ).diagrams[0];
    expect(d.groups).toEqual([
      { label: 'Active', parent: -1, line: 4 },
      { label: 'Inner', parent: 0, line: 6 },
    ]);
    expect(d.nodes.find((n) => n.id === 'x')!.group).toBe(1);
    expect(d.nodes.find((n) => n.id === 'idle')!.group).toBe(-1);
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
    const d = doc.diagrams[0];
    expect(d.nodes.map((n) => [n.id, n.kind, n.group])).toEqual([
      ['web', 'client', -1],
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
    expect(doc.diagrams[0].nodes[0].group).toBe(1);
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
    expect(doc.diagrams).toHaveLength(0);
  });
});

describe('steps', () => {
  it('resolves node and edge steps', () => {
    const d = parse(
      'state-machine',
      'start -> draft\ndraft -> paid : pay\nsteps:\n  draft "Starts here"\n  draft -> paid "Pays"',
    ).diagrams[0];
    expect(d.steps).toEqual([
      { target: { type: 'node', id: 'draft' }, caption: 'Starts here', line: 7 },
      { target: { type: 'edge', index: 1 }, caption: 'Pays', line: 8 },
    ]);
  });

  it('treats -> and --> as the same in a step', () => {
    const d = parse('sequence', 'db --> api : ok\nsteps:\n  db -> api "Replies"').diagrams[0];
    expect(d.steps[0].target).toEqual({ type: 'edge', index: 0 });
  });

  it('matches <-> edges in either direction', () => {
    const d = parse('sequence', 'a <-> b : sync\nsteps:\n  b -> a "Syncs"').diagrams[0];
    expect(d.steps[0].target).toEqual({ type: 'edge', index: 0 });
  });

  it('disambiguates repeated messages by label', () => {
    const doc = parse(
      'sequence',
      'api -> db : insert\napi -> db : update\nsteps:\n  api -> db : update "Second write"',
    );
    expect(doc.diagnostics).toEqual([]);
    expect(doc.diagrams[0].steps[0].target).toEqual({ type: 'edge', index: 1 });
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
    expect(doc.refs.map((r) => [r.node, r.marker])).toEqual([
      ['failed', 'a'],
      ['draft', 'b'],
      ['failed', 'a'],
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
    const [d] = doc.diagrams;
    expect(d.nodes.map((n) => n.time?.form)).toEqual(['year', 'month', 'day', 'datetime']);
    expect(d.nodes[1].until?.text).toBe('2019-09');
    expect(d.nodes[1].group).toBe(0);
    expect(d.edges).toHaveLength(1);
  });

  it('reads clock times and an event without a label', () => {
    const doc = parse('timeline', '9:05 a\n14:02:30 b: "Later"');
    expect(doc.diagnostics).toEqual([]);
    expect(doc.diagrams[0].nodes.map((n) => [n.id, n.label, n.time?.value])).toEqual([
      ['a', 'a', 32_700_000],
      ['b', 'Later', 50_550_000],
    ]);
  });

  it('spaces an undated timeline in source order', () => {
    const doc = parse('timeline', 'a: "One"\nb: "Two"\na -> b');
    expect(doc.diagnostics).toEqual([]);
    expect(doc.diagrams[0].nodes.every((n) => !n.time)).toBe(true);
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
    const [d] = doc.diagrams;
    expect(d.edges.map((e) => e.label)).toEqual(['+', '+', '+', '-', '-']);
    expect(d.edges[4].attrs.delay).toBe('yes');
    expect(d.loops.map((l) => [l.label, l.name, l.nodes])).toEqual([
      ['R1', 'Word of mouth', ['customers', 'referrals']],
      ['B1', 'Saturation', ['customers', 'saturation', 'referrals']],
    ]);
  });

  it('numbers loops per type', () => {
    const doc = parse(
      'causal-loop',
      'a -> b : +\nb -> a : +\nb -> c : -\nc -> b : +\nloop "One": a -> b -> a\nloop "Two": b -> c -> b\nloop "Three": b -> a -> b',
    );
    expect(doc.diagrams[0].loops.map((l) => l.label)).toEqual(['R1', 'B1', 'R2']);
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
    expect(doc.diagrams[0].props.map((p) => [p.node, p.key, p.value, p.role])).toEqual([
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
    expect(doc.diagrams[0].props).toHaveLength(1);
  });

  it('steps and prose references can name a property', () => {
    const doc = parseDocument(
      '```tradeoffs id=t\nredis.ops : x\n\nsteps:\n  redis.ops "Costs"\n```\n\nSee [ops](#t.redis.ops).\n',
    );
    expect(doc.diagnostics).toEqual([]);
    expect(doc.diagrams[0].steps[0].target).toEqual({ type: 'node', id: 'redis.ops' });
    expect(doc.refs[0].node).toBe('redis.ops');
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
    expect(doc.diagrams[0].nodes.map((n) => n.id)).toEqual(['a', 'x', 'y', 'b']);
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
    const [e] = doc.diagrams[0].edges;
    expect([e.from, e.fromKey, e.to, e.toKey, e.label, e.attrs.card]).toEqual([
      'orders',
      'user_id',
      'users',
      'id',
      'placed by',
      'N:0..1',
    ]);
  });

  it('reads entity-level edges, and steps over field edges', () => {
    const doc = parse(
      'er',
      `${schema}\nusers -> teams : member of {card=N:N}\norders.user_id -> users.id {card=N:1}\n\nsteps:\n  orders.user_id -> users.id "Placed by"`,
    );
    expect(doc.diagnostics).toEqual([]);
    expect(doc.diagrams[0].steps[0].target).toEqual({ type: 'edge', index: 1 });
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
    expect(parse('causal-loop', 'wage_demands -> prices : +').diagrams[0].nodes[0].label).toBe('wage demands');
    expect(parse('er', 'channel_members.id : uuid {key=yes}').diagrams[0].nodes[0].label).toBe('channel_members');
  });

  it('puts the criterion of a cell written inside a group into that category', () => {
    const doc = parse('tradeoffs', 'group "Cost" {\n  a.ops : cheap\n  b.ops : dear\n}');
    expect(doc.diagnostics).toEqual([]);
    expect(doc.diagrams[0].nodes.find((n) => n.id === 'ops')!.group).toBe(0);
  });

  it('warns about a group with no members', () => {
    const w = parse('architecture', 'a -> b\ngroup "Empty" {\n}').diagnostics[0];
    expect(w).toMatchObject({ severity: 'warning', message: expect.stringMatching(/no members/) });
  });

  it('explains that a timeline takes times, not durations', () => {
    const e = errors(parse('timeline', '0ms crash: "Leader crashes"\n180ms fire: "B fires"'))[0];
    expect(e.message).toMatch(/is a duration or a number/);
    expect(e.hint).toMatch(/00:00:05.*crash: "Label"/);
  });
});
