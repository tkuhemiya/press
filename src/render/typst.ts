import type { Token } from 'markdown-it';
import { targetName, type Direction, type NodeId } from '../model.ts';
import { walkDocument, type Document, type Figure, type Walk } from '../parse/document.ts';
import type { PageHint } from '../parse/heading.ts';
import { view, type RenderContext, type Rendered, type View } from '../diagrams/diagram.ts';
import { printScene, type PrintScene } from '../scene/print.ts';

type Inline =
  | { t: 'text'; s: string }
  | { t: 'strong' | 'em'; c: Inline[] }
  | { t: 'code'; s: string }
  | { t: 'link'; c: Inline[]; href: string }
  | { t: 'ref'; c: Inline[]; marker: string }
  | { t: 'br' };

type Block =
  | { t: 'heading'; level: number; c: Inline[]; page?: PageHint }
  | { t: 'para'; c: Inline[] }
  | { t: 'list'; ordered: boolean; items: Block[][] }
  | { t: 'code'; s: string; lang: string }
  | { t: 'quote'; b: Block[] }
  | { t: 'rule' }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] }
  | { t: 'figure'; key: string; title?: string; variants: Variant[]; steps: Inline[][]; kind: string };

interface Variant {
  scene: PrintScene;
  fit: number;
  beside: boolean;
}

interface Section {
  heading?: Block;
  title?: string;
  blocks: Block[];
  keep: boolean;
  fresh: boolean;
}

export interface TypstDocument {
  title?: string;
  scale: number;
  sections: Section[];
}

const PT_PER_PX = 0.62;
const PAGE_W = ((210 - 34) / 25.4) * 72;
const PAGE_H = ((297 - 38) / 25.4) * 72 * 0.6;
const DIRECTIONS: Direction[] = ['right', 'down'];

export function typstDocument(doc: Document): TypstDocument {
  const walk = walkDocument(doc);
  const [blocks] = blockRun(walk, 0, undefined);
  const out: TypstDocument = { scale: PT_PER_PX, sections: sectionsOf(blocks) };
  if (doc.title !== undefined) out.title = doc.title;
  return out;
}

function sectionsOf(blocks: Block[]): Section[] {
  return blocks.reduce<Section[]>((out, b) => {
    if (b.t === 'heading')
      return [...out, { heading: b, title: plain(b.c), blocks: [], keep: b.page === 'keep', fresh: b.page === 'new' }];
    const last = out.at(-1);
    if (last === undefined) return [{ blocks: [b], keep: false, fresh: false }];
    return [...out.slice(0, -1), { ...last, blocks: [...last.blocks, b] }];
  }, []);
}

function plain(inlines: Inline[]): string {
  return inlines
    .map((x) => {
      switch (x.t) {
        case 'text':
        case 'code':
          return x.s;
        case 'br':
          return ' ';
        case 'strong':
        case 'em':
        case 'link':
        case 'ref':
          return plain(x.c);
      }
    })
    .join('');
}

function blockRun(walk: Walk, from: number, close: string | undefined): [Block[], number] {
  const { tokens } = walk;
  const out: Block[] = [];
  let i = from;
  while (i < tokens.length && tokens[i].type !== close) {
    const t = tokens[i];
    switch (t.type) {
      case 'heading_open':
        out.push(heading(t, Number(t.tag.slice(1)), inlines(walk, tokens[i + 1]), walk));
        i += 3;
        continue;
      case 'paragraph_open':
        out.push({ t: 'para', c: inlines(walk, tokens[i + 1]) });
        i += 3;
        continue;
      case 'bullet_list_open':
      case 'ordered_list_open': {
        const end = t.type.replace('_open', '_close');
        const items: Block[][] = [];
        i++;
        while (tokens[i].type !== end) {
          const [item, next] = blockRun(walk, i + 1, 'list_item_close');
          items.push(item);
          i = next + 1;
        }
        out.push({ t: 'list', ordered: t.type === 'ordered_list_open', items });
        i++;
        continue;
      }
      case 'blockquote_open': {
        const [b, next] = blockRun(walk, i + 1, 'blockquote_close');
        out.push({ t: 'quote', b });
        i = next + 1;
        continue;
      }
      case 'table_open': {
        const rows: Inline[][][] = [];
        i++;
        let row: Inline[][] = [];
        while (tokens[i].type !== 'table_close') {
          const cell = tokens[i];
          if (cell.type === 'tr_open') row = [];
          if (cell.type === 'inline') row.push(inlines(walk, cell));
          if (cell.type === 'tr_close') rows.push(row);
          i++;
        }
        const [head = [], ...body] = rows;
        out.push({ t: 'table', head, rows: body });
        i++;
        continue;
      }
      case 'fence':
      case 'code_block': {
        const f = walk.figure(t);
        out.push(f ? figure(f) : { t: 'code', s: t.content, lang: t.info.trim() });
        i++;
        continue;
      }
      case 'hr':
        out.push({ t: 'rule' });
        i++;
        continue;
      default:
        i++;
    }
  }
  return [out, i];
}

function heading(open: Token, level: number, c: Inline[], walk: Walk): Block {
  const page = walk.page(open);
  return page === undefined ? { t: 'heading', level, c } : { t: 'heading', level, c, page };
}

function inlines(walk: Walk, token: Token | undefined): Inline[] {
  const root: Inline[] = [];
  const stack: Inline[][] = [root];
  const top = (): Inline[] => stack[stack.length - 1] ?? root;
  const open = (node: Inline & { c: Inline[] }): void => {
    top().push(node);
    stack.push(node.c);
  };
  const shut = (): void => {
    stack.pop();
  };
  for (const child of token?.children ?? []) {
    switch (child.type) {
      case 'text':
        top().push({ t: 'text', s: child.content });
        break;
      case 'softbreak':
        top().push({ t: 'text', s: ' ' });
        break;
      case 'hardbreak':
        top().push({ t: 'br' });
        break;
      case 'code_inline':
        top().push({ t: 'code', s: child.content });
        break;
      case 'strong_open':
        open({ t: 'strong', c: [] });
        break;
      case 'em_open':
        open({ t: 'em', c: [] });
        break;
      case 'link_open': {
        const ref = walk.ref(child);
        open(
          ref
            ? { t: 'ref', c: [], marker: ref.marker }
            : { t: 'link', c: [], href: String(child.attrGet('href') ?? '') },
        );
        break;
      }
      case 'strong_close':
      case 'em_close':
      case 'link_close':
        shut();
        break;
    }
  }
  return root;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };
const unescape = (s: string): string => s.replace(/&(amp|lt|gt|quot|#39);/g, (_, e: string) => ENTITIES[e] ?? e);

function htmlInlines(html: string): Inline[] {
  const root: Inline[] = [];
  const stack: Inline[][] = [root];
  const top = (): Inline[] => stack[stack.length - 1] ?? root;
  for (const part of html.split(/(<\/?(?:strong|em|code)>)/)) {
    if (part === '<strong>' || part === '<em>') {
      const node: Inline = { t: part === '<strong>' ? 'strong' : 'em', c: [] };
      top().push(node);
      stack.push(node.c);
    } else if (part === '</strong>' || part === '</em>') stack.pop();
    else if (part === '<code>') stack.push([]);
    else if (part === '</code>') {
      const code = stack.pop() ?? [];
      top().push({ t: 'code', s: code.map((c) => (c.t === 'text' ? c.s : '')).join('') });
    } else if (part) top().push({ t: 'text', s: unescape(part.replace(/<[^>]+>/g, '')) });
  }
  return root;
}

function draw(v: View, f: Figure, direction?: Direction): Rendered {
  const markers = new Map(f.refs.map((r) => [targetName(r.target), r.marker]));
  const context: RenderContext = { domId: `${f.domId}-print`, marker: (t) => markers.get(targetName(t)) };
  if (direction !== undefined) context.direction = direction;
  return v.render(context);
}

const fitOf = (r: Rendered): number => Math.min(1, PAGE_W / (r.width * PT_PER_PX), PAGE_H / (r.height * PT_PER_PX));

const variantOf = (r: Rendered): Variant => ({
  scene: printScene(r.scene),
  fit: fitOf(r),
  beside: r.width * PT_PER_PX * fitOf(r) <= PAGE_W * 0.6,
});

const sameSize = (a: Rendered, b: Rendered): boolean => a.width === b.width && a.height === b.height;

const distinct = (renders: Rendered[]): Rendered[] =>
  renders.reduce<Rendered[]>((kept, r) => (kept.some((k) => sameSize(k, r)) ? kept : [...kept, r]), []);

const pinnedBy =
  (f: Figure) =>
  (id: NodeId): boolean =>
    f.refs.some(
      (r) => (r.target.type === 'node' && r.target.id === id) || (r.target.type === 'prop' && r.target.node === id),
    );

const onEdges = (f: Figure): boolean => f.refs.some((r) => r.target.type === 'edge' || r.target.type === 'edges');

function leanOf(v: View, f: Figure): Rendered | undefined {
  const lean = onEdges(f) ? undefined : v.withoutMuted(pinnedBy(f));
  if (!lean) return undefined;
  const leanView = view(lean);
  const directions: (Direction | undefined)[] = v.turnable() ? DIRECTIONS : [undefined];
  const renders = directions.flatMap((d) => {
    try {
      return [draw(leanView, f, d)];
    } catch {
      return [];
    }
  });
  return renders.reduce<Rendered | undefined>((a, b) => (a === undefined || fitOf(b) > fitOf(a) ? b : a), undefined);
}

function figure(f: Figure): Block {
  const v = view(f.diagram);
  const first = draw(v, f);
  const tried = v.turnable() ? [first, ...DIRECTIONS.map((d) => draw(v, f, d))] : [first];
  const best = tried.reduce((a, b) => (fitOf(b) > fitOf(a) * 1.1 ? b : a));
  const lean = leanOf(v, f);
  const leaned = lean && fitOf(lean) * 0.85 > fitOf(best) * 1.15 ? [lean] : [];
  const block: Block = {
    t: 'figure',
    key: f.domId,
    kind: f.diagram.type,
    variants: distinct([best, ...tried, ...leaned]).map(variantOf),
    steps: f.diagram.steps.map((s) => htmlInlines(s.caption)),
  };
  if (f.diagram.title !== undefined) block.title = f.diagram.title;
  return block;
}
