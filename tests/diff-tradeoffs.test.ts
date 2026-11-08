import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { build, parseDocument, type Document } from '../src/index.ts';

const fence = (body: string) => `# Doc\n\n\`\`\`tradeoffs id=t\n${body}\n\`\`\`\n`;
const parse = (body: string) => parseDocument(fence(body));
const page = (body: string) => build(fence(body), { embedFonts: false }).html;
const tradeoffs = (doc: Document) => {
  const d = doc.figures[0]?.diagram;
  if (d?.type !== 'tradeoffs') throw new Error('expected a tradeoffs table');
  return d;
};
const element = (html: string, id: string): string => {
  const at = html.indexOf(`data-node="${id}"`);
  if (at < 0) throw new Error(`no element for ${id}`);
  const start = html.lastIndexOf('<g', at);
  let depth = 0;
  for (const m of html.slice(start).matchAll(/<g[\s>]|<\/g>/g)) {
    depth += m[0] === '</g>' ? -1 : 1;
    if (depth === 0) return html.slice(start, start + (m.index ?? 0) + 4);
  }
  return html.slice(start);
};
const opening = (html: string, id: string): string => {
  const el = element(html, id);
  return el.slice(0, el.indexOf('>') + 1);
};

describe('diff marks in tradeoffs', () => {
  it('marks an added option and its cell as added, and leaves the kept option unmarked', () => {
    const body = `redis: "Redis"
latency: "Read latency"
redis.latency : "<1 ms"
+ jwt: "Signed token"
+ jwt.latency : none {role=happy}`;
    const doc = parse(body);
    expect(doc.diagnostics).toEqual([]);
    expect(tradeoffs(doc).options.map((o) => [o.id, o.change])).toEqual([
      ['redis', undefined],
      ['jwt', 'added'],
    ]);
    const html = page(body);
    expect(opening(html, 'jwt')).toContain('data-change="added"');
    expect(opening(html, 'jwt.latency')).toContain('data-change="added"');
    expect(opening(html, 'jwt.latency')).not.toContain('data-role');
    expect(opening(html, 'redis')).not.toContain('data-change');
  });

  it('marks a removed option and its cell as removed, and drops their role', () => {
    const body = `redis: "Redis"
latency: "Read latency"
redis.latency : "<1 ms"
- cookie: "Signed cookie"
- cookie.latency : none {role=happy}`;
    const doc = parse(body);
    expect(doc.diagnostics).toEqual([]);
    const d = tradeoffs(doc);
    expect(d.options.find((o) => o.id === 'cookie')?.change).toBe('removed');
    expect(d.cells.find((c) => c.option === 'cookie')).toMatchObject({ change: 'removed', role: 'happy' });
    const html = page(body);
    expect(opening(html, 'cookie')).toContain('data-change="removed"');
    expect(opening(html, 'cookie')).not.toContain('data-role');
    expect(opening(html, 'cookie.latency')).toContain('data-change="removed"');
  });

  it('marks an added criterion as a row, and a kept one as unmarked', () => {
    const body = `redis: "Redis"
latency: "Read latency"
redis.latency : "<1 ms"
+ audit: "Audit trail"
+ redis.audit : yes`;
    const doc = parse(body);
    expect(doc.diagnostics).toEqual([]);
    expect(tradeoffs(doc).criteria.map((c) => [c.id, c.change])).toEqual([
      ['latency', undefined],
      ['audit', 'added'],
    ]);
    const html = page(body);
    expect(opening(html, 'audit')).toContain('data-change="added"');
    expect(opening(html, 'latency')).not.toContain('data-change');
  });

  it('marks a criterion used only by removed cells as removed', () => {
    const body = `redis: "Redis"
postgres: "Postgres"
latency: "Read latency"
redis.latency : "<1 ms"
postgres.latency : "~2 ms"
- redis.revoke : yes
- postgres.revoke : yes`;
    const doc = parse(body);
    expect(doc.diagnostics).toEqual([]);
    expect(tradeoffs(doc).criteria.map((c) => [c.id, c.change])).toEqual([
      ['latency', undefined],
      ['revoke', 'removed'],
    ]);
    const html = page(body);
    expect(opening(html, 'revoke')).toContain('data-change="removed"');
    expect(opening(html, 'redis.revoke')).toContain('data-change="removed"');
    expect(opening(html, 'latency')).not.toContain('data-change');
  });

  it('marks an added cell, and leaves its neighbours unmarked', () => {
    const body = `redis: "Redis"
postgres: "Postgres"
latency: "Read latency"
redis.latency : "<1 ms"
+ postgres.latency : "~2 ms"`;
    const doc = parse(body);
    expect(doc.diagnostics).toEqual([]);
    expect(tradeoffs(doc).cells.find((c) => c.option === 'postgres')?.change).toBe('added');
    const html = page(body);
    expect(opening(html, 'postgres.latency')).toContain('data-change="added"');
    expect(opening(html, 'redis.latency')).not.toContain('data-change');
  });

  it('marks a removed cell and warns that the criterion it leaves behind has a gap', () => {
    const body = `redis: "Redis"
postgres: "Postgres"
latency: "Read latency"
ops: "Running cost"
redis.latency : "<1 ms"
postgres.latency : "~2 ms"
postgres.ops : "already running"
- redis.ops : "another service" {role=error}`;
    const doc = parse(body);
    expect(doc.diagnostics.map((d) => d.message)).toEqual([
      '`redis` has no value for `ops`; that cell draws as a dash.',
    ]);
    const html = page(body);
    expect(opening(html, 'redis.ops')).toContain('data-change="removed"');
    expect(opening(html, 'redis.ops')).not.toContain('data-role');
    expect(opening(html, 'ops')).not.toContain('data-change');
  });

  it('keeps an edited cell as its old value removed and its new value added', () => {
    const body = `redis: "Redis"
latency: "Read latency"
- redis.latency : "<1 ms"
+ redis.latency : "<2 ms"`;
    const doc = parse(body);
    expect(doc.diagnostics).toEqual([]);
    expect(tradeoffs(doc).cells.map((c) => [c.value, c.change])).toEqual([
      ['<1 ms', 'removed'],
      ['<2 ms', 'added'],
    ]);
    const html = page(body);
    expect(opening(html, 'redis.latency')).not.toContain('data-change');
    expect(element(html, 'redis.latency')).toMatch(
      /<g data-change="removed"><text class="pr-value pr-struck"[^>]*><tspan[^>]*>− &lt;1 ms</,
    );
    expect(element(html, 'redis.latency')).toMatch(
      /<g data-change="added"><text class="pr-value"[^>]*><tspan[^>]*>\+ &lt;2 ms</,
    );
    expect(html).not.toContain('was &quot;');
  });

  it('keeps the new value of an edited cell with its own note, and rings only an author caveat', () => {
    const body = `redis: "Redis"
postgres: "Postgres"
latency: "Read latency"
ops: "Running cost"
postgres.latency : "~2 ms" {note="p99 on a warm cache"}
postgres.ops : "already running"
- redis.latency : "<1 ms"
+ redis.latency : "<2 ms"
- redis.ops : "another service" {role=error}
+ redis.ops : "managed service" {note="billed per GB"}`;
    const doc = parse(body);
    expect(doc.diagnostics).toEqual([]);
    expect(tradeoffs(doc).cells.filter((c) => c.option === 'redis' && c.criterion === 'ops')).toEqual([
      expect.objectContaining({ value: 'another service', change: 'removed', role: 'error' }),
      expect.objectContaining({ value: 'managed service', change: 'added', note: 'billed per GB' }),
    ]);
    const html = page(body);
    expect(element(html, 'redis.ops')).toContain('billed per GB');
    expect(element(html, 'redis.ops')).not.toContain('was &quot;');
    expect(element(html, 'redis.ops')).toContain('pr-caveat');
    expect(element(html, 'redis.latency')).not.toContain('pr-caveat');
    expect(element(html, 'postgres.latency')).toContain('pr-caveat');
  });

  it('marks an added category band, when all its criteria are added', () => {
    const body = `redis: "Redis"
latency: "Read latency"
group "Security" {
  + audit: "Audit trail"
}
redis.latency : "<1 ms"
+ redis.audit : yes`;
    const doc = parse(body);
    expect(doc.diagnostics).toEqual([]);
    expect(tradeoffs(doc).categories.map((g) => [g.label, g.change])).toEqual([['Security', 'added']]);
    const html = page(body);
    expect(html).toMatch(/<g class="pr-group pr-band" data-change="added">/);
  });

  it('draws an unchanged table with no change marks at all', () => {
    const src = readFileSync(new URL('../docs/examples/sessions.md', import.meta.url), 'utf8');
    const { html, diagnostics } = build(src, { embedFonts: false });
    expect(diagnostics).toEqual([]);
    expect(html.slice(html.indexOf('<svg'), html.indexOf('</svg>'))).not.toContain('data-change');
    expect(opening(html, 'postgres')).toContain('data-role="focus"');
    expect(opening(html, 'cookie.revoke')).toContain('data-role="error"');
  });
});
