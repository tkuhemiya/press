import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDocument } from '../src/index.ts';
import { renderTerminal } from '../src/render/terminal.ts';
import { canvas } from '../src/render/term/canvas.ts';
import { cellWidth, wrapCells } from '../src/render/term/cells.ts';
import { stripAnsi } from '../src/render/term/theme.ts';

const dir = new URL('../docs/examples/', import.meta.url);
const examples = readdirSync(dir)
  .filter((f) => f.endsWith('.md'))
  .map((f) => ({ name: f.replace(/\.md$/, ''), source: readFileSync(new URL(f, dir), 'utf8') }));
const plain = (source: string, width = 80, ascii = false): string =>
  renderTerminal(parseDocument(source), { width, theme: 'plain', ascii });
const fence = (type: string, body: string): string => `\`\`\`${type}\n${body}\n\`\`\`\n`;

describe('terminal canvas', () => {
  it('merges crossing lines into junctions', () => {
    const c = canvas();
    c.path(
      [
        { x: 0, y: 1 },
        { x: 4, y: 1 },
      ],
      'light',
      'line',
    );
    c.path(
      [
        { x: 2, y: 0 },
        { x: 2, y: 2 },
      ],
      'light',
      'line',
    );
    c.box(6, 0, 4, 3, 'light', 'line');
    c.path(
      [
        { x: 7, y: 2 },
        { x: 7, y: 4 },
      ],
      'light',
      'line',
    );
    expect(c.render({ name: 'plain', ascii: false, links: false })).toEqual([
      '  │   ┌──┐',
      '──┼── │  │',
      '  │   └┬─┘',
      '       │',
      '       │',
    ]);
  });

  it('measures wide characters as two cells and wraps on words', () => {
    expect(cellWidth('日本')).toBe(4);
    expect(cellWidth('CO₂')).toBe(3);
    expect(wrapCells('one two three four', 9)).toEqual(['one two', 'three', 'four']);
  });
});

describe('press preview', () => {
  for (const { name, source } of examples) {
    it(`${name} fits 80 columns and matches its snapshot`, async () => {
      const out = plain(source);
      for (const line of out.split('\n')) expect(cellWidth(line), line).toBeLessThanOrEqual(80);
      await expect(out).toMatchFileSnapshot(`./__snapshots__/terminal/${name}.txt`);
    });
  }

  it('lays out the same whether coloured or plain', () => {
    for (const { source } of examples) {
      const doc = parseDocument(source);
      const dark = renderTerminal(doc, { width: 80, theme: 'dark' });
      expect(dark).toContain('\u001b[');
      expect(stripAnsi(dark)).toBe(renderTerminal(doc, { width: 80, theme: 'plain' }));
    }
  });

  it('draws figures in plain ASCII when asked', () => {
    const src = fence(
      'state-machine',
      'start -> draft\ndraft -> paid : pay {role=happy}\ndraft -> failed : decline {role=error}\nfailed --> draft : retry\npaid -> end\nsteps:\n  draft -> paid "Paid"',
    );
    const out = plain(src, 80, true);
    expect(out).toMatch(/^[\x20-\x7e\n]*$/);
    expect(out).toContain('(1)');
  });

  it('keeps every label and marks the steps on the figure and in the legend', () => {
    const src = examples.find((e) => e.name === 'checkout')?.source ?? '';
    const out = plain(src);
    for (const label of ['draft', 'submitted', 'paid', 'failed', 'shipped', 'cancelled', 'card declined', 'retry'])
      expect(out).toContain(label);
    expect(out.match(/①/g)?.length).toBeGreaterThanOrEqual(2);
    expect(out).toContain('failed state[a]');
  });

  it('turns a figure that cannot fit into a list rather than cutting it off', () => {
    const many = Array.from({ length: 9 }, (_, i) => `p${i} -> p${i + 1} : message number ${i}`).join('\n');
    const out = plain(fence('sequence', many), 60);
    expect(out).toContain('1. p0 ─▶ p1: message number 0');
    for (const line of out.split('\n')) expect(cellWidth(line)).toBeLessThanOrEqual(60);
  });

  it('draws every diagram type', () => {
    const out = plain(
      [
        fence('architecture', 'fn: aws.lambda "Resize"\ngroup "VPC" {\n  db: database "Photos"\n}\nfn -> db : write'),
        fence('causal-loop', 'a -> b : +\nb -> a : -\nloop "Balance": a -> b -> a'),
        fence('decision-tree', 'q: "Cache?"\nq -> yes_ : yes\nq -> no_ : no'),
        fence('er', 'users.id : uuid {key=yes}\norders.user_id : uuid\norders.user_id -> users.id {card=N:1}'),
        fence('timeline', '14:02 a: "Deploy"\n14:09 b: "Alert" {until=14:20}\na -> b : caused'),
        fence('tradeoffs', 'x.speed : fast {role=happy}\ny.speed : slow {role=error}'),
      ].join('\n'),
    );
    for (const text of [
      'aws.lambda',
      '╭─ VPC',
      'B1 Balance',
      'yes',
      'user_id → id',
      'N:1',
      '14:20',
      'end of “Alert”',
      '✓ fast',
      '✗ slow',
    ])
      expect(out).toContain(text);
  });

  it('writes plain text when the output is not a terminal', () => {
    const out = execFileSync('node', ['src/cli.ts', 'preview', 'docs/examples/incident.md'], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, FORCE_COLOR: '' },
    }).toString();
    expect(out).not.toContain('\u001b');
    expect(out).toContain('Outage, 14 March');
  });
});
