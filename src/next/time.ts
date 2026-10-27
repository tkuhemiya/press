import type { Time, TimeForm } from './model.ts';

const FORMS: [TimeForm, RegExp][] = [
  ['year', /^(\d{4})$/],
  ['month', /^(\d{4})-(\d{2})$/],
  ['day', /^(\d{4})-(\d{2})-(\d{2})$/],
  ['datetime', /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/],
  ['clock', /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/],
];

export const TIME_EXAMPLES = '`2019`, `2019-03`, `2019-03-14`, `14:02`, `14:02:30` or `2019-03-14T14:02`';

export function looksLikeTime(word: string): boolean {
  return /^\d{4}(?:$|[-T])|^\d{1,2}:\d/.test(word);
}

export function parseTime(text: string): Time | { error: string } {
  for (const [form, re] of FORMS) {
    const m = re.exec(text);
    if (!m) continue;
    if (form === 'clock') {
      const [h, min, s] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
      if (h > 23 || min > 59 || s > 59) return { error: `\`${text}\` is not a time of day.` };
      return { text, form, value: ((h * 60 + min) * 60 + s) * 1000 };
    }
    const [y, mo, d, h, min, s] = [
      Number(m[1]),
      Number(m[2] ?? 1),
      Number(m[3] ?? 1),
      Number(m[4] ?? 0),
      Number(m[5] ?? 0),
      Number(m[6] ?? 0),
    ];
    if (mo < 1 || mo > 12) return { error: `\`${text}\` has no month ${m[2]}.` };
    const value = Date.UTC(y, mo - 1, d, h, min, s);
    if (new Date(value).getUTCDate() !== d)
      return { error: `\`${text}\` is not a day: ${m[1]}-${m[2]} has no day ${m[3]}.` };
    if (h > 23 || min > 59 || s > 59) return { error: `\`${text}\` is not a time of day.` };
    return { text, form, value };
  }
  return { error: `Cannot read \`${text}\` as a time.` };
}
