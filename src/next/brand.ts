import type { DiagramId, EdgeIndex, GroupId, Html, NodeId } from './model.ts';

export const nodeId = (s: string): NodeId => s as NodeId;
export const diagramId = (s: string): DiagramId => s as DiagramId;
export const groupId = (i: number): GroupId => i as GroupId;
export const edgeIndex = (i: number): EdgeIndex => i as EdgeIndex;
export const trusted = (s: string): Html => s as Html;
