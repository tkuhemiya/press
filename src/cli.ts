#!/usr/bin/env node

import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, formatDiagnostic } from './index.ts';
import { pagedImageOutputs, pagedImagePath, printFigureCount, typstDocument } from './render/typst.ts';
import { ICON_VENDORS, iconNames, isVendor } from './icons.ts';
import { renderTerminal } from './render/terminal.ts';
import type { ThemeName } from './render/term/theme.ts';
import { parseReports, settle, unfitSections, type Choices, type Report } from './render/settle.ts';

const USAGE = `Usage:
  press build <file.md> -o out.html | out.pdf | out.png | out.svg
                                                            Render to HTML, typeset to PDF, or draw each
                                                            figure as a tight PNG/SVG (PNG/SVG/PDF need typst)
  press build <file.md> -o out.png [--ppi 144]              PNG density, 72–600 (default 144)
  press build <file.md...> --out-dir dir                    Render each file to HTML
  press check <file.md...>                                  Report problems only
  press preview <file.md...> [--width N] [--theme dark|light|plain] [--ascii]
                                                            Render to the terminal, like glamour
  press icons [aws|azure|gcp|k8s] [word]                    List icon names, optionally only those containing word`;

const MAX_ROUNDS = 50;
const DEFAULT_PPI = 144;

const args = process.argv.slice(2);
const command = args.shift();
let out: string | undefined;
let outDir: string | undefined;
let width: number | undefined;
let theme: string | undefined;
let ppi: number | undefined;
let ascii = false;
const files: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '-o' || args[i] === '--out') out = args[++i];
  else if (args[i] === '--out-dir') outDir = args[++i];
  else if (args[i] === '--width') width = Number(args[++i]);
  else if (args[i] === '--theme') theme = args[++i];
  else if (args[i] === '--ppi') ppi = Number(args[++i]);
  else if (args[i] === '--ascii') ascii = true;
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

if (command === 'preview') {
  if (!files.length) {
    console.error(USAGE);
    process.exit(2);
  }
  if (theme !== undefined && !isTheme(theme)) {
    console.error(`Unknown theme \`${theme}\`. Themes: dark, light, plain.`);
    process.exit(2);
  }
  const tty = process.stdout.isTTY === true;
  const colour = !process.env.NO_COLOR && (tty || Boolean(process.env.FORCE_COLOR));
  const name: ThemeName = theme ?? (colour ? 'dark' : 'plain');
  const columns = width ?? (tty ? Math.min(process.stdout.columns || 80, 100) : 80);
  let failed = false;
  for (const file of files) {
    const document = build(readFileSync(file, 'utf8')).document;
    for (const d of document.diagnostics) console.error(formatDiagnostic(d, file));
    if (document.diagnostics.some((d) => d.severity === 'error')) failed = true;
    process.stdout.write(renderTerminal(document, { width: columns, theme: name, ascii, links: tty }) + '\n');
  }
  process.exit(failed ? 1 : 0);
}

function isTheme(t: string): t is ThemeName {
  return t === 'dark' || t === 'light' || t === 'plain';
}

if (!command || !['build', 'check'].includes(command) || !files.length) {
  console.error(USAGE);
  process.exit(command === 'help' || command === '--help' ? 0 : 2);
}
if (out && files.length > 1) {
  console.error('-o takes one input file; use --out-dir for several.');
  process.exit(2);
}
const ext = out ? /\.(html?|pdf|png|svg)$/i.exec(out)?.[1]?.toLowerCase() : 'html';
const format = ext === 'htm' ? 'html' : ext;
if (command === 'build' && !format) {
  console.error(`Cannot tell the output format from \`${out}\`: end it in .html, .pdf, .png or .svg.`);
  process.exit(2);
}
if (ppi !== undefined && format !== 'png') {
  console.error('--ppi applies to PNG output only.');
  process.exit(2);
}
if (ppi !== undefined && (!Number.isInteger(ppi) || ppi < 72 || ppi > 600)) {
  console.error('--ppi must be an integer from 72 to 600.');
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
  if ((format === 'pdf' || format === 'png' || format === 'svg') && out) {
    const n = printFigureCount(result.document);
    if ((format === 'png' || format === 'svg') && n === 0) {
      console.error(`error: \`${file}\` has no figures to draw.`);
      failed = true;
      continue;
    }
    const written = typeset(
      JSON.stringify(typstDocument(result.document)),
      resolve(out),
      format,
      n,
      ppi ?? DEFAULT_PPI,
    );
    for (const path of written) console.error(`wrote ${path}`);
    continue;
  }
  const target = out ?? join(outDir ?? '.', `${stem}.html`);
  if (outDir) mkdirSync(outDir, { recursive: true });
  writeFileSync(target, result.html);
  console.error(`wrote ${target}`);
}
process.exit(failed ? 1 : 0);

function typeset(json: string, target: string, format: string, figures: number, density: number): string[] {
  requireTypst(format);
  const dir = mkdtempSync(join(tmpdir(), 'press-'));
  const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
  try {
    writeFileSync(join(dir, 'doc.json'), json);
    copyFileSync(here('./render/press.typ'), join(dir, 'press.typ'));
    const entry = join(dir, 'press.typ');
    const common = ['--root', dir, '--font-path', here('../assets/fonts/ttf'), '--ignore-system-fonts'];
    const extra: string[] = format === 'pdf' ? [] : ['--input', 'mode=image'];
    if (format === 'png') extra.push('--ppi', String(density));
    const choices = format === 'pdf' ? settlePdf(entry, common) : '{}';
    const dest = format === 'pdf' ? target : pagedImagePath(target, figures);
    execFileSync('typst', ['compile', ...common, ...extra, '--input', `choices=${choices}`, entry, dest], {
      stdio: 'inherit',
    });
    return format === 'pdf' ? [target] : pagedImageOutputs(target, figures);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function settlePdf(entry: string, common: string[]): string {
  const settled = settleChoices(entry, common);
  for (const title of unfitSections(settled.reports)) {
    console.error(`warning: section "${title}" is too long to keep on one page; it flows normally.`);
  }
  return JSON.stringify(settled.choices);
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
    ['query', ...common, '--input', `choices=${JSON.stringify(choices)}`, '--field', 'value', entry, '<press-fit>'],
    { encoding: 'utf8' },
  );
  return parseReports(out);
}

function requireTypst(format: string): void {
  try {
    execFileSync('typst', ['--version'], { stdio: 'ignore' });
  } catch {
    const kind = format === 'pdf' ? 'PDF' : format === 'png' ? 'PNG' : 'SVG';
    console.error(
      `error: \`typst\` was not found on PATH, so the ${kind} cannot be typeset.\n` +
        '  fix: Install Typst (https://github.com/typst/typst) and put `typst` on PATH, or build HTML with `-o out.html` or `--out-dir`.',
    );
    process.exit(2);
  }
}
