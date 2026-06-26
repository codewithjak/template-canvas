/**
 * blueprint.ts — src/builder/types/blueprint.ts
 *
 * The single graph model shared by every builder pack (cloud, agent, ui).
 * Pure TypeScript — no React, no pack-specific knowledge.
 *
 * Three structural facts drive every compiler:
 *   parent  → containment (a node nested inside another)
 *   edge    → a relationship (compiles to a reference / rule / control-flow)
 *   props   → a node's own arguments
 *
 * See BUILDER_PLATFORM_ARCHITECTURE.md §4.
 */

export type NodeId = string;

export interface GraphNode {
  id: NodeId;
  type: string;                        // catalog key, e.g. "aws_instance"
  parent?: NodeId;                     // containment
  props: Record<string, unknown>;      // node arguments
  position?: { x: number; y: number }; // canvas coordinates (UI only)
}

export interface GraphEdge {
  id: string;
  from: NodeId;
  to: NodeId;
  type: string;                        // "attached_to" | "connects_to" | "next" | …
  props?: Record<string, unknown>;     // e.g. { port: 5432 } or { when: "true" }
}

export interface BlueprintMeta {
  pack: string;                        // which DomainPack owns this graph
  name: string;
  provider?: string;                   // cloud pack only: "aws" | "azure" | "gcp"
}

export interface Blueprint {
  nodes: GraphNode[];
  edges: GraphEdge[];
  meta: BlueprintMeta;
}

/** A fresh, empty blueprint for a pack. */
export function emptyBlueprint(pack: string, name = 'Untitled'): Blueprint {
  return { nodes: [], edges: [], meta: { pack, name } };
}

/** Look up a node by id (or undefined). */
export function nodeById(bp: Blueprint, id: NodeId): GraphNode | undefined {
  return bp.nodes.find((n) => n.id === id);
}

/** Direct children of a container node. */
export function childrenOf(bp: Blueprint, parent: NodeId): GraphNode[] {
  return bp.nodes.filter((n) => n.parent === parent);
}

/** Edges pointing INTO a node — used by compilers to resolve relationships. */
export function incomingEdges(bp: Blueprint, to: NodeId): GraphEdge[] {
  return bp.edges.filter((e) => e.to === to);
}
