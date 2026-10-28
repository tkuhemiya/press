export type Token =
  | 'text'
  | 'strong'
  | 'em'
  | 'strong-em'
  | 'code'
  | 'link'
  | 'h1'
  | 'heading'
  | 'prefix'
  | 'quote'
  | 'rule'
  | 'title'
  | 'line'
  | 'label'
  | 'note'
  | 'tag'
  | 'group'
  | 'marker'
  | 'ref'
  | 'focus'
  | 'focus-label'
  | 'happy'
  | 'error'
  | 'muted';

interface Style {
  fg?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  dim?: boolean;
}

export type ThemeName = 'dark' | 'light' | 'plain';

export interface Theme {
  name: ThemeName;
  ascii: boolean;
  links: boolean;
}

const DARK: Record<Token, Style> = {
  text: {},
  strong: { bold: true, fg: 97 },
  em: { italic: true },
  'strong-em': { bold: true, italic: true, fg: 97 },
  code: { fg: 36 },
  link: { fg: 36, underline: true },
  h1: { bold: true, fg: 97 },
  heading: { bold: true, fg: 94 },
  prefix: { fg: 90 },
  quote: { fg: 37, italic: true },
  rule: { fg: 90 },
  title: { bold: true, fg: 97 },
  line: { fg: 37 },
  label: { fg: 97 },
  note: { fg: 90 },
  tag: { fg: 90, italic: true },
  group: { fg: 90 },
  marker: { bold: true, fg: 93 },
  ref: { bold: true, fg: 93 },
  focus: { fg: 94 },
  'focus-label': { bold: true, fg: 94 },
  happy: { fg: 92 },
  error: { fg: 91 },
  muted: { fg: 90 },
};

const LIGHT: Record<Token, Style> = {
  ...DARK,
  strong: { bold: true },
  'strong-em': { bold: true, italic: true },
  code: { fg: 35 },
  link: { fg: 34, underline: true },
  h1: { bold: true },
  heading: { bold: true, fg: 34 },
  quote: { fg: 90, italic: true },
  title: { bold: true },
  line: { fg: 90 },
  label: {},
  marker: { bold: true, fg: 35 },
  ref: { bold: true, fg: 35 },
  focus: { fg: 34 },
  'focus-label': { bold: true, fg: 34 },
  happy: { fg: 32 },
  error: { fg: 31 },
};

const sgrOf = (s: Style): string => {
  const codes = [
    ...(s.bold ? [1] : []),
    ...(s.dim ? [2] : []),
    ...(s.italic ? [3] : []),
    ...(s.underline ? [4] : []),
    ...(s.fg === undefined ? [] : [s.fg]),
  ];
  return codes.length ? `\x1b[${codes.join(';')}m` : '';
};

export function paint(theme: Theme, token: Token, text: string): string {
  if (theme.name === 'plain' || !text) return text;
  const open = sgrOf((theme.name === 'dark' ? DARK : LIGHT)[token]);
  return open ? `${open}${text}\x1b[0m` : text;
}

export function hyperlink(theme: Theme, href: string, text: string): string {
  return theme.links && theme.name !== 'plain' ? `\x1b]8;;${href}\x1b\\${text}\x1b]8;;\x1b\\` : text;
}

const ESC = String.fromCharCode(27);
const SGR = new RegExp(`${ESC}\\[[0-9;]*m`, 'g');
const OSC8 = new RegExp(`${ESC}\\]8;;[^${ESC}]*${ESC}\\\\`, 'g');

export const stripAnsi = (s: string): string => s.replace(SGR, '').replace(OSC8, '');
