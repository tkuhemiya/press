import type { Diagnostic } from './model.ts';

export interface Reporter {
  error: (line: number, message: string, hint: string) => void;
  warn: (line: number, message: string, hint: string) => void;
}

export function collect(): { report: Reporter; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  return { report: into(diagnostics), diagnostics };
}

export function into(
  diagnostics: { severity: 'error' | 'warning'; line: number; message: string; hint?: string }[],
): Reporter {
  return {
    error: (line, message, hint) => diagnostics.push({ severity: 'error', line, message, hint }),
    warn: (line, message, hint) => diagnostics.push({ severity: 'warning', line, message, hint }),
  };
}

export function formatDiagnostic(d: Diagnostic, file = 'input'): string {
  return `${file}:${d.line}: ${d.severity}: ${d.message}\n  fix: ${d.hint}`;
}

function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

export function closest(word: string, candidates: Iterable<string>): string | undefined {
  let best: string | undefined;
  let bestD = Infinity;
  for (const c of candidates) {
    const d = distance(word.toLowerCase(), c.toLowerCase());
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best !== undefined && bestD <= Math.max(1, Math.floor(word.length / 3)) ? best : undefined;
}

export function list(words: Iterable<string>): string {
  return [...words].map((w) => `\`${w}\``).join(', ');
}
