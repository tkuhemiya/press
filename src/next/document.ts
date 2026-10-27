import MarkdownIt from 'markdown-it';
import type { Token } from 'markdown-it';
import type { Diagnostic, Diagram, DiagramId, DiagramType, Html, NodeTarget, PropTarget, Ref, Role } from './model.ts';
import { definition } from './diagram.ts';
import { formsElsewhere, GRAMMARS, isDiagramType } from './grammars.ts';
import { parseFence } from './grammar.ts';
import { closest, into, list } from './diagnostics.ts';
import { diagramId, nodeId, trusted } from './brand.ts';

export interface Figure {
  domId: string;
  diagram: Diagram;
  refs: Ref[];
}

export interface Document {
  title?: string;
  figures: Figure[];
  refs: Ref[];
  diagnostics: Diagnostic[];
}

export interface Weave {
  figure(figure: Figure): Html;
  refOpen(ref: Ref, figure: Figure): Html;
}

interface Parsed {
  md: InstanceType<typeof MarkdownIt>;
  tokens: Token[];
  figures: WeakMap<Token, Figure>;
  refs: WeakMap<Token, Ref>;
}

const parsed = new WeakMap<Document, Parsed>();

const REF = /^#([a-z0-9_]+(?:-[a-z0-9_]+)*)\.(.+)$/;
const TYPES: DiagramType[] = Object.keys(GRAMMARS).filter(isDiagramType);

export function parseDocument(source: string): Document {
  const md = new MarkdownIt({ html: false, linkify: false, typographer: true });
  const diagnostics: Diagnostic[] = [];
  const report = into(diagnostics);
  const inline = (text: string): Html => trusted(md.renderInline(text));
  const tokens = md.parse(source, {});
  const figures: Figure[] = [];
  const figureAt = new WeakMap<Token, Figure>();
  const byId = new Map<DiagramId, Figure>();
  let title: string | undefined;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!title && t.type === 'heading_open' && t.tag === 'h1') title = tokens[i + 1]?.content;
    if (t.type !== 'fence') continue;
    const info = t.info.trim();
    const lang = info.split(/\s+/)[0] ?? '';
    const line = (t.map?.[0] ?? 0) + 1;
    if (!isDiagramType(lang)) {
      const near = closest(lang, TYPES);
      if (near && lang && near !== lang)
        report.warn(
          line,
          `\`${lang}\` is not a Press diagram type, so this fence renders as code.`,
          `Did you mean \`${near}\`? Diagram types: ${list(TYPES)}.`,
        );
      continue;
    }
    const fence = parseFence(
      { type: lang, info, body: t.content, line, grammar: GRAMMARS[lang], inline, formsElsewhere },
      report,
    );
    const diagram: Diagram = definition(lang).build(fence, report);
    const figure: Figure = {
      domId: diagram.id ? `press-${diagram.id}` : `press-figure-${figures.length + 1}`,
      diagram,
      refs: [],
    };
    figureAt.set(t, figure);
    figures.push(figure);
    if (diagram.id) {
      const earlier = byId.get(diagram.id);
      if (earlier)
        report.error(
          line,
          `Diagram id \`${diagram.id}\` is already used on line ${earlier.diagram.line}.`,
          'Give each diagram its own id.',
        );
      else byId.set(diagram.id, figure);
    }
  }

  const refs: Ref[] = [];
  const refAt = new WeakMap<Token, Ref>();
  const letters = new Map<Figure, Map<string, string>>();
  for (const block of tokens) {
    if (block.type !== 'inline' || !block.children) continue;
    let line = (block.map?.[0] ?? 0) + 1;
    for (const child of block.children) {
      if (child.type === 'softbreak' || child.type === 'hardbreak') line++;
      if (child.type !== 'link_open') continue;
      const href = String(child.attrGet('href') ?? '');
      const m = REF.exec(href);
      if (!m) continue;
      const [, id, name] = m;
      const figure = byId.get(diagramId(id));
      if (!figure) {
        const near = closest(id, byId.keys());
        report.error(
          line,
          `Reference \`${href}\` names diagram \`${id}\`, which does not exist.`,
          near
            ? `Did you mean \`#${near}.${name}\`?`
            : byId.size
              ? `Diagrams with ids: ${list(byId.keys())}.`
              : 'Give the diagram an id in its fence header: ```state-machine id=order```.',
        );
        continue;
      }
      const named = targets(figure.diagram);
      const target = named.get(name);
      if (!target) {
        const near = closest(name, named.keys());
        report.error(
          line,
          `Reference \`${href}\` names \`${name}\`, which is not in diagram \`${id}\`.`,
          near ? `Did you mean \`#${id}.${near}\`?` : `Nodes in \`${id}\`: ${list(named.keys())}.`,
        );
        continue;
      }
      let perFigure = letters.get(figure);
      if (!perFigure) letters.set(figure, (perFigure = new Map()));
      let marker = perFigure.get(name);
      if (!marker) perFigure.set(name, (marker = letter(perFigure.size)));
      const ref: Ref = { diagram: diagramId(id), target, marker, line };
      refAt.set(child, ref);
      refs.push(ref);
      figure.refs.push(ref);
    }
  }

  diagnostics.sort((a, b) => a.line - b.line);
  const doc: Document = { figures, refs, diagnostics };
  if (title !== undefined) doc.title = title;
  parsed.set(doc, { md, tokens, figures: figureAt, refs: refAt });
  return doc;
}

export function renderDocument(doc: Document, weave: Weave): Html {
  const p = parsed.get(doc);
  if (!p) throw new Error('renderDocument needs a document from parseDocument.');
  const { md, tokens } = p;
  const byId = new Map(doc.figures.flatMap((f) => (f.diagram.id ? [[f.diagram.id, f] as const] : [])));
  const rules = md.renderer.rules;
  const defaultFence = rules.fence;
  rules.fence = (all, idx, opts, env, self) => {
    const figure = p.figures.get(all[idx]);
    if (figure) return weave.figure(figure);
    return defaultFence ? defaultFence(all, idx, opts, env, self) : self.renderToken(all, idx, opts);
  };
  const defaultLink = rules.link_open;
  rules.link_open = (all, idx, opts, env, self) => {
    const ref = p.refs.get(all[idx]);
    const figure = ref && byId.get(ref.diagram);
    if (ref && figure) return weave.refOpen(ref, figure);
    return defaultLink ? defaultLink(all, idx, opts, env, self) : self.renderToken(all, idx, opts);
  };
  try {
    return trusted(md.renderer.render(tokens, md.options, {}));
  } finally {
    rules.fence = defaultFence;
    rules.link_open = defaultLink;
  }
}

export function targetName(t: NodeTarget | PropTarget): string {
  return t.type === 'node' ? t.id : `${t.node}.${t.key}`;
}

export function targets(d: Diagram): Map<string, NodeTarget | PropTarget> {
  const out = new Map<string, NodeTarget | PropTarget>();
  const node = (id: string) => out.set(id, { type: 'node', id: nodeId(id) });
  const prop = (owner: string, key: string) =>
    out.set(`${owner}.${key}`, { type: 'prop', node: nodeId(owner), key: nodeId(key) });
  if (d.type === 'tradeoffs') {
    for (const n of [...d.options, ...d.criteria]) node(n.id);
    for (const c of d.cells) prop(c.option, c.criterion);
    return out;
  }
  for (const n of d.nodes) node(n.id);
  if (d.type === 'er') for (const n of d.nodes) for (const f of n.fields) prop(n.id, f.name);
  return out;
}

export function targetRole(d: Diagram, t: NodeTarget | PropTarget): Role | undefined {
  if (d.type === 'tradeoffs')
    return t.type === 'node'
      ? [...d.options, ...d.criteria].find((n) => n.id === t.id)?.role
      : d.cells.find((c) => c.option === t.node && c.criterion === t.key)?.role;
  if (d.type === 'er')
    return t.type === 'node'
      ? d.nodes.find((n) => n.id === t.id)?.role
      : d.nodes.find((n) => n.id === t.node)?.fields.find((f) => f.name === t.key)?.role;
  return t.type === 'node' ? d.nodes.find((n) => n.id === t.id)?.role : undefined;
}

function letter(n: number): string {
  let s = '';
  n++;
  while (n > 0) {
    n--;
    s = String.fromCharCode(97 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}
