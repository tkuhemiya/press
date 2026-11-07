import { closest, type Reporter } from '../diagnostics.ts';

export type PageHint = 'keep' | 'new';

export interface HeadingHint {
  text: string;
  suffix: string;
  page?: PageHint;
}

const PAGES: PageHint[] = ['keep', 'new'];
const GROUP = /(\s*)\{([^{}]*=[^{}]*)\}$/;
const OPEN = /\{[^{}]*=[^{}]*$/;

export function headingHint(content: string, line: number, report: Reporter): HeadingHint | undefined {
  const m = GROUP.exec(content);
  if (!m) {
    if (OPEN.test(content))
      report.error(line, 'Heading ends in an unclosed `{`.', 'Close the brace, as in `{page=keep}`.');
    return undefined;
  }
  const suffix = m[0];
  const text = content.slice(0, content.length - suffix.length);
  const entries = m[2].split(',').map(splitEntry);
  const pages = entries.filter(([key]) => key === 'page');
  for (const [key, value] of entries) {
    if (key !== 'page')
      report.error(line, 'Headings take only the `page` hint.', 'Write `{page=new}` or `{page=keep}`.');
    else if (value === undefined)
      report.error(line, 'The `page` hint has no value.', 'Write `{page=keep}` or `{page=new}`.');
    else if (!isPage(value)) reportValue(value, line, report);
  }
  if (pages.length > 1)
    report.error(
      line,
      `A heading takes one page hint, but this one has ${pages.length}.`,
      'Keep one of `{page=keep}` or `{page=new}`.',
    );
  const value = pages.length === 1 ? pages[0]?.[1] : undefined;
  return value !== undefined && isPage(value) ? { text, suffix, page: value } : { text, suffix };
}

function splitEntry(entry: string): [string, string | undefined] {
  const at = entry.indexOf('=');
  return at < 0 ? [entry.trim(), undefined] : [entry.slice(0, at).trim(), entry.slice(at + 1).trim()];
}

function reportValue(value: string, line: number, report: Reporter): void {
  const near = closest(value, PAGES);
  report.error(
    line,
    `Unknown page hint \`${value}\`.`,
    near
      ? `Did you mean \`{page=${near}}\`?`
      : 'Use `{page=keep}` to keep the section on one page, or `{page=new}` to start it on a new page.',
  );
}

function isPage(value: string): value is PageHint {
  return value === 'keep' || value === 'new';
}
