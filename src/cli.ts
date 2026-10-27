#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { build, formatDiagnostic } from './index.ts';

const USAGE = `Usage:
  press build <file.md...> [-o out.html | --out-dir dir]   Render to self-contained HTML
  press check <file.md...>                                  Report problems only
  press pdf <file.md> [-o out.pdf]                          Print to PDF (needs Playwright)`;

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
  if (command === 'build') {
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
