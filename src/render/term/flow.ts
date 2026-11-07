import { cellWidth, splitGraphemes } from './cells.ts';
import type { Line, Seg } from './graph.ts';

interface Word {
  segs: Seg[];
  width: number;
  space: boolean;
}

function words(line: Line): Word[] {
  const out: Word[] = [];
  let current: Word = { segs: [], width: 0, space: false };
  const push = (): void => {
    if (current.segs.length) out.push(current);
  };
  for (const seg of line) {
    for (const part of seg.text.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        push();
        current = { segs: [], width: 0, space: true };
        continue;
      }
      current.segs.push({ ...seg, text: part });
      current.width += cellWidth(part);
    }
  }
  push();
  return out;
}

function split(word: Word, width: number): Word[] {
  const out: Word[] = [];
  let current: Word = { segs: [], width: 0, space: word.space };
  for (const seg of word.segs) {
    for (const g of splitGraphemes(seg.text)) {
      const gw = cellWidth(g);
      if (current.width + gw > width && current.width > 0) {
        out.push(current);
        current = { segs: [], width: 0, space: false };
      }
      const last = current.segs.at(-1);
      if (last && last.token === seg.token && last.href === seg.href) last.text += g;
      else current.segs.push({ ...seg, text: g });
      current.width += gw;
    }
  }
  if (current.segs.length) out.push(current);
  return out;
}

export function wrapLine(line: Line, width: number): Line[] {
  const max = Math.max(1, width);
  const lines: Seg[][] = [];
  let row: Seg[] = [];
  let used = 0;
  for (const w of words(line).flatMap((w) => (w.width > max ? split(w, max) : [w]))) {
    const gap = used > 0 && w.space ? 1 : 0;
    if (used > 0 && used + gap + w.width > max) {
      lines.push(row);
      row = [];
      used = 0;
    } else if (gap) {
      row.push({ text: ' ', token: 'text' });
      used += 1;
    }
    row.push(...w.segs);
    used += w.width;
  }
  if (row.length || !lines.length) lines.push(row);
  return lines;
}
