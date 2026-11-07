import type { Arrow, Role, Target } from '../../model.ts';
import { targetName } from '../../model.ts';
import type { Figure } from '../../parse/document.ts';
import type { LineKind } from './canvas.ts';
import { wrapCells } from './cells.ts';
import type { Line, Seg } from './graph.ts';
import type { Theme, Token } from './theme.ts';

export interface Look {
  border: LineKind;
  token: Token;
  label: Token;
}

export function nodeLook(role: Role | undefined, outcome = false): Look {
  switch (role) {
    case 'focus':
      return { border: 'double', token: 'focus', label: 'focus-label' };
    case 'happy':
      return { border: 'heavy', token: 'happy', label: 'happy' };
    case 'error':
      return { border: 'light', token: 'error', label: 'error' };
    case 'muted':
      return { border: 'dotted', token: 'muted', label: 'muted' };
    case undefined:
      return { border: outcome ? 'round' : 'light', token: 'line', label: 'label' };
  }
}

export function edgeLook(role: Role | undefined, arrow: Arrow): { kind: LineKind; token: Token } {
  const dashed = arrow === '-->';
  switch (role) {
    case 'focus':
      return { kind: dashed ? 'dashed' : 'heavy', token: 'focus' };
    case 'happy':
      return { kind: dashed ? 'dashed' : 'heavy', token: 'happy' };
    case 'error':
      return { kind: dashed ? 'dashed' : 'round', token: 'error' };
    case 'muted':
      return { kind: 'dotted', token: 'muted' };
    case undefined:
      return { kind: dashed ? 'dashed' : 'round', token: 'line' };
  }
}

export const errorMark = (theme: Theme): string => (theme.ascii ? '! ' : '✗ ');

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';

export const stepMark = (i: number, theme: Theme): string =>
  !theme.ascii && i < CIRCLED.length ? (CIRCLED[i] ?? '') : `(${i + 1})`;

export type Markers = (target: Target) => Seg[];

export function markers(f: Figure, theme: Theme): Markers {
  const steps = new Map<string, number[]>();
  f.diagram.steps.forEach((s, i) => {
    const key = targetName(s.target);
    steps.set(key, [...(steps.get(key) ?? []), i]);
  });
  const refs = new Map<string, string>();
  for (const r of f.refs) refs.set(targetName(r.target), r.marker);
  return (target) => {
    const key = targetName(target);
    const out: Seg[] = (steps.get(key) ?? []).map((i) => ({ text: stepMark(i, theme), token: 'marker' }));
    const ref = refs.get(key);
    if (ref !== undefined) out.push({ text: `[${ref}]`, token: 'ref' });
    return out;
  };
}

export function labelLines(text: string, width: number, token: Token, tail: Seg[] = [], head: Seg[] = []): Line[] {
  const lines: Line[] = wrapCells(text, width).map((t) => [{ text: t, token }]);
  if (head.length) lines[0] = [...head, ...(lines[0] ?? [])];
  if (tail.length) {
    const last = lines.length - 1;
    lines[last] = [...(lines[last] ?? []), ...tail.flatMap((m) => [{ text: ' ', token: 'text' as const }, m])];
  }
  return lines.filter((l) => l.some((s) => s.text));
}
