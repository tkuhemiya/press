export type Choices = Record<string, number>;

export interface Report {
  key: string;
  room: number;
  heights: number[];
  full: number;
  title: string;
}

const PAD = 16;
const LEVELS = 8;

const isReport = (v: unknown): v is Report =>
  typeof v === 'object' &&
  v !== null &&
  'key' in v &&
  typeof v.key === 'string' &&
  'room' in v &&
  typeof v.room === 'number' &&
  'full' in v &&
  typeof v.full === 'number' &&
  'title' in v &&
  typeof v.title === 'string' &&
  'heights' in v &&
  Array.isArray(v.heights) &&
  v.heights.every((h) => typeof h === 'number');

export function parseReports(text: string): Report[] {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed) || !parsed.every(isReport)) throw new Error(`unexpected fit reports: ${text}`);
  return parsed;
}

const firstIndex = (heights: number[], fits: (h: number) => boolean): number => heights.findIndex(fits);

const smallestIndex = (heights: number[]): number => heights.indexOf(Math.min(...heights));

function figureChoice(r: Report): number {
  const placed = firstIndex(r.heights, (h) => h + PAD <= r.room);
  if (placed !== -1) return placed;
  const whole = firstIndex(r.heights, (h) => h <= r.full);
  return whole !== -1 ? whole : smallestIndex(r.heights);
}

function sectionChoice(r: Report): number {
  const placed = firstIndex(r.heights, (h) => h + PAD <= r.room);
  if (placed !== -1) return placed;
  const whole = firstIndex(r.heights, (h) => h <= r.full);
  return whole !== -1 ? LEVELS + whole : 0;
}

function choiceFor(r: Report): number {
  return r.key.startsWith('pm-sec-') ? sectionChoice(r) : figureChoice(r);
}

export function settle(reports: Report[], choices: Choices): Choices | 'settled' {
  for (const [index, r] of reports.entries()) {
    const next = choiceFor(r);
    if (next === (choices[r.key] ?? 0)) continue;
    const kept: Choices = {};
    for (const earlier of reports.slice(0, index)) {
      const value = choices[earlier.key];
      if (value !== undefined) kept[earlier.key] = value;
    }
    return { ...kept, [r.key]: next };
  }
  return 'settled';
}

export function unfitSections(reports: Report[]): string[] {
  return reports.filter((r) => r.key.startsWith('pm-sec-') && !r.heights.some((h) => h <= r.full)).map((r) => r.title);
}
