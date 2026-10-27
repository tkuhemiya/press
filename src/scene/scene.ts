export type Attrs = readonly (readonly [string, string])[];

export type Item =
  | { type: 'group'; cls?: string; attrs?: Attrs; items: readonly Item[] }
  | { type: 'rect'; cls?: string; x: number; y: number; w: number; h: number; r: number; hatch?: boolean }
  | { type: 'circle'; cls?: string; cx: number; cy: number; r: number }
  | { type: 'path'; cls?: string; d: string }
  | { type: 'text'; cls?: string; x: number; y: number; text: string; dy?: string }
  | { type: 'lines'; cls: string; x: number; cy: number; lines: readonly string[]; lineHeight: number }
  | { type: 'ellipse'; cls?: string; cx: number; cy: number; rx: number; ry: number }
  | { type: 'line'; cls?: string; x1: number; y1: number; x2: number; y2: number };

export interface Scene {
  id: string;
  cls: string;
  width: number;
  height: number;
  hatch: boolean;
  items: readonly Item[];
}

export const attr = (key: string, value: string | number | undefined): Attrs =>
  value === undefined ? [] : [[key, String(value)]];
