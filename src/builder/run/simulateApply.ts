/**
 * simulateApply.ts — local stand-in for `terraform apply`, so the
 * approve→applied→outputs flow is demonstrable without a cloud account.
 * A real apply (P7 backend) provisions in the user's account and returns real
 * `terraform output` values.
 */

import type { Plan } from './planTypes';

export interface AppliedResult {
  created: string[]; // resource addresses
  outputs: Record<string, string>;
  simulated?: boolean;
}

export function simulateApply(plan: Plan): AppliedResult {
  const created = plan.resources.map((r) => r.address);
  const outputs: Record<string, string> = {};
  for (const r of plan.resources) {
    if (r.type === 'aws_lb') outputs[`${r.name}_dns`] = `${r.name}.elb.amazonaws.com (simulated)`;
    if (r.type === 'aws_db_instance') outputs[`${r.name}_endpoint`] = `${r.name}.rds.amazonaws.com:5432 (simulated)`;
    if (r.type === 'aws_cloudfront_distribution') outputs[`${r.name}_domain`] = `d123.cloudfront.net (simulated)`;
    if (r.type === 'aws_s3_bucket') outputs[`${r.name}_bucket`] = `${r.name} (simulated)`;
  }
  return { created, outputs, simulated: true };
}
