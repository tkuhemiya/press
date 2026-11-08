import type { Paint, Role } from '../model.ts';

export const INK = {
  paper: '#ffffff',
  ink: '#22211e',
  ink2: '#54514a',
  ink3: '#8a867c',
  rule: '#e6e2d8',
  nodeFill: '#ffffff',
  nodeLine: '#c4beb1',
  edge: '#77736a',
  groupFill: '#f5f3ed',
  groupLine: '#e4e0d5',
  groupNested: ['#edeae1', '#e4e1d6'],
  mutedLine: '#dcd8ce',
  mutedInk: '#aaa59a',
} as const;

interface RoleInk {
  line: string;
  fill: string;
}

export const ROLE: Record<Role, RoleInk> = {
  focus: { line: '#2f5bd3', fill: '#eef2fd' },
  happy: { line: INK.nodeLine, fill: INK.nodeFill },
  error: { line: INK.nodeLine, fill: INK.nodeFill },
  muted: { line: INK.mutedLine, fill: INK.nodeFill },
};

export const CHANGE: Record<Paint, RoleInk> = {
  added: { line: '#1a7f4c', fill: '#e6f5ec' },
  removed: { line: '#c0392b', fill: '#fbeceb' },
};
