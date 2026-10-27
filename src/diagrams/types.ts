// What each diagram type adds to the shared grammar: its reserved words and node kinds.
import type { DiagramType } from '../model.ts';

export interface TypeSpec {
  // Ids an author may not declare. `steps` is reserved everywhere.
  reserved: string[];
  // The closed list of node kinds. Empty means declarations take only a label.
  kinds: string[];
  // Whether the `direction` header field means anything.
  directional: boolean;
  // Attributes this type adds to `role` and `note`.
  attrs: string[];
  // Whether the type has properties: `node.key : value`.
  props?: boolean;
}

export const TYPE_SPECS: Record<DiagramType, TypeSpec> = {
  'state-machine': { reserved: ['start', 'end'], kinds: [], directional: true, attrs: [] },
  sequence: { reserved: [], kinds: ['user', 'service', 'database', 'queue', 'external'], directional: false, attrs: [] },
  architecture: { reserved: [], kinds: ['client', 'service', 'database', 'queue', 'cache', 'storage', 'external', 'user'], directional: true, attrs: [] },
  'causal-loop': { reserved: ['loop'], kinds: [], directional: false, attrs: ['delay'] },
  timeline: { reserved: [], kinds: [], directional: true, attrs: ['until'] },
  'decision-tree': { reserved: [], kinds: [], directional: true, attrs: [] },
  er: { reserved: [], kinds: [], directional: true, attrs: ['key', 'unique', 'null', 'card'], props: true },
  tradeoffs: { reserved: [], kinds: [], directional: true, attrs: [], props: true },
};
