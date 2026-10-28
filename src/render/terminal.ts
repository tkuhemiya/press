import type { Document, Figure } from '../parse/document.ts';
import { documentBlocks, type Blocks, type Inline } from './blocks.ts';
import { cellWidth } from './term/cells.ts';
import { legendLines, termFigure } from './term/figure.ts';
import { wrapLine } from './term/flow.ts';
import type { Line } from './term/graph.ts';
import { inlineLine } from './term/inline.ts';
import { drawTable } from './term/table.ts';
import { hyperlink, paint, type Theme, type ThemeName } from './term/theme.ts';

export interface TerminalOptions {
  width?: number;
  theme?: ThemeName;
  ascii?: boolean;
  links?: boolean;
}

type Block = Blocks<{ t: 'figure'; figure: Figure }>;

const MARGIN = 2;

export function renderTerminal(doc: Document, options: TerminalOptions = {}): string {
  const theme: Theme = {
    name: options.theme ?? 'dark',
    ascii: options.ascii ?? false,
    links: options.links ?? false,
  };
  const width = Math.max(30, options.width ?? 80) - MARGIN;
  const blocks: Block[] = documentBlocks(doc, (figure) => ({ t: 'figure', figure }));
  const lines = renderBlocks(blocks, width, theme);
  const pad = ' '.repeat(MARGIN);
  return ['', ...lines.map((l) => (l ? pad + l : l)), ''].join('\n');
}

const renderLine = (line: Line, theme: Theme): string =>
  line
    .map((s) => {
      const painted = paint(theme, s.token, s.text);
      return s.href === undefined ? painted : hyperlink(theme, s.href, painted);
    })
    .join('');

function flow(inlines: Inline[], width: number, theme: Theme): string[] {
  return wrapLine(inlineLine(inlines, !theme.links), width).map((l) => renderLine(l, theme));
}

function renderBlocks(blocks: readonly Block[], width: number, theme: Theme): string[] {
  const out: string[] = [];
  blocks.forEach((b, i) => {
    if (i > 0) out.push('');
    out.push(...renderBlock(b, width, theme));
  });
  return out;
}

function indented(lines: string[], first: string, rest: string): string[] {
  return lines.map((l, i) => (l ? (i === 0 ? first : rest) + l : l));
}

function renderBlock(b: Block, width: number, theme: Theme): string[] {
  const bullet = theme.ascii ? '- ' : '• ';
  switch (b.t) {
    case 'heading': {
      const prefix = b.level === 1 ? '' : `${'#'.repeat(b.level)} `;
      const rows = wrapLine(inlineLine(b.c), width - prefix.length).map((l) => l.map((s) => s.text).join(''));
      const token = b.level === 1 ? 'h1' : 'heading';
      const text = rows.map(
        (r, i) => (i === 0 ? paint(theme, 'prefix', prefix) : ' '.repeat(prefix.length)) + paint(theme, token, r),
      );
      if (b.level > 1) return text;
      const under = Math.min(width, Math.max(...rows.map(cellWidth)));
      return [...text, paint(theme, 'rule', (theme.ascii ? '=' : '━').repeat(under))];
    }
    case 'para':
      return flow(b.c, width, theme);
    case 'list':
      return b.items.flatMap((item, k) => {
        const mark = b.ordered ? `${k + 1}. ` : bullet;
        const lines = renderBlocks(item, width - mark.length, theme);
        return indented(lines, paint(theme, 'prefix', mark), ' '.repeat(mark.length));
      });
    case 'code': {
      const rows = b.s.replace(/\n$/, '').split('\n');
      const bar = paint(theme, 'rule', theme.ascii ? '| ' : '│ ');
      return rows.map((r) => bar + paint(theme, 'code', r));
    }
    case 'quote':
      return indented(
        renderBlocks(b.b, width - 2, theme),
        paint(theme, 'quote', theme.ascii ? '| ' : '┃ '),
        paint(theme, 'quote', theme.ascii ? '| ' : '┃ '),
      );
    case 'rule':
      return [paint(theme, 'rule', (theme.ascii ? '-' : '─').repeat(Math.min(width, 40)))];
    case 'table': {
      const cell = (c: Inline[]): Line[] => [inlineLine(c, !theme.links)];
      const head = b.head.map((c) => [inlineLine(c, false, 'strong')]);
      return drawTable({ head, rows: b.rows.map((r) => ({ cells: r.map(cell) })) }, width).render(theme);
    }
    case 'figure': {
      const f = termFigure(b.figure, theme, width);
      return [
        ...(f.title ? [renderLine(f.title, theme)] : []),
        ...(f.title ? [''] : []),
        ...f.body,
        ...(f.legend.length ? ['', ...legendLines(f.legend, width, theme)] : []),
      ];
    }
  }
}
