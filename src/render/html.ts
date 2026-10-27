import { readFileSync } from 'node:fs';
import { targetName, type Direction } from '../model.ts';
import { renderDocument, type Document, type Figure } from '../parse/document.ts';
import { view, type RenderContext, type Rendered, type View } from '../diagrams/diagram.ts';
import { trusted } from '../brand.ts';
import { esc } from './svg.ts';

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
      `@font-face{font-family:"${family}";font-weight:${weight};font-style:${style};font-display:swap;src:url(data:font/woff2;base64,${asset(`../../assets/fonts/${file}`).toString('base64')}) format("woff2")}`,
  ).join('\n');
  return fontCss;
}

export interface HtmlOptions {
  embedFonts?: boolean;
}

export function renderHtml(doc: Document, options: HtmlOptions = {}): string {
  const body = renderDocument(doc, {
    figure: (f) => trusted(figure(f)),
    refOpen(ref, f) {
      const v = view(f.diagram);
      const t = ref.target;
      const marker = `data-marker="${esc(ref.marker)}"`;
      if (t.type === 'edge') {
        const ends = v.ends(t.index) ?? [];
        return trusted(
          `<a class="pr-ref" href="#${f.domId}" data-figure="${f.domId}" data-edge="${t.index}" ${marker} data-near-nodes="${esc(ends.join(' '))}">`,
        );
      }
      const name = targetName(t);
      const role = v.targets().find((p) => targetName(p.target) === name)?.role;
      const members = t.type === 'edges' ? v.members(t.id) : undefined;
      const near = members
        ? ` data-near-edges="${members.edges.join(' ')}" data-near-nodes="${esc(members.nodes.join(' '))}"`
        : '';
      return trusted(
        `<a class="pr-ref" href="#${f.domId}-node-${esc(name)}" data-figure="${f.domId}" data-node="${esc(name)}" ${marker}${near}${role ? ` data-role="${role}"` : ''}>`,
      );
    },
  });
  const css = asset('./style.css').toString();
  const js = asset('./client.js').toString();
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Press 0.3">
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

function draw(v: View, f: Figure, domId: string, direction?: Direction): Rendered {
  const markers = new Map(f.refs.map((r) => [targetName(r.target), r.marker]));
  const context: RenderContext = { domId, marker: (t) => markers.get(targetName(t)) };
  if (direction !== undefined) context.direction = direction;
  return v.render(context);
}

interface StepJson {
  node?: string;
  edge?: number;
  edges?: number[];
  nodes?: string[];
  from?: string;
  to?: string;
  caption: string;
  html: string;
  trail?: number[];
}

function figure(f: Figure): string {
  const d = f.diagram;
  const v = view(d);
  const figId = f.domId;
  let drawn: Rendered;
  try {
    drawn = screenLayout(v, f);
  } catch (err) {
    return `<pre class="pr-error">Press could not draw the ${d.type} on line ${d.line}: ${esc(err instanceof Error ? err.message : String(err))}</pre>\n`;
  }
  const label = d.title ?? `${v.name} diagram`;
  const anchor = d.id ?? figId.replace(/^press-/, '');
  const steps = d.steps.map((s, i): StepJson => {
    const t = s.target;
    let step: StepJson;
    if (t.type === 'edge') {
      const ends = v.ends(t.index);
      step = ends
        ? { edge: t.index, from: ends[0], to: ends[1], caption: s.caption, html: s.caption }
        : { edge: t.index, caption: s.caption, html: s.caption };
    } else {
      step = { node: targetName(t), caption: s.caption, html: s.caption };
      const members = t.type === 'edges' ? v.members(t.id) : undefined;
      if (members) {
        step.edges = members.edges;
        step.nodes = members.nodes;
      }
    }
    const trail = v.trail(i);
    if (trail) step.trail = trail;
    return step;
  });
  let out = `<figure class="pr-figure" id="${figId}" data-type="${d.type}" data-anchor="${esc(anchor)}"${steps.length ? ' data-steps tabindex="0"' : ''} aria-label="${esc(label)}">\n`;
  if (d.title) out += `<figcaption class="pr-title">${esc(d.title)}</figcaption>\n`;
  const svg = drawn.svg.replace('role="img"', `role="img" aria-label="${esc(label)}"`);
  out += `<div class="pr-body"><div class="pr-canvas">${svg}</div>`;
  if (steps.length)
    out += `<ol class="pr-legend">${steps.map((s, i) => `<li><b>${i + 1}</b><span>${s.html}</span></li>`).join('')}</ol>`;
  out += `</div>\n`;
  if (steps.length) {
    out += `<script type="application/json" class="pr-steps">${JSON.stringify(steps).replace(/</g, '\\u003c')}</script>\n`;
    out += `<div class="pr-walk" hidden><span class="pr-count"></span><div class="pr-caption"><span><span class="pr-hint">${steps.length} steps · use ← → to step through</span></span></div><div class="pr-track"></div><button class="pr-btn" data-act="prev" aria-label="Previous step"><svg viewBox="0 0 16 16"><path d="M10 3.5 5.5 8 10 12.5"/></svg></button><button class="pr-btn pr-primary" data-act="next">Walk through</button></div>\n`;
  }
  return out + `</figure>\n`;
}

const DIRECTIONS: Direction[] = ['right', 'down'];

const SCREEN_W = 870;
const SCREEN_H = 1000;
const screenScale = (r: Rendered): number => Math.min(1, SCREEN_W / r.width, SCREEN_H / r.height);

function screenLayout(v: View, f: Figure): Rendered {
  const drawn = draw(v, f, f.domId);
  if (!v.turnable() || screenScale(drawn) >= 0.9) return drawn;
  let best = drawn;
  for (const direction of DIRECTIONS) {
    const r = draw(v, f, f.domId, direction);
    if (screenScale(r) > screenScale(best) * 1.25) best = r;
  }
  return best;
}
