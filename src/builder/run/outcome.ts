/**
 * outcome.ts — helpers for reflecting run results back onto the graph and for
 * local idempotency (re-running an unchanged blueprint shows "no changes").
 */

import type { Blueprint } from '../types/blueprint';

/** Terraform local name — mirrors the compiler's sanitizer. */
export const tname = (id: string) => id.replace(/[^a-zA-Z0-9_]/g, '_');

/**
 * A stable signature of the blueprint's MEANING (nodes + edges + props),
 * ignoring canvas positions — so dragging a node doesn't count as a change.
 */
export function blueprintSignature(bp: Blueprint): string {
  const nodes = bp.nodes
    .map((n) => ({ id: n.id, type: n.type, parent: n.parent ?? null, props: n.props }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const edges = bp.edges
    .map((e) => ({ from: e.from, to: e.to, type: e.type, props: e.props ?? null }))
    .sort((a, b) => (a.from + a.to + a.type < b.from + b.to + b.type ? -1 : 1));
  return JSON.stringify({ nodes, edges });
}

/** Which current nodes correspond to applied resource addresses (type.tname). */
export function appliedNodeIds(bp: Blueprint, created: string[]): Set<string> {
  const createdSet = new Set(created);
  const ids = new Set<string>();
  for (const n of bp.nodes) {
    if (createdSet.has(`${n.type}.${tname(n.id)}`)) ids.add(n.id);
  }
  return ids;
}
