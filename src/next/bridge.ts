import type { Attrs, Diagnostic as LegacyDiagnostic, Diagram as LegacyDiagram } from '../model.ts';
import type { Diagram, Html } from './model.ts';
import { definition } from './diagram.ts';
import { formsElsewhere, GRAMMARS } from './grammars.ts';
import { parseFence } from './grammar.ts';
import { into } from './diagnostics.ts';

export const MIGRATED = ['state-machine', 'architecture', 'timeline', 'decision-tree'] as const;
export type Migrated = (typeof MIGRATED)[number];

export function isMigrated(type: string): type is Migrated {
  return MIGRATED.some((t) => t === type);
}

export function isMigratedDiagram(d: Diagram): d is Diagram<Migrated> {
  return isMigrated(d.type);
}

export function buildMigrated(
  type: Migrated,
  input: { info: string; body: string; line: number },
  diagnostics: LegacyDiagnostic[],
  inline: (markdown: string) => Html,
): LegacyDiagram {
  const report = into(diagnostics);
  const fence = parseFence({ ...input, type, grammar: GRAMMARS[type], inline, formsElsewhere }, report);
  return legacy(definition(type).build(fence, report));
}

export function legacy(d: Diagram<Migrated>): LegacyDiagram {
  const out: LegacyDiagram = {
    type: d.type,
    nodes: d.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      ...(node.role && { role: node.role }),
      ...('kind' in node && node.kind && { kind: node.kind }),
      attrs: noteAttrs(node.note),
      group: node.group ?? -1,
      line: node.line,
    })),
    edges: d.edges.map((e) => ({ ...e, attrs: {} })),
    groups: d.groups.map((g) => ({ label: g.label, parent: g.parent ?? -1, line: g.line })),
    props: [],
    steps: d.steps.map((s) => ({ target: s.target, caption: s.caption, line: s.line })),
    loops: [],
    line: d.line,
    typed: d,
  };
  if (d.id !== undefined) out.id = d.id;
  if (d.title !== undefined) out.title = d.title;
  if (d.direction !== undefined) out.direction = d.direction;
  return out;
}

function noteAttrs(note: string | undefined): Attrs {
  return note === undefined ? {} : { note };
}
