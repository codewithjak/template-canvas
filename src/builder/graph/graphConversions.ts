/**
 * graphConversions.ts — src/builder/graph/graphConversions.ts
 *
 * Pure conversions between the Blueprint model and React Flow's live state.
 * Kept out of GraphCanvasBase.tsx so that file exports only a component
 * (fast-refresh requirement), and so the run-loop can reuse `toBlueprint`
 * without importing the canvas component.
 */

import type { Node, Edge } from '@xyflow/react';
import type { Blueprint } from '../types/blueprint';
import type { NodeCatalog } from './spine/domainPack';

/** What each React Flow node carries from our domain model. */
export interface GraphNodeData extends Record<string, unknown> {
  label: string;
  nodeType: string;
  props: Record<string, unknown>;
}
export type RFNode = Node<GraphNodeData>;
export type RFEdge = Edge;

export function toRFNodes(bp: Blueprint | undefined, catalog: NodeCatalog): RFNode[] {
  if (!bp) return [];
  return bp.nodes.map((n) => ({
    id: n.id,
    position: n.position ?? { x: 80, y: 80 },
    parentId: n.parent,
    data: {
      label: catalog.find((e) => e.type === n.type)?.label ?? n.type,
      nodeType: n.type,
      props: n.props,
    },
  }));
}

export function toRFEdges(bp: Blueprint | undefined): RFEdge[] {
  if (!bp) return [];
  return bp.edges.map((e) => ({ id: e.id, source: e.from, target: e.to, label: e.type }));
}

/** Snapshot the live canvas back to the pure Blueprint the pack compiles. */
export function toBlueprint(
  pack: string,
  nodes: RFNode[],
  edges: RFEdge[],
  name = 'Untitled',
): Blueprint {
  return {
    meta: { pack, name },
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.data.nodeType,
      parent: n.parentId,
      props: n.data.props,
      position: n.position,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      from: e.source,
      to: e.target,
      type: typeof e.label === 'string' ? e.label : 'edge',
    })),
  };
}
