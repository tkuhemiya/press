// Renders a parsed Press document to one self-contained HTML page.
import { readFileSync } from 'node:fs';
import type { Diagram, DiagramType } from '../model.ts';
import type { PressDocument } from '../parse/document.ts';
import { renderArchitecture } from '../diagrams/architecture.ts';
import { renderSequence } from '../diagrams/sequence.ts';
import { renderStateMachine } from '../diagrams/state-machine.ts';
import { renderTimeline } from '../diagrams/timeline.ts';
import { esc, type Rendered } from './svg.ts';

const asset = (path: string): Buffer => readFileSync(new URL(path, import.meta.url));

const FONTS: [string, number, string, string][] = [
  ['Inter', 400, 'normal', 'inter-latin-400-normal.woff2'],
  ['Inter', 500, 'normal', 'inter-latin-500-normal.woff2'],
  ['Inter', 600, 'normal', 'inter-latin-600-normal.woff2'],
  ['Source Serif 4', 400, 'normal', 'source-serif-4-latin-400-normal.woff2'],
  ['Source Serif 4', 400, 'italic', 'source-serif-4-latin-400-italic.woff2'],
  ['Source Serif 4', 600, 'normal', 'source-serif-4-latin-600-normal.woff2'],
  ['JetBrains Mono', 400, 'normal', 'jetbrains-mono-latin-400-normal.woff2'],
];

let fontCss: string | undefined;
function fonts(): string {
  fontCss ??= FONTS.map(
    ([family, weight, style, file]) =>
      `@font-face{font-family:"${family}";font-weight:${weight};font-style:${style};font-display:swap;src:url(data:font/woff2;base64,${asset(`../../assets/fonts/${file}`).toString('base64')}) format("woff2")}`
  ).join('\n');
  return fontCss;
}

export interface HtmlOptions {
  // Leave the fonts out of the page and rely on installed ones; for tests and snapshots.
  embedFonts?: boolean;
}

export function renderHtml(doc: PressDocument, options: HtmlOptions = {}): string {
  const md = doc.md;
  const figureIds = new Map<Diagram, string>();
  doc.diagrams.forEach((d, i) => figureIds.set(d, d.id ? `press-${d.id}` : `press-figure-${i + 1}`));
  const byId = new Map(doc.diagrams.filter((d) => d.id).map((d) => [d.id!, d]));

  const defaultFence = md.renderer.rules.fence!;
  md.renderer.rules.fence = (tokens, idx, opts, env, self) => {
    const diagram = tokens[idx].meta?.diagram as Diagram | undefined;
    if (!diagram) return defaultFence(tokens, idx, opts, env, self);
    return figure(doc, diagram, figureIds.get(diagram)!);
  };
  const defaultLink = md.renderer.rules.link_open ?? ((tokens, idx, opts, _env, self) => self.renderToken(tokens, idx, opts));
  md.renderer.rules.link_open = (tokens, idx, opts, env, self) => {
    const ref = tokens[idx].meta?.ref as { diagram: string; node: string; marker: string } | undefined;
    if (!ref) return defaultLink(tokens, idx, opts, env, self);
    const diagram = byId.get(ref.diagram)!;
    const figId = figureIds.get(diagram)!;
    const role = diagram.nodes.find((x) => x.id === ref.node)?.role;
    return `<a class="pr-ref" href="#${figId}-node-${esc(ref.node)}" data-figure="${figId}" data-node="${esc(ref.node)}" data-marker="${esc(ref.marker)}"${role ? ` data-role="${role}"` : ''}>`;
  };

  const body = md.renderer.render(doc.tokens, md.options, {});
  const css = asset('./style.css').toString();
  const js = asset('./client.js').toString();
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Press 0.2">
<title>${esc(doc.title ?? 'Press')}</title>
<style>
${options.embedFonts === false ? '' : fonts()}
${css}
</style>
</head>
<body>
<main class="press">
${body}</main>
<script>
${js}
</script>
</body>
</html>
`;
}

const RENDERERS: Record<DiagramType, (d: Diagram, markers: Map<string, string>, domId: string) => Rendered> = {
  'state-machine': renderStateMachine,
  sequence: renderSequence,
  architecture: renderArchitecture,
  'causal-loop': renderArchitecture,
  timeline: renderTimeline,
};
const TYPE_NAMES: Record<DiagramType, string> = { 'state-machine': 'State machine', sequence: 'Sequence', architecture: 'Architecture', 'causal-loop': 'Causal loop', timeline: 'Timeline' };

function figure(doc: PressDocument, d: Diagram, figId: string): string {
  const markers = new Map<string, string>();
  for (const r of doc.refs) if (r.diagram === d.id) markers.set(r.node, r.marker);
  let drawn: Rendered;
  try {
    drawn = RENDERERS[d.type](d, markers, figId);
  } catch (err) {
    return `<pre class="pr-error">Press could not draw the ${d.type} on line ${d.line}: ${esc(String((err as Error).message ?? err))}</pre>\n`;
  }
  const label = d.title ?? `${TYPE_NAMES[d.type]} diagram`;
  const anchor = d.id ?? figId.replace(/^press-/, '');
  const steps = d.steps.map((s) => {
    const html = doc.md.renderInline(s.caption);
    if (s.target.type === 'node') return { node: s.target.id, caption: s.caption, html };
    const e = d.edges[s.target.index];
    return { edge: e.index, from: e.from, to: e.to, caption: s.caption, html };
  });
  let out = `<figure class="pr-figure" id="${figId}" data-type="${d.type}" data-anchor="${esc(anchor)}"${steps.length ? ' data-steps tabindex="0"' : ''} aria-label="${esc(label)}">\n`;
  if (d.title) out += `<figcaption class="pr-title">${esc(d.title)}</figcaption>\n`;
  out += `<div class="pr-body"><div class="pr-canvas">${drawn.svg.replace('role="img"', `role="img" aria-label="${esc(label)}"`)}</div>`;
  if (steps.length) out += `<ol class="pr-legend">${steps.map((s, i) => `<li><b>${i + 1}</b><span>${s.html}</span></li>`).join('')}</ol>`;
  out += `</div>\n`;
  if (steps.length) {
    out += `<script type="application/json" class="pr-steps">${JSON.stringify(steps).replace(/</g, '\\u003c')}</script>\n`;
    out += `<div class="pr-walk" hidden><span class="pr-count"></span><div class="pr-caption"><span><span class="pr-hint">${steps.length} steps · use ← → to step through</span></span></div><div class="pr-track"></div><button class="pr-btn" data-act="prev" aria-label="Previous step"><svg viewBox="0 0 16 16"><path d="M10 3.5 5.5 8 10 12.5"/></svg></button><button class="pr-btn pr-primary" data-act="next">Walk through</button></div>\n`;
  }
  return out + `</figure>\n`;
}
