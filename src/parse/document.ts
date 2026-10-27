// Parses a Press document: CommonMark with diagram fences and prose references.
import MarkdownIt from 'markdown-it';
import type { Token } from 'markdown-it';
import { DIAGRAM_TYPES, type Diagnostic, type Diagram, type DiagramType } from '../model.ts';
import { parseFence } from './fence.ts';
import { closest, list } from './suggest.ts';

export interface ProseRef {
  diagram: string;
  node: string;
  line: number;
  // The print marker shared by every reference to this node: a, b, c…
  marker: string;
}

export interface PressDocument {
  tokens: Token[];
  diagrams: Diagram[];
  refs: ProseRef[];
  title?: string;
  diagnostics: Diagnostic[];
  md: Markdown;
}

const REF = /^#([a-z0-9_]+(?:-[a-z0-9_]+)*)\.(.+)$/;

export type Markdown = InstanceType<typeof MarkdownIt>;

export function createMarkdown(): Markdown {
  // No raw HTML: the vocabulary grows instead of being escaped.
  return new MarkdownIt({ html: false, linkify: false, typographer: true });
}

export function parseDocument(source: string): PressDocument {
  const md = createMarkdown();
  const diagnostics: Diagnostic[] = [];
  const tokens = md.parse(source, {});
  const diagrams: Diagram[] = [];
  const byId = new Map<string, Diagram>();
  let title: string | undefined;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!title && t.type === 'heading_open' && t.tag === 'h1') title = tokens[i + 1]?.content;
    if (t.type !== 'fence') continue;
    const lang = t.info.trim().split(/\s+/)[0] ?? '';
    const line = (t.map?.[0] ?? 0) + 1;
    if (!(DIAGRAM_TYPES as readonly string[]).includes(lang)) {
      const near = closest(lang, DIAGRAM_TYPES);
      if (near && lang && near !== lang) diagnostics.push({ severity: 'warning', line, message: `\`${lang}\` is not a Press diagram type, so this fence renders as code.`, hint: `Did you mean \`${near}\`? Diagram types: ${list(DIAGRAM_TYPES)}.` });
      continue;
    }
    const diagram = parseFence({ type: lang as DiagramType, info: t.info.trim(), body: t.content, line }, diagnostics);
    t.meta = { diagram };
    diagrams.push(diagram);
    if (diagram.id) {
      if (byId.has(diagram.id)) diagnostics.push({ severity: 'error', line, message: `Diagram id \`${diagram.id}\` is already used on line ${byId.get(diagram.id)!.line}.`, hint: 'Give each diagram its own id.' });
      else byId.set(diagram.id, diagram);
    }
  }

  // Prose references, in reading order.
  const refs: ProseRef[] = [];
  const markers = new Map<string, Map<string, string>>();
  for (const block of tokens) {
    if (block.type !== 'inline' || !block.children) continue;
    let line = (block.map?.[0] ?? 0) + 1;
    for (const child of block.children) {
      if (child.type === 'softbreak' || child.type === 'hardbreak') line++;
      if (child.type !== 'link_open') continue;
      const href = String(child.attrGet('href') ?? '');
      const m = REF.exec(href);
      if (!m) continue;
      const [, diagramId, nodeId] = m;
      const diagram = byId.get(diagramId);
      if (!diagram) {
        const near = closest(diagramId, byId.keys());
        diagnostics.push({
          severity: 'error',
          line,
          message: `Reference \`${href}\` names diagram \`${diagramId}\`, which does not exist.`,
          hint: near ? `Did you mean \`#${near}.${nodeId}\`?` : byId.size ? `Diagrams with ids: ${list(byId.keys())}.` : 'Give the diagram an id in its fence header: ```state-machine id=order```.',
        });
        continue;
      }
      // A reference names a node, or a property as `node.key`.
      const ids = [...diagram.nodes.map((n) => n.id), ...diagram.props.map((p) => `${p.node}.${p.key}`)];
      if (!ids.includes(nodeId)) {
        const near = closest(nodeId, ids);
        diagnostics.push({ severity: 'error', line, message: `Reference \`${href}\` names \`${nodeId}\`, which is not in diagram \`${diagramId}\`.`, hint: near ? `Did you mean \`#${diagramId}.${near}\`?` : `Nodes in \`${diagramId}\`: ${list(ids)}.` });
        continue;
      }
      let perDiagram = markers.get(diagramId);
      if (!perDiagram) markers.set(diagramId, (perDiagram = new Map()));
      let marker = perDiagram.get(nodeId);
      if (!marker) perDiagram.set(nodeId, (marker = letter(perDiagram.size)));
      child.meta = { ref: { diagram: diagramId, node: nodeId, marker } };
      refs.push({ diagram: diagramId, node: nodeId, line, marker });
    }
  }

  diagnostics.sort((a, b) => a.line - b.line);
  return title === undefined ? { tokens, diagrams, refs, diagnostics, md } : { tokens, diagrams, refs, title, diagnostics, md };
}

// a…z, then aa, ab…
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

export function formatDiagnostic(d: Diagnostic, file = 'input'): string {
  return `${file}:${d.line}: ${d.severity}: ${d.message}${d.hint ? `\n  fix: ${d.hint}` : ''}`;
}
