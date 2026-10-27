import { readFileSync } from 'node:fs';
import type { Diagram, DiagramType } from '../model.ts';
import type { PressDocument } from '../parse/document.ts';
import { renderArchitecture } from '../diagrams/architecture.ts';
import { renderCausalLoop } from '../diagrams/causal-loop.ts';
import { renderDecisionTree } from '../diagrams/decision-tree.ts';
import { renderEr } from '../diagrams/er.ts';
import { renderSequence } from '../diagrams/sequence.ts';
import { renderStateMachine } from '../diagrams/state-machine.ts';
import { renderTradeoffs } from '../diagrams/tradeoffs.ts';
import { esc, type Rendered } from './svg.ts';
import { TYPE_SPECS } from '../diagrams/types.ts';
import { renderAny, withoutMutedAny } from '../next/diagram.ts';
import { isMigrated, legacy, type Migrated } from '../next/bridge.ts';

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
  const defaultLink =
    md.renderer.rules.link_open ?? ((tokens, idx, opts, _env, self) => self.renderToken(tokens, idx, opts));
  md.renderer.rules.link_open = (tokens, idx, opts, env, self) => {
    const ref = tokens[idx].meta?.ref as { diagram: string; node: string; marker: string } | undefined;
    if (!ref) return defaultLink(tokens, idx, opts, env, self);
    const diagram = byId.get(ref.diagram)!;
    const figId = figureIds.get(diagram)!;
    const role = (
      diagram.nodes.find((x) => x.id === ref.node) ?? diagram.props.find((p) => `${p.node}.${p.key}` === ref.node)
    )?.role;
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

const RENDERERS: Record<
  Exclude<DiagramType, Migrated>,
  (d: Diagram, markers: Map<string, string>, domId: string) => Rendered
> = {
  'state-machine': renderStateMachine,
  sequence: renderSequence,
  architecture: renderArchitecture,
  'causal-loop': renderCausalLoop,
  'decision-tree': renderDecisionTree,
  er: renderEr,
  tradeoffs: renderTradeoffs,
};
const TYPE_NAMES: Record<DiagramType, string> = {
  'state-machine': 'State machine',
  sequence: 'Sequence',
  architecture: 'Architecture',
  'causal-loop': 'Causal loop',
  timeline: 'Timeline',
  'decision-tree': 'Decision tree',
  er: 'Entity-relationship',
  tradeoffs: 'Tradeoffs',
};

function draw(d: Diagram, markers: Map<string, string>, domId: string): Rendered {
  if (!d.typed) {
    if (isMigrated(d.type)) throw new Error(`The ${d.type} has no model to draw from.`);
    return RENDERERS[d.type](d, markers, domId);
  }
  const typed = d.direction === undefined ? d.typed : { ...d.typed, direction: d.direction };
  return renderAny(typed, { domId, marker: (t) => markers.get(t.type === 'node' ? t.id : `${t.node}.${t.key}`) });
}

function figure(doc: PressDocument, d: Diagram, figId: string): string {
  const markers = new Map<string, string>();
  for (const r of doc.refs) if (r.diagram === d.id) markers.set(r.node, r.marker);
  let drawn: Rendered;
  try {
    drawn = screenLayout(d, markers, figId);
  } catch (err) {
    return `<pre class="pr-error">Press could not draw the ${d.type} on line ${d.line}: ${esc(String((err as Error).message ?? err))}</pre>\n`;
  }
  const label = d.title ?? `${TYPE_NAMES[d.type]} diagram`;
  const anchor = d.id ?? figId.replace(/^press-/, '');
  const steps = d.steps.map((s) => {
    const html = d.typed ? s.caption : doc.md.renderInline(s.caption);
    if (s.target.type === 'node') return { node: s.target.id, caption: s.caption, html };
    const e = d.edges[s.target.index];
    return {
      edge: e.index,
      from: e.fromKey ? `${e.from}.${e.fromKey}` : e.from,
      to: e.toKey ? `${e.to}.${e.toKey}` : e.to,
      caption: s.caption,
      html,
    };
  });
  if (d.type === 'decision-tree') steps.forEach((step, i) => Object.assign(step, { trail: treeTrail(d, i) }));
  let out = `<figure class="pr-figure" id="${figId}" data-type="${d.type}" data-anchor="${esc(anchor)}"${steps.length ? ' data-steps tabindex="0"' : ''} aria-label="${esc(label)}">\n`;
  if (d.title) out += `<figcaption class="pr-title">${esc(d.title)}</figcaption>\n`;
  const paper = printVariant(d, drawn, markers, figId);
  const svg = (r: Rendered, cls = '') =>
    r.svg
      .replace('role="img"', `role="img" aria-label="${esc(label)}"`)
      .replace(/^<svg class="([^"]*)"/, `<svg class="$1${cls}"`);
  out += `<div class="pr-body"><div class="pr-canvas">${paper ? svg(drawn, ' pr-screen-only') + svg(paper, ' pr-print-only') : svg(drawn)}</div>`;
  if (steps.length)
    out += `<ol class="pr-legend">${steps.map((s, i) => `<li><b>${i + 1}</b><span>${s.html}</span></li>`).join('')}</ol>`;
  out += `</div>\n`;
  if (steps.length) {
    out += `<script type="application/json" class="pr-steps">${JSON.stringify(steps).replace(/</g, '\\u003c')}</script>\n`;
    out += `<div class="pr-walk" hidden><span class="pr-count"></span><div class="pr-caption"><span><span class="pr-hint">${steps.length} steps · use ← → to step through</span></span></div><div class="pr-track"></div><button class="pr-btn" data-act="prev" aria-label="Previous step"><svg viewBox="0 0 16 16"><path d="M10 3.5 5.5 8 10 12.5"/></svg></button><button class="pr-btn pr-primary" data-act="next">Walk through</button></div>\n`;
  }
  return out + `</figure>\n`;
}

const SCREEN_W = 870;
const SCREEN_H = 1000;
const screenScale = (r: Rendered): number => Math.min(1, SCREEN_W / r.width, SCREEN_H / r.height);

function screenLayout(d: Diagram, markers: Map<string, string>, figId: string): Rendered {
  const drawn = draw(d, markers, figId);
  if (d.direction !== undefined || !TYPE_SPECS[d.type].directional || screenScale(drawn) >= 0.9) return drawn;
  let best = drawn;
  for (const direction of ['right', 'down'] as const) {
    const r = draw({ ...d, direction }, markers, figId);
    if (screenScale(r) > screenScale(best) * 1.25) best = r;
  }
  return best;
}

const PAGE_W = ((210 - 34) / 25.4) * 96;
const PAGE_H = ((297 - 38) / 25.4) * 96 * 0.62;
const printScale = (r: Rendered): number => Math.min(1, PAGE_W / r.width, PAGE_H / r.height);

function printVariant(d: Diagram, drawn: Rendered, markers: Map<string, string>, figId: string): Rendered | undefined {
  const scale = printScale(drawn);
  if (scale >= 0.85) return undefined;
  const directions: Diagram['direction'][] =
    d.direction === undefined && TYPE_SPECS[d.type].directional ? ['right', 'down'] : [d.direction];
  const lean = withoutMuted(d, markers);
  let best: { r: Rendered; scale: number } | undefined;
  for (const base of lean ? [d, lean] : [d]) {
    for (const direction of directions) {
      let r: Rendered;
      try {
        r = draw({ ...base, direction }, markers, `${figId}-paper`);
      } catch {
        continue;
      }
      const s = printScale(r) * (base === d ? 1 : 0.85);
      if (!best || s > best.scale) best = { r, scale: s };
    }
  }
  return best && best.scale > scale * 1.15 ? best.r : undefined;
}

function withoutMuted(d: Diagram, markers: Map<string, string>): Diagram | undefined {
  if (d.typed?.type === 'timeline') {
    const lean = withoutMutedAny(d.typed, (id) => [...markers.keys()].some((m) => m.split('.')[0] === id));
    return lean?.type === 'timeline' ? legacy(lean) : undefined;
  }
  if (d.loops.length || d.type === 'tradeoffs') return undefined;
  const drop = new Set(d.nodes.filter((node) => node.role === 'muted').map((node) => node.id));
  const keep = d.edges.filter((e) => e.role !== 'muted' && !drop.has(e.from) && !drop.has(e.to));
  if (!drop.size && keep.length === d.edges.length) return undefined;
  const kept = new Set(keep.map((e) => e.index));
  for (const s of d.steps) {
    if (s.target.type === 'edge' && !kept.has(s.target.index)) return undefined;
    if (s.target.type === 'node' && drop.has(s.target.id.split('.')[0])) return undefined;
  }
  for (const id of markers.keys()) if (drop.has(id.split('.')[0])) return undefined;
  const index = new Map(keep.map((e, i) => [e.index, i]));
  const nodes = d.nodes.filter((node) => !drop.has(node.id));
  const used = new Set<number>();
  for (const node of nodes) for (let g = node.group; g >= 0; g = d.groups[g].parent) used.add(g);
  const groupIndex = new Map([...used].sort((a, b) => a - b).map((g, i) => [g, i]));
  const group = (g: number) => (g < 0 ? -1 : groupIndex.get(g)!);
  return {
    ...d,
    nodes: nodes.map((node) => ({ ...node, group: group(node.group) })),
    edges: keep.map((e, i) => ({ ...e, index: i })),
    groups: [...groupIndex.keys()].map((g) => ({ ...d.groups[g], parent: group(d.groups[g].parent) })),
    props: d.props.filter((p) => !drop.has(p.node)),
    steps: d.steps.map((s) =>
      s.target.type === 'edge' ? { ...s, target: { type: 'edge' as const, index: index.get(s.target.index)! } } : s,
    ),
  };
}

function treeTrail(d: Diagram, i: number): number[] {
  const step = d.steps[i].target;
  const here = step.type === 'node' ? step.id : d.edges[step.index].from;
  const above = new Set([here]);
  for (let grew = true; grew;) {
    grew = false;
    for (const e of d.edges) if (above.has(e.to) && !above.has(e.from)) grew = !!above.add(e.from);
  }
  const reached = (t: (typeof d.steps)[number]['target']) =>
    t.type === 'node' ? above.has(t.id) : above.has(d.edges[t.index].to);
  return d.steps.slice(0, i).flatMap((s, k) => (reached(s.target) ? [k] : []));
}
