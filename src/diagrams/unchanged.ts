import type { Fence } from '../parse/grammar.ts';
import type { Reporter } from '../diagnostics.ts';

export function rejectChanges(fence: Fence, { error }: Reporter): void {
  for (const s of fence.statements)
    if (s.change)
      error(
        s.line,
        `A ${fence.type} cannot show a change: \`+\` and \`-\` lines are not allowed here.`,
        'Remove the `+ ` or `- ` at the start of the line, and show the two versions as two diagrams.',
      );
}
