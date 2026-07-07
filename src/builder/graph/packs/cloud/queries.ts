/**
 * queries.ts — shared structural queries over a cloud blueprint.
 *
 * Small pure graph walks used by BOTH the compiler and the linter, kept in one
 * place so the two layers can't drift apart.
 */

import type { GraphNode } from '../../../types/blueprint';

/** Walk a node's parent chain to the enclosing VPC id (or undefined). */
export function vpcIdOf(byId: Map<string, GraphNode>, node: GraphNode): string | undefined {
  let cur: GraphNode | undefined = node;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (cur.type === 'aws_vpc') return cur.id;
    cur = cur.parent ? byId.get(cur.parent) : undefined;
  }
  return undefined;
}
