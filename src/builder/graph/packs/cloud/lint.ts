/**
 * lint.ts — cloud pack linter (pure rules over the graph). Stub for P4.
 *
 * P4 rules: public DB / publicly_accessible, SSH open to 0.0.0.0/0, an instance
 * with no security group, unencrypted storage, …
 */

import type { Blueprint } from '../../../types/blueprint';
import type { Diagnostic } from '../../spine/domainPack';

export function lintCloud(bp: Blueprint): Diagnostic[] {
  // No rules implemented yet (P4). Walk nodes so the contract is exercised;
  // each rule will push Diagnostics after inspecting bp.nodes / bp.edges.
  return bp.nodes.flatMap((): Diagnostic[] => []);
}
