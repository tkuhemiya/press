import MarkdownIt from 'markdown-it';
import type { Token } from 'markdown-it';
import {
  targetName,
  type Diagnostic,
  type EdgeIndex,
  type EdgeTarget,
  type Target,
  type Diagram,
  type DiagramId,
  type DiagramType,
  type Html,
  type Ref,
} from '../model.ts';
import { definition, view } from '../diagrams/diagram.ts';
import { formsElsewhere, GRAMMARS, isDiagramType } from './grammars.ts';
import { parseFence } from './grammar.ts';
import { headingHint, type PageHint } from './heading.ts';
import { closest, into, list, type Reporter } from '../diagnostics.ts';
import { diagramId, edgeIndex, trusted } from '../brand.ts';

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
  pages: WeakMap<Token, PageHint>;
}

const parsed = new WeakMap<Document, Parsed>();

const REF = /^#([a-z0-9_]+(?:-[a-z0-9_]+)*)\.(.+)$/;
const EDGE_LINE = /^\s*[\w.]+\s*(?:->|-->|<->)\s*[\w.]+(?:\s*(?:->|-->|<->)\s*[\w.]+)*\s*(?::.*|\{.*\})?$/m;
const VERBATIM = new Set(['markdown', 'md', 'text', 'txt', 'plaintext']);
const TYPES: DiagramType[] = Object.keys(GRAMMARS).filter(isDiagramType);

export function parseDocument(source: string): Document {
  const md = new MarkdownIt({ html: false, linkify: false, typographer: true });
  const diagnostics: Diagnostic[] = [];
  const report = into(diagnostics);
  const inline = (text: string): Html => trusted(md.renderInline(text));
  const tokens = md.parse(source, {});
  const pages = takeHeadingHints(tokens, report);
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
      warnStrayFence(lang, t.content, line, report);
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
      const [, id, encoded] = m;
      const name = safeDecode(encoded);
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
      const named = new Map(
        view(figure.diagram)
          .targets()
          .map((p) => [targetName(p.target), p.target]),
      );
      const arrow = /^(.+?)\s*(?:<->|-->|->)\s*(.+)$/.exec(name);
      const target: Target | undefined = arrow
        ? edgeRef(figure, id, arrow[1], arrow[2], line, report)
        : named.get(name);
      if (!target) {
        if (!arrow) {
          const near = closest(name, named.keys());
          report.error(
            line,
            `Reference \`#${id}.${name}\` names \`${name}\`, which is not in diagram \`${id}\`.`,
            near
              ? `Did you mean \`#${id}.${near}\`?`
              : `Names in \`${id}\`: ${list(named.keys())}. Point at an edge with \`#${id}.from->to\`.`,
          );
        }
        continue;
      }
      let perFigure = letters.get(figure);
      if (!perFigure) letters.set(figure, (perFigure = new Map()));
      const key = targetName(target);
      let marker = perFigure.get(key);
      if (!marker) perFigure.set(key, (marker = letter(perFigure.size)));
      const ref: Ref = { diagram: diagramId(id), target, marker, line };
      refAt.set(child, ref);
      refs.push(ref);
      figure.refs.push(ref);
    }
  }

  diagnostics.sort((a, b) => a.line - b.line);
  const doc: Document = { figures, refs, diagnostics };
  if (title !== undefined) doc.title = title;
  parsed.set(doc, { md, tokens, figures: figureAt, refs: refAt, pages });
  return doc;
}

export interface Walk {
  tokens: readonly Token[];
  figure(token: Token): Figure | undefined;
  ref(token: Token): Ref | undefined;
  page(token: Token): PageHint | undefined;
}

export function walkDocument(doc: Document): Walk {
  const p = parsed.get(doc);
  if (!p) throw new Error('walkDocument needs a document from parseDocument.');
  return {
    tokens: p.tokens,
    figure: (t) => p.figures.get(t),
    ref: (t) => p.refs.get(t),
    page: (t) => p.pages.get(t),
  };
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

function takeHeadingHints(tokens: Token[], report: Reporter): WeakMap<Token, PageHint> {
  const pages = new WeakMap<Token, PageHint>();
  for (let i = 0; i < tokens.length - 1; i++) {
    const open = tokens[i];
    const inline = tokens[i + 1];
    if (open.type !== 'heading_open' || inline.type !== 'inline') continue;
    const hint = headingHint(inline.content, (open.map?.[0] ?? 0) + 1, report);
    if (!hint) continue;
    inline.content = hint.text;
    const last = inline.children?.at(-1);
    if (last?.type === 'text' && last.content.endsWith(hint.suffix))
      last.content = last.content.slice(0, last.content.length - hint.suffix.length);
    if (hint.page) pages.set(open, hint.page);
  }
  return pages;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function edgeRef(
  figure: Figure,
  id: string,
  from: string,
  to: string,
  line: number,
  { error }: Reporter,
): EdgeTarget | undefined {
  const v = view(figure.diagram);
  const all: { index: EdgeIndex; ends: [string, string] }[] = [];
  for (let i = 0; ; i++) {
    const ends = v.ends(edgeIndex(i));
    if (!ends) break;
    all.push({ index: edgeIndex(i), ends });
  }
  const found = all.filter((e) => e.ends[0] === from && e.ends[1] === to);
  const [only, ...others] = found;
  if (only && !others.length) return { type: 'edge', index: only.index };
  if (!all.length) {
    error(
      line,
      `Reference \`#${id}.${from}->${to}\` names an edge, and diagram \`${id}\` has none.`,
      `Point at a name instead, e.g. \`#${id}.${from}\`.`,
    );
    return;
  }
  if (found.length) {
    error(
      line,
      `Reference \`#${id}.${from}->${to}\` is ambiguous: ${found.length} edges join \`${from}\` and \`${to}\`.`,
      `Point at one end instead (\`#${id}.${from}\`), or, in a sequence, wrap the message in a phase with an id and point at the phase.`,
    );
    return;
  }
  const fromHere = all.filter((e) => e.ends[0] === from).map((e) => `\`#${id}.${e.ends[0]}->${e.ends[1]}\``);
  error(
    line,
    `Reference \`#${id}.${from}->${to}\` names an edge that diagram \`${id}\` does not have.`,
    fromHere.length
      ? `Edges from \`${from}\`: ${fromHere.join(', ')}.`
      : `Edges in \`${id}\`: ${all.map((e) => `\`${e.ends[0]}->${e.ends[1]}\``).join(', ')}.`,
  );
  return;
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

function warnStrayFence(lang: string, body: string, line: number, report: Reporter): void {
  const near = closest(lang, TYPES);
  const types = `Diagram types: ${list(TYPES)}.`;
  if (lang && near)
    report.warn(
      line,
      `\`${lang}\` is not a Press diagram type, so this fence renders as code.`,
      `Did you mean \`${near}\`? ${types}`,
    );
  else if (!VERBATIM.has(lang.toLowerCase()) && EDGE_LINE.test(body))
    report.warn(
      line,
      lang
        ? `\`${lang}\` is not a Press diagram type, so this fence renders as code although it looks like a diagram.`
        : 'This fence has no diagram type, so it renders as code although it looks like a diagram.',
      `Name a diagram type after the opening backticks, e.g. \`state-machine\`. ${types}`,
    );
}
