import type { Token } from 'markdown-it';
import { walkDocument, type Document, type Figure, type Walk } from '../parse/document.ts';
import type { PageHint } from '../parse/heading.ts';

export type Inline =
  | { t: 'text'; s: string }
  | { t: 'strong' | 'em'; c: Inline[] }
  | { t: 'code'; s: string }
  | { t: 'link'; c: Inline[]; href: string }
  | { t: 'ref'; c: Inline[]; marker: string }
  | { t: 'br' };

export type Blocks<F> =
  | { t: 'heading'; level: number; c: Inline[]; page?: PageHint }
  | { t: 'para'; c: Inline[] }
  | { t: 'list'; ordered: boolean; items: Blocks<F>[][] }
  | { t: 'code'; s: string; lang: string }
  | { t: 'quote'; b: Blocks<F>[] }
  | { t: 'rule' }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] }
  | F;

export function documentBlocks<F>(doc: Document, figure: (f: Figure) => F): Blocks<F>[] {
  return blockRun(walkDocument(doc), figure, 0, undefined)[0];
}

export function plain(inlines: Inline[]): string {
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

function blockRun<F>(
  walk: Walk,
  figure: (f: Figure) => F,
  from: number,
  close: string | undefined,
): [Blocks<F>[], number] {
  const { tokens } = walk;
  const out: Blocks<F>[] = [];
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
        const items: Blocks<F>[][] = [];
        i++;
        while (tokens[i].type !== end) {
          const [item, next] = blockRun(walk, figure, i + 1, 'list_item_close');
          items.push(item);
          i = next + 1;
        }
        out.push({ t: 'list', ordered: t.type === 'ordered_list_open', items });
        i++;
        continue;
      }
      case 'blockquote_open': {
        const [b, next] = blockRun(walk, figure, i + 1, 'blockquote_close');
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

function heading<F>(open: Token, level: number, c: Inline[], walk: Walk): Blocks<F> {
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

export function htmlInlines(html: string): Inline[] {
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
