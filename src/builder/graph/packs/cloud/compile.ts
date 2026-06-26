/**
 * compile.ts — cloud pack compiler (graph → Terraform).
 *
 * A pure function using the registry-of-emitters pattern (one emitter per node
 * type — mirrors backend/renderer/elementDrawers.js). Stub returns a header;
 * the real per-provider emitters (containment → refs, edges → rules, resource
 * synthesis) land in P3. Provider dispatch (aws/azure/gcp) per §3.2.
 */

import type { Blueprint } from '../../../types/blueprint';

export function compileToTerraform(bp: Blueprint): string {
  // TODO P3: select per-provider emitter registry from bp.meta.provider.
  const provider = bp.meta.provider ?? 'aws';
  return `# Terraform for "${bp.meta.name}" (${provider})\n`
    + `# ${bp.nodes.length} node(s) — emitters not yet implemented (P3).\n`;
}
