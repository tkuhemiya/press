import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDocument } from '../src/index.ts';
import { pagedImageOutputs, pagedImagePath, printFigureCount } from '../src/render/typst.ts';

const cwd = new URL('..', import.meta.url);
const card = `# Checkout

\`\`\`state-machine id=order title="Order lifecycle, with a fraud review"
start -> draft
draft -> submitted : submit
submitted -> paid : payment ok {role=happy}
submitted -> review : over risk threshold {role=focus}
review -> paid : approved {role=happy}
review -> failed : rejected {role=error}
submitted -> failed : card declined {role=error}
paid -> end
\`\`\`
`;

const two = `${card}

\`\`\`sequence id=call title="Calling through an open breaker"
checkout -> breaker : reserve
breaker --> checkout : fail fast {role=error}
\`\`\`
`;

function hasTypst(): boolean {
  try {
    execFileSync('typst', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function press(args: string[]) {
  return spawnSync('node', ['src/cli.ts', ...args], { cwd, encoding: 'utf8' });
}

describe('image export paths', () => {
  it('counts print figures', () => {
    expect(printFigureCount(parseDocument('# Hi\n\nNo figure.\n'))).toBe(0);
    expect(printFigureCount(parseDocument(card))).toBe(1);
    expect(printFigureCount(parseDocument(two))).toBe(2);
  });

  it('keeps a single figure on the given path', () => {
    expect(pagedImagePath('/tmp/card.png', 1)).toBe('/tmp/card.png');
    expect(pagedImageOutputs('/tmp/card.png', 1)).toEqual(['/tmp/card.png']);
  });

  it('numbers several figures next to the given path', () => {
    expect(pagedImagePath('/tmp/doc.png', 2)).toBe('/tmp/doc-{p}.png');
    expect(pagedImageOutputs('/tmp/doc.png', 2)).toEqual(['/tmp/doc-1.png', '/tmp/doc-2.png']);
    expect(pagedImagePath('/tmp/doc-{p}.svg', 3)).toBe('/tmp/doc-{p}.svg');
  });
});

describe('press build -o png', () => {
  it('rejects a document with no figures', () => {
    const dir = mkdtempSync(join(tmpdir(), 'press-img-'));
    try {
      const md = join(dir, 'empty.md');
      writeFileSync(md, '# Hi\n\nJust prose.\n');
      const result = press(['build', md, '-o', join(dir, 'empty.png')]);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/has no figures to draw/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('tells you to install Typst, not to screenshot HTML', () => {
    const bin = mkdtempSync(join(tmpdir(), 'press-nopath-'));
    try {
      symlinkSync(process.execPath, join(bin, 'node'));
      const result = spawnSync(
        join(bin, 'node'),
        ['src/cli.ts', 'build', 'docs/how-press-works.md', '-o', join(bin, 'x.png')],
        { cwd, encoding: 'utf8', env: { ...process.env, PATH: bin } },
      );
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/typst.*not found on PATH/i);
      expect(result.stderr).toMatch(/Do not screenshot HTML/);
      expect(result.stderr).not.toMatch(/-o out\.html/);
    } finally {
      rmSync(bin, { recursive: true, force: true });
    }
  });

  it('rejects --ppi on non-raster output', () => {
    const result = press(['build', 'docs/how-press-works.md', '-o', '/tmp/x.pdf', '--ppi', '144']);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/--ppi applies to PNG, WebP and JPEG output/);
  });

  it.skipIf(!hasTypst())('writes one tight PNG per figure', () => {
    const dir = mkdtempSync(join(tmpdir(), 'press-img-'));
    try {
      const md = join(dir, 'two.md');
      writeFileSync(md, two);
      const png = join(dir, 'two.png');
      const result = press(['build', md, '-o', png]);
      expect(result.status).toBe(0);
      expect(result.stderr).toMatch(/wrote .*two-1\.png/);
      expect(result.stderr).toMatch(/wrote .*two-2\.png/);
      const a = readFileSync(join(dir, 'two-1.png'));
      const b = readFileSync(join(dir, 'two-2.png'));
      expect(a.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(b.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(a.length).toBeGreaterThan(1000);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.skipIf(!hasTypst())('writes a lossless WebP from the Typst PNG', () => {
    const dir = mkdtempSync(join(tmpdir(), 'press-img-'));
    try {
      const md = join(dir, 'card.md');
      writeFileSync(md, card);
      const webp = join(dir, 'card.webp');
      const result = press(['build', md, '-o', webp]);
      expect(result.status).toBe(0);
      expect(result.stderr).toMatch(/wrote .*card\.webp/);
      const bytes = readFileSync(webp);
      expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
      expect(bytes.length).toBeGreaterThan(500);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.skipIf(!hasTypst())('writes JPEG when asked', () => {
    const dir = mkdtempSync(join(tmpdir(), 'press-img-'));
    try {
      const md = join(dir, 'card.md');
      writeFileSync(md, card);
      const jpg = join(dir, 'card.jpg');
      const result = press(['build', md, '-o', jpg]);
      expect(result.status).toBe(0);
      const bytes = readFileSync(jpg);
      expect(bytes.subarray(0, 3).toString('hex')).toBe('ffd8ff');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
