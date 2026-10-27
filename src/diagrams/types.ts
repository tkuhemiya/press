import type { DiagramType } from '../model.ts';

export interface TypeSpec {
  reserved: string[];
  kinds: string[];
  directional: boolean;
  attrs: string[];
  props?: boolean;
}

export const TYPE_SPECS: Record<DiagramType, TypeSpec> = {
  'state-machine': { reserved: ['start', 'end'], kinds: [], directional: true, attrs: [] },
  sequence: {
    reserved: [],
    kinds: ['user', 'service', 'database', 'queue', 'external'],
    directional: false,
    attrs: [],
  },
  architecture: {
    reserved: [],
    kinds: ['client', 'service', 'database', 'queue', 'cache', 'storage', 'external', 'user'],
    directional: true,
    attrs: [],
  },
  'causal-loop': { reserved: ['loop'], kinds: [], directional: false, attrs: ['delay'] },
  timeline: { reserved: [], kinds: [], directional: true, attrs: ['until'] },
  'decision-tree': { reserved: [], kinds: [], directional: true, attrs: [] },
  er: { reserved: [], kinds: [], directional: true, attrs: ['key', 'unique', 'null', 'card'], props: true },
  tradeoffs: { reserved: [], kinds: [], directional: true, attrs: [], props: true },
};
