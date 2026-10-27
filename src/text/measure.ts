import { ADVANCES, CHARS } from './metrics.ts';

export type Face = 'sans400' | 'sans500' | 'sans600' | 'mono400';

const index = new Map<string, number>();
for (let i = 0; i < CHARS.length; i++) index.set(CHARS[i], i);

function fallback(ch: string): number {
  const c = ch.codePointAt(0) ?? 0;
  if (
    (c >= 0x1100 && c <= 0x115f) ||
    (c >= 0x2e80 && c <= 0xa4cf) ||
    (c >= 0xac00 && c <= 0xd7a3) ||
    (c >= 0xff00 && c <= 0xff60) ||
    c >= 0x1f000
  )
    return 1000;
  return 600;
}

export function textWidth(text: string, size: number, face: Face = 'sans400'): number {
  const table = ADVANCES[face];
  let units = 0;
  for (const ch of text) {
    const i = index.get(ch);
    units += i === undefined ? fallback(ch) : table[i];
  }
  return (units * size) / 1000;
}

export function wrap(text: string, size: number, maxWidth: number, face: Face = 'sans400'): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, size, face) > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}
