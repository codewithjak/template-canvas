/**
 * planTypes.ts — shared shape of a Terraform plan as the UI consumes it.
 * Produced either locally (simulatePlan) or by the backend parsing a real
 * `terraform plan -json`.
 */

export type PlanAction = 'create' | 'update' | 'delete' | 'replace' | 'read' | 'no-op';

export interface PlanResource {
  address: string; // e.g. aws_instance.ec2_web
  type: string;
  name: string;
  action: PlanAction;
}

export interface Plan {
  summary: { add: number; change: number; destroy: number };
  resources: PlanResource[];
  simulated?: boolean; // true = local preview, not a real plan against state
}
