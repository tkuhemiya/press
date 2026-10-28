#!/usr/bin/env node

import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, formatDiagnostic } from './index.ts';
import { typstDocument } from './render/typst.ts';
import { ICON_VENDORS, iconNames, isVendor } from './icons.ts';
import { parseReports, settle, unfitSections, type Choices, type Report } from './render/settle.ts';

const USAGE = `Usage:
  press build <file.md> -o out.html | out.pdf               Render to HTML, or typeset to PDF (needs typst)
  press build <file.md...> --out-dir dir                    Render each file to HTML
  press check <file.md...>                                  Report problems only
  press icons [aws|azure|gcp|k8s] [word]                    List icon names, optionally only those containing word`;

const MAX_ROUNDS = 50;

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

if (command === 'icons') {
  const [vendor, word = ''] = files;
  if (vendor === undefined) {
    for (const v of ICON_VENDORS) console.log(`${v}  ${iconNames(v).length} icons`);
    process.exit(0);
  }
  if (!isVendor(vendor)) {
    console.error(`Unknown icon set \`${vendor}\`. Icon sets: ${ICON_VENDORS.join(', ')}.`);
    process.exit(2);
  }
  for (const name of iconNames(vendor)) if (name.includes(word)) console.log(`${vendor}.${name}`);
  process.exit(0);
}

if (!command || !['build', 'check'].includes(command) || !files.length) {
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
  if (format === 'pdf' && out) {
    typeset(JSON.stringify(typstDocument(result.document)), resolve(out));
    console.error(`wrote ${out}`);
    continue;
  }
  const target = out ?? join(outDir ?? '.', `${stem}.html`);
  if (outDir) mkdirSync(outDir, { recursive: true });
  writeFileSync(target, result.html);
  console.error(`wrote ${target}`);
}
process.exit(failed ? 1 : 0);

function typeset(json: string, target: string): void {
  const dir = mkdtempSync(join(tmpdir(), 'press-'));
  const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
  try {
    writeFileSync(join(dir, 'doc.json'), json);
    copyFileSync(here('./render/press.typ'), join(dir, 'press.typ'));
    const entry = join(dir, 'press.typ');
    const common = ['--root', dir, '--font-path', here('../assets/fonts/ttf'), '--ignore-system-fonts'];
    const settled = settleChoices(entry, common);
    for (const title of unfitSections(settled.reports)) {
      console.error(`warning: section "${title}" is too long to keep on one page; it flows normally.`);
    }
    execFileSync(
      'typst',
      ['compile', ...common, '--input', `choices=${JSON.stringify(settled.choices)}`, entry, target],
      { stdio: 'inherit' },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function settleChoices(entry: string, common: string[]): { choices: Choices; reports: Report[] } {
  let choices: Choices = {};
  let reports = fitReports(entry, common, choices);
  for (let round = 1; ; round++) {
    const next = settle(reports, choices);
    if (next === 'settled') return { choices, reports };
    if (round === MAX_ROUNDS) {
      console.error('warning: the layout did not settle; the last layout is used.');
      return { choices, reports };
    }
    choices = next;
    reports = fitReports(entry, common, choices);
  }
}

function fitReports(entry: string, common: string[], choices: Choices): Report[] {
  const out = execFileSync(
    'typst',
    [
      'eval',
      '--in',
      entry,
      ...common,
      '--input',
      `choices=${JSON.stringify(choices)}`,
      'query(<press-fit>).map(m => m.value)',
    ],
    { encoding: 'utf8' },
  );
  return parseReports(out);
}
