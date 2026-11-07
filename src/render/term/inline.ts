import { plain as plainText, type Inline } from '../blocks.ts';
import type { Line, Seg } from './graph.ts';
import type { Token } from './theme.ts';

const combine = (outer: Token, inner: Token): Token => {
  if (outer === 'strong' && inner === 'em') return 'strong-em';
  if (outer === 'em' && inner === 'strong') return 'strong-em';
  return inner === 'text' ? outer : inner;
};

export function inlineLine(inlines: readonly Inline[], urls = false, base: Token = 'text', href?: string): Line {
  return inlines.flatMap((x): Seg[] => {
    const seg = (text: string, token: Token): Seg => (href === undefined ? { text, token } : { text, token, href });
    switch (x.t) {
      case 'text':
        return [seg(x.s, base)];
      case 'code':
        return [seg(x.s, 'code')];
      case 'br':
        return [seg(' ', base)];
      case 'strong':
        return [...inlineLine(x.c, urls, combine(base, 'strong'), href)];
      case 'em':
        return [...inlineLine(x.c, urls, combine(base, 'em'), href)];
      case 'link':
        return [
          ...inlineLine(x.c, urls, 'link', x.href),
          ...(urls && !x.href.startsWith('#') && x.href !== plainText(x.c)
            ? [{ text: ` (${x.href})`, token: 'note' as const }]
            : []),
        ];
      case 'ref':
        return [...inlineLine(x.c, urls, base, href), { text: `[${x.marker}]`, token: 'ref' }];
    }
  });
}
