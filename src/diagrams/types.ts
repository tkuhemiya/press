// What each diagram type adds to the shared grammar: its reserved words and node kinds.
import type { DiagramType } from '../model.ts';

export interface TypeSpec {
  // Ids an author may not declare. `steps` is reserved everywhere.
  reserved: string[];
  // The closed list of node kinds. Empty means declarations take only a label.
  kinds: string[];
  // Whether the `direction` header field means anything.
  directional: boolean;
}

export const TYPE_SPECS: Record<DiagramType, TypeSpec> = {
  'state-machine': { reserved: ['start', 'end'], kinds: [], directional: true },
  sequence: { reserved: [], kinds: ['user', 'service', 'database', 'queue', 'external'], directional: false },
  architecture: { reserved: [], kinds: ['client', 'service', 'database', 'queue', 'cache', 'storage', 'external', 'user'], directional: true },
};
