import type { Diagram, DiagramType } from '../model.ts';
import type { Reporter } from '../diagnostics.ts';

const MAX_TOKEN = 40;

interface Limit {
  max: number;
  unit: string;
  count(diagram: Diagram): number;
}

const nodes = (unit: string, max: number): Limit => ({
  max,
  unit,
  count: (d) => ('nodes' in d ? d.nodes.length : 0),
});

const LIMITS: Record<DiagramType, Limit> = {
  'state-machine': nodes('states', 30),
  sequence: nodes('participants', 10),
  architecture: nodes('components', 30),
  'causal-loop': nodes('variables', 20),
  timeline: nodes('events', 40),
  'decision-tree': nodes('nodes', 30),
  er: nodes('entities', 15),
  tradeoffs: {
    max: 40,
    unit: 'cells',
    count: (d) => (d.type === 'tradeoffs' ? d.options.length * d.criteria.length : 0),
  },
};

interface Spoken {
  text: string;
  line: number;
}

function spoken(d: Diagram): Spoken[] {
  const items: Spoken[] = [];
  if ('nodes' in d)
    items.push(...d.nodes.flatMap((n) => [n.label, n.note ?? ''].map((text) => ({ text, line: n.line }))));
  if ('options' in d) items.push(...[...d.options, ...d.criteria].map((n) => ({ text: n.label, line: n.line })));
  if ('cells' in d) items.push(...d.cells.map((c) => ({ text: c.value ?? '', line: c.line })));
  if ('edges' in d) items.push(...d.edges.map((e) => ({ text: e.label ?? '', line: e.line })));
  return items;
}

export function checkReadability(diagram: Diagram, report: Reporter): void {
  const limit = LIMITS[diagram.type];
  const size = limit.count(diagram);
  if (size > limit.max)
    report.warn(
      diagram.line,
      `This ${diagram.type} has ${size} ${limit.unit}, more than a reader can follow in print (about ${limit.max}).`,
      'Split it into several smaller diagrams linked from prose; one idea per diagram. Keep a readable subset rather than a complete mesh.',
    );
  for (const { text, line } of spoken(diagram)) {
    const token = text.split(/\s+/).find((t) => t.length > MAX_TOKEN);
    if (token)
      report.warn(
        line,
        `The label \`${token.slice(0, 24)}…\` has ${token.length} characters with no spaces, so it cannot wrap cleanly.`,
        'Shorten it, add spaces, or move the detail into prose or a step caption.',
      );
  }
}
