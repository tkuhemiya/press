#!/usr/bin/env node

import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build, formatDiagnostic } from './index.ts';
import { typstDocument } from './render/typst.ts';

const USAGE = `Usage:
  press build <file.md> -o out.html | out.pdf               Render to HTML, or typeset to PDF (needs typst)
  press build <file.md...> --out-dir dir                    Render each file to HTML
  press check <file.md...>                                  Report problems only
  press pdf <file.md> [-o out.pdf]                          Print the HTML to PDF with Chromium (needs Playwright)`;

const args = process.argv.slice(2);
const command = args.shift();
let out: string | undefined;
let outDir: string | undefined;
const files: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '-o' || args[i] === '--out') out = args[++i];
  else if (args[i] === '--out-dir') outDir = args[++i];
  else files.push(args[i]);
}

if (!command || !['build', 'check', 'pdf'].includes(command) || !files.length) {
  console.error(USAGE);
  process.exit(command === 'help' || command === '--help' ? 0 : 2);
}
if (out && files.length > 1) {
  console.error('-o takes one input file; use --out-dir for several.');
  process.exit(2);
}
const format = out ? /\.(html?|pdf)$/i.exec(out)?.[1]?.toLowerCase() : 'html';
if (command === 'build' && !format) {
  console.error(`Cannot tell the output format from \`${out}\`: end it in .html or .pdf.`);
  process.exit(2);
}

let failed = false;
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const result = build(source);
  for (const d of result.diagnostics) console.error(formatDiagnostic(d, file));
  if (result.diagnostics.some((d) => d.severity === 'error')) {
    failed = true;
    continue;
  }
  if (command === 'check') continue;
  const stem = basename(file).replace(/\.(md|markdown|press)$/i, '');
  if (command === 'build' && format === 'pdf' && out) {
    typeset(JSON.stringify(typstDocument(result.document)), resolve(out));
    console.error(`wrote ${out}`);
  } else if (command === 'build') {
    const target = out ?? join(outDir ?? '.', `${stem}.html`);
    if (outDir) mkdirSync(outDir, { recursive: true });
    writeFileSync(target, result.html);
    console.error(`wrote ${target}`);
  } else {
    const target = resolve(out ?? join(outDir ?? '.', `${stem}.pdf`));
    await printPdf(result.html, target);
    console.error(`wrote ${target}`);
  }
}
process.exit(failed ? 1 : 0);

async function printPdf(html: string, target: string): Promise<void> {
  let chromium;
  try {
    ({ chromium } = createRequire(import.meta.url)('playwright'));
  } catch {
    console.error('press pdf needs Playwright: npm i -D playwright && npx playwright install chromium');
    process.exit(2);
  }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: target, format: 'A4', printBackground: true, preferCSSPageSize: true });
  await browser.close();
}

function typeset(json: string, target: string): void {
  const dir = mkdtempSync(join(tmpdir(), 'press-'));
  const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
  try {
    writeFileSync(join(dir, 'doc.json'), json);
    copyFileSync(here('./render/press.typ'), join(dir, 'press.typ'));
    execFileSync(
      'typst',
      [
        'compile',
        '--root',
        dir,
        '--font-path',
        here('../assets/fonts/ttf'),
        '--ignore-system-fonts',
        join(dir, 'press.typ'),
        target,
      ],
      { stdio: 'inherit' },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
