import {
  ARCHITECTURE_KINDS,
  C4_KINDS,
  DATA_FLOW_KINDS,
  DEPLOYMENT_KINDS,
  SEQUENCE_KINDS,
  type DiagramType,
} from '../model.ts';
import type { Grammar, LineForm } from './grammar.ts';

const plain = { reserved: [], kinds: [], attrs: [], forms: [], icons: false } as const;

export const GRAMMARS: { [T in DiagramType]: Grammar } = {
  'state-machine': { ...plain, reserved: ['start', 'end'], directional: true },
  sequence: { ...plain, kinds: SEQUENCE_KINDS, icons: true, forms: ['phase'], directional: false },
  architecture: { ...plain, kinds: ARCHITECTURE_KINDS, icons: true, directional: true },
  'data-flow': { ...plain, kinds: DATA_FLOW_KINDS, directional: true },
  c4: { ...plain, kinds: C4_KINDS, attrs: ['external', 'tech'], directional: true },
  deployment: { ...plain, kinds: DEPLOYMENT_KINDS, icons: true, directional: true },
  'causal-loop': { ...plain, attrs: ['delay'], forms: ['loop'], directional: false },
  timeline: { ...plain, attrs: ['until'], forms: ['event', 'lane'], directional: true },
  'decision-tree': { ...plain, directional: true },
  er: { ...plain, attrs: ['key', 'unique', 'null', 'card'], forms: ['prop', 'field'], directional: true },
  tradeoffs: { ...plain, forms: ['prop'], directional: true },
};

export function formsElsewhere(form: LineForm): DiagramType[] {
  return Object.entries(GRAMMARS).flatMap(([type, g]) => (g.forms.includes(form) && isDiagramType(type) ? [type] : []));
}

export function isDiagramType(type: string): type is DiagramType {
  return Object.hasOwn(GRAMMARS, type);
}
