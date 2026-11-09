import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { build } from '../src/index.ts';

const ROOT = new URL('..', import.meta.url);
const SOURCE = new URL('../docs/examples/diffs.md', import.meta.url);
const OUT = new URL('../docs/experiments/diff-layout/', import.meta.url);

type Mode = 'overlay' | 'before' | 'after' | 'before-marked' | 'after-marked';

interface Fence {
  type: string;
  header: string;
  body: string;
  title: string;
  id: string;
}

interface Node {
  kind: 'line' | 'block';
  text: string;
  children?: Node[];
}

const OPEN = /^(group|phase|lane)\b.*\{$/;
const MARK = /^([+-]) +(?=\S)/;

function fencesOf(source: string): Fence[] {
  const out: Fence[] = [];
  const re = /^```([a-z0-9-]+)([^\n]*)\n([\s\S]*?)^```/gm;
  for (const m of source.matchAll(re)) {
    const type = m[1];
    const header = m[2].trim();
    const body = m[3].replace(/\n$/, '');
    const id = /(?:^|\s)id=([a-z0-9_-]+)/.exec(header)?.[1] ?? type;
    const title = /title="([^"]+)"/.exec(header)?.[1] ?? id;
    out.push({ type, header, body, title, id });
  }
  return out;
}

function parse(body: string): { tree: Node[]; steps: string[] } {
  const lines = body.split('\n');
  const stepsAt = lines.findIndex((l) => l.trim() === 'steps:');
  const main = stepsAt === -1 ? lines : lines.slice(0, stepsAt);
  const steps = stepsAt === -1 ? [] : lines.slice(stepsAt);
  const walk = (from: number, stop: boolean): { nodes: Node[]; next: number } => {
    const nodes: Node[] = [];
    let i = from;
    while (i < main.length) {
      const raw = main[i];
      const text = raw.trim();
      if (stop && text === '}') return { nodes, next: i };
      if (OPEN.test(text)) {
        const inner = walk(i + 1, true);
        const close = main[inner.next];
        if (close?.trim() !== '}') throw new Error(`Unclosed block at: ${raw}`);
        nodes.push({ kind: 'block', text: raw, children: inner.nodes });
        i = inner.next + 1;
        continue;
      }
      nodes.push({ kind: 'line', text: raw });
      i += 1;
    }
    return { nodes, next: i };
  };
  return { tree: walk(0, false).nodes, steps };
}

function markOf(line: string): '+' | '-' | undefined {
  return MARK.exec(line.trim())?.[1] as '+' | '-' | undefined;
}

function keepLine(line: string, mode: Mode): boolean {
  const text = line.trim();
  if (!text || text.startsWith('#')) return true;
  const mark = markOf(line);
  if (mode === 'overlay') return true;
  if (mark === '+' && (mode === 'before' || mode === 'before-marked')) return false;
  if (mark === '-' && (mode === 'after' || mode === 'after-marked')) return false;
  return true;
}

function rewriteLine(line: string, mode: Mode): string {
  if (mode === 'overlay' || mode === 'before-marked' || mode === 'after-marked') return line;
  return line.replace(/^(\s*)[+-] +(?=\S)/, '$1');
}

function filterTree(nodes: Node[], mode: Mode): Node[] {
  const out: Node[] = [];
  for (const n of nodes) {
    if (n.kind === 'line') {
      if (keepLine(n.text, mode)) out.push({ ...n, text: rewriteLine(n.text, mode) });
      continue;
    }
    const children = filterTree(n.children ?? [], mode);
    const useful = children.some((c) => c.kind === 'block' || c.text.trim().length > 0);
    if (useful) out.push({ ...n, children });
  }
  return out;
}

function emit(nodes: Node[]): string {
  const lines: string[] = [];
  for (const n of nodes) {
    if (n.kind === 'line') {
      if (n.text.trim() === '' && lines.at(-1) === '') continue;
      lines.push(n.text);
      continue;
    }
    lines.push(n.text);
    lines.push(emit(n.children ?? []));
    lines.push('}');
  }
  return lines.join('\n');
}

function rewriteHeader(header: string, id: string, title: string): string {
  let h = header.replace(/(?:^|\s)id=[a-z0-9_-]+/, '').trim();
  if (/title="[^"]*"/.test(h)) h = h.replace(/title="[^"]*"/, `title="${title}"`);
  else h = `${h} title="${title}"`.trim();
  return `id=${id} ${h}`.trim();
}

function splitFence(fence: Fence, mode: Mode): string {
  const { tree } = parse(fence.body);
  const body = emit(filterTree(tree, mode)).trim();
  const suffix = mode === 'overlay' ? '' : `-${mode}`;
  const title = mode === 'overlay' ? fence.title : `${fence.title} (${mode.replace('-marked', ', marked')})`;
  const header = rewriteHeader(fence.header, `${fence.id}${suffix || '-overlay'}`, title);
  return `\`\`\`${fence.type} ${header}\n${body}\n\`\`\`\n`;
}

function figureHtml(source: string): { html: string; errors: string[]; css?: string } {
  const result = build(source);
  const errors = result.diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.line}: ${d.message}`);
  const css = /<style>([\s\S]*?)<\/style>/.exec(result.html)?.[1];
  const match = /<figure class="pr-figure"[\s\S]*?<\/figure>/.exec(result.html);
  return { html: match?.[0] ?? result.html, errors, css };
}

const GALLERY_CSS = `
  body { margin: 0; background: #f4f1ea; color: #1f1c16; font-family: Geist, ui-sans-serif, system-ui, sans-serif; }
  main { max-width: 1480px; margin: 0 auto; padding: 32px 24px 80px; }
  h1 { font-size: 28px; font-weight: 600; letter-spacing: -0.03em; margin: 0 0 8px; }
  .lede { font-size: 16px; line-height: 1.45; max-width: 46rem; color: #4a463c; margin: 0 0 36px; }
  h2 { font-size: 22px; margin: 48px 0 6px; letter-spacing: -0.02em; }
  .why { color: #4a463c; margin: 0 0 18px; max-width: 46rem; }
  h3 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b6558; margin: 22px 0 10px; }
  .panel { background: #fff; border: 1px solid #e4dfd2; border-radius: 12px; padding: 8px 8px 4px; overflow: visible; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: start; }
  .col h4 { margin: 0 0 8px; font-size: 13px; font-weight: 600; }
  .pr-figure {
    width: auto;
    max-width: 100%;
    margin: 0;
    translate: none;
    box-shadow: none;
  }
  .pr-canvas { overflow: visible; }
  .hide-added [data-change="added"] { visibility: hidden; }
  .hide-removed [data-change="removed"] { visibility: hidden; }
  .ghost-added [data-change="added"] { opacity: 0.2; }
  .ghost-removed [data-change="removed"] { opacity: 0.2; }
  .note { font-size: 13px; color: #6b6558; margin: 8px 0 0; }
  @media (max-width: 900px) { .pair { grid-template-columns: 1fr; } }
`;

function galleryPage(pressCss: string, sections: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Diff layout experiment</title>
<style>
${pressCss}
.press { max-width: none; margin: 0; padding: 0; }
${GALLERY_CSS}
</style>
</head>
<body>
<main>
<h1>Diff layout experiment</h1>
<p class="lede">Same Press fences, four ways of showing a change. Overlay is what Press does today. Independent split is two ordinary diagrams. Aligned split reuses the overlay layout and hides one side. Ghost keeps the missing side faded in place.</p>
${sections}
</main>
</body>
</html>
`;
}

function sectionFor(fence: Fence): { html: string; errors: string[] } {
  const errors: string[] = [];
  const take = (mode: Mode) => {
    const src = splitFence(fence, mode);
    const drawn = figureHtml(`# ${fence.title}\n\n${src}`);
    errors.push(...drawn.errors.map((e) => `${fence.id} ${mode}: ${e}`));
    return drawn.html;
  };
  const overlay = take('overlay');
  const before = take('before');
  const after = take('after');
  const beforeM = take('before-marked');
  const afterM = take('after-marked');
  const html = `
<section class="case" id="${fence.id}">
  <h2>${fence.title}</h2>
  <p class="why">${fence.type}</p>
  <h3>1. Overlay — one figure, both sides, colour for change</h3>
  <div class="panel shot" data-shot="${fence.id}-overlay">${overlay}</div>
  <h3>2. Independent split — two compact diagrams, no +/- paint</h3>
  <div class="pair shot" data-shot="${fence.id}-independent">
    <div class="col"><h4>Before</h4><div class="panel">${before}</div></div>
    <div class="col"><h4>After</h4><div class="panel">${after}</div></div>
  </div>
  <h3>3. Independent split, still marked</h3>
  <div class="pair shot" data-shot="${fence.id}-independent-marked">
    <div class="col"><h4>Before (− kept)</h4><div class="panel">${beforeM}</div></div>
    <div class="col"><h4>After (+ kept)</h4><div class="panel">${afterM}</div></div>
  </div>
  <h3>4. Aligned split — same overlay layout, other side hidden</h3>
  <div class="pair shot" data-shot="${fence.id}-aligned">
    <div class="col"><h4>Before (added hidden)</h4><div class="panel hide-added">${overlay}</div></div>
    <div class="col"><h4>After (removed hidden)</h4><div class="panel hide-removed">${overlay}</div></div>
  </div>
  <p class="note">Changed nodes stay on both panels with the after label and a “was …” note. CSS cannot recover the before label.</p>
  <h3>5. Ghost — same layout, other side faded</h3>
  <div class="pair shot" data-shot="${fence.id}-ghost">
    <div class="col"><h4>Before (added ghosted)</h4><div class="panel ghost-added">${overlay}</div></div>
    <div class="col"><h4>After (removed ghosted)</h4><div class="panel ghost-removed">${overlay}</div></div>
  </div>
</section>`;
  return { html, errors };
}

const shotsDir = join(dirname(new URL(import.meta.url).pathname), '..', 'docs/experiments/diff-layout/shots');

async function screenshots(pagePath: string) {
  mkdirSync(shotsDir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({
    viewport: { width: 1480, height: 900 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  });
  await page.goto(pathToFileURL(pagePath).href, { waitUntil: 'networkidle' });
  const shots = page.locator('.shot');
  const n = await shots.count();
  for (let i = 0; i < n; i++) {
    const el = shots.nth(i);
    const name = await el.getAttribute('data-shot');
    if (!name) continue;
    await el.screenshot({ path: join(shotsDir, `${name}.png`) });
  }
  await page.screenshot({ path: join(shotsDir, 'gallery-top.png'), fullPage: false });
  await browser.close();
}

function copyKey(src: string, dest: string) {
  writeFileSync(dest, readFileSync(src));
}

const source = readFileSync(SOURCE, 'utf8');
const fences = fencesOf(source);
const sections: string[] = [];
const errors: string[] = [];
const splitMd: string[] = ['# Split diffs (generated)\n'];
for (const fence of fences) {
  const section = sectionFor(fence);
  sections.push(section.html);
  errors.push(...section.errors);
  splitMd.push(`## ${fence.title}\n`);
  splitMd.push('### Overlay\n', splitFence(fence, 'overlay'));
  splitMd.push('### Before\n', splitFence(fence, 'before'));
  splitMd.push('### After\n', splitFence(fence, 'after'));
}

mkdirSync(new URL('.', OUT), { recursive: true });
const htmlPath = new URL('gallery.html', OUT);
const pressCss = figureHtml('```state-machine\na -> b\n```\n').css ?? '';
writeFileSync(htmlPath, galleryPage(pressCss, sections.join('\n')));
writeFileSync(new URL('split.md', OUT), splitMd.join('\n'));
writeFileSync(new URL('errors.txt', OUT), errors.join('\n') || 'none');
console.error(errors.length ? `errors:\n${errors.join('\n')}` : 'fences split cleanly');
console.error(`wrote ${htmlPath.pathname}`);

await screenshots(htmlPath.pathname);
console.error(`wrote shots to ${shotsDir}`);

const artifact = '/opt/cursor/artifacts/diff-layout';
mkdirSync(artifact, { recursive: true });
copyKey(htmlPath.pathname, join(artifact, 'gallery.html'));
for (const fence of fences) {
  for (const kind of ['overlay', 'independent', 'independent-marked', 'aligned', 'ghost']) {
    const file = join(shotsDir, `${fence.id}-${kind}.png`);
    try {
      copyKey(file, join(artifact, `${fence.id}-${kind}.png`));
    } catch {
      /* shot missing */
    }
  }
}
console.error(`copied shots to ${artifact}`);
