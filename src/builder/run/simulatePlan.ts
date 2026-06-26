/**
 * simulatePlan.ts — a local stand-in for a real `terraform plan`.
 *
 * Parses the compiled HCL and presents every resource as an addition, so the
 * plan-review UI works end-to-end in the browser without a cloud account. A
 * real plan (P6 backend) diffs against remote state and yields ~/− as well.
 */

import type { Plan, PlanResource } from './planTypes';

const RESOURCE_RE = /resource\s+"([^"]+)"\s+"([^"]+)"/g;

export function simulatePlanFromHcl(hcl: string): Plan {
  const resources: PlanResource[] = [];
  let m: RegExpExecArray | null;
  while ((m = RESOURCE_RE.exec(hcl)) !== null) {
    resources.push({ address: `${m[1]}.${m[2]}`, type: m[1], name: m[2], action: 'create' });
  }
  RESOURCE_RE.lastIndex = 0;
  return { summary: { add: resources.length, change: 0, destroy: 0 }, resources, simulated: true };
}
