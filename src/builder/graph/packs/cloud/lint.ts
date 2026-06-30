/**
 * lint.ts — cloud pack linter (pure rules over the graph). Platform P4.
 *
 * Each rule is a small pure function (bp, byId) → Diagnostic[]. They catch
 * dangerous or invalid designs BEFORE anything reaches the compiler/runtime.
 * Severity 'block' must be resolved before compile/run; 'warn' is advisory.
 *
 * See VISUAL_CLOUD_BUILDER_ARCHITECTURE.md §6.
 */

import type { Blueprint, GraphNode } from '../../../types/blueprint';
import type { Diagnostic } from '../../spine/domainPack';
import { awsCatalog } from './catalog';

type ById = Map<string, GraphNode>;

const catalogByType = new Map(awsCatalog.map((e) => [e.type, e]));
const labelOf = (type: string) => catalogByType.get(type)?.label ?? type;

const D = (
  severity: Diagnostic['severity'],
  code: string,
  message: string,
  nodeId?: string,
): Diagnostic => ({ severity, code, message, nodeId });

/** True when a security group is attached_to this node. */
function hasSecurityGroup(bp: Blueprint, nodeId: string): boolean {
  return bp.edges.some((e) => e.type === 'attached_to' && e.to === nodeId);
}

/** Walk the parent chain to the enclosing VPC id (for same-VPC checks). */
function vpcIdOf(byId: ById, node: GraphNode): string | undefined {
  let cur: GraphNode | undefined = node;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (cur.type === 'aws_vpc') return cur.id;
    cur = cur.parent ? byId.get(cur.parent) : undefined;
  }
  return undefined;
}

// ── Rules ─────────────────────────────────────────────────────────────────────

/** Containment derives from the service's `container` rule (types + required). */
function ruleContainment(bp: Blueprint, byId: ById): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const n of bp.nodes) {
    const container = catalogByType.get(n.type)?.container;
    if (!container) continue; // top-level service — nothing to check
    const parent = n.parent ? byId.get(n.parent) : undefined;
    const allowed = container.types.map(labelOf).join(' or ');
    if (!parent) {
      if (container.required) out.push(D('block', 'missing-parent', `${n.id} must be placed inside a ${allowed}.`, n.id));
    } else if (!container.types.includes(parent.type)) {
      out.push(D('block', 'wrong-parent', `${n.id} can't be inside ${parent.id} (${labelOf(parent.type)}).`, n.id));
    }
  }
  return out;
}

/** Same-VPC invariant: a `sameVpc` connection's endpoints must share a VPC. */
function ruleSameVpc(bp: Blueprint, byId: ById): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const e of bp.edges) {
    const from = byId.get(e.from);
    const to = byId.get(e.to);
    if (!from || !to) continue;
    const rule = catalogByType.get(from.type)?.connections?.find((r) => r.type === e.type && r.to.includes(to.type));
    if (!rule?.sameVpc) continue;
    const a = vpcIdOf(byId, from);
    const b = vpcIdOf(byId, to);
    if (a && b && a !== b) {
      out.push(D('block', 'cross-vpc', `${from.id} and ${to.id} must be in the same VPC.`, to.id));
    }
  }
  return out;
}

/** A database must never be publicly accessible. */
function rulePublicDb(bp: Blueprint): Diagnostic[] {
  return bp.nodes
    .filter((n) => n.type === 'aws_db_instance' && n.props.publicAccess === 'true')
    .map((n) => D('block', 'public-db', `${n.id} is publicly accessible. Make it private.`, n.id));
}

/** A database must not sit in a public subnet. */
function ruleDbInPublicSubnet(bp: Blueprint, byId: ById): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const n of bp.nodes) {
    if (n.type !== 'aws_db_instance') continue;
    const parent = n.parent ? byId.get(n.parent) : undefined;
    if (parent?.type === 'aws_subnet' && parent.props.public === 'true') {
      out.push(D('block', 'db-public-subnet', `${n.id} is in a public subnet (${parent.id}). Move it to a private subnet.`, n.id));
    }
  }
  return out;
}

/** Compute/DB resources should have a security group. */
function ruleMissingSecurityGroup(bp: Blueprint): Diagnostic[] {
  const guarded = ['aws_instance', 'aws_db_instance', 'aws_ecs_service'];
  return bp.nodes
    .filter((n) => guarded.includes(n.type) && !hasSecurityGroup(bp, n.id))
    .map((n) => D('warn', 'no-security-group', `${n.id} has no security group attached.`, n.id));
}

/** Admin ports (SSH/RDP) open to the world — our SG ingress is always 0.0.0.0/0. */
function ruleOpenAdminPort(bp: Blueprint): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const n of bp.nodes) {
    if (n.type !== 'aws_security_group') continue;
    const port = Number(n.props.ingressPort);
    if (port === 22) out.push(D('block', 'ssh-open', `${n.id} opens SSH (22) to 0.0.0.0/0.`, n.id));
    if (port === 3389) out.push(D('block', 'rdp-open', `${n.id} opens RDP (3389) to 0.0.0.0/0.`, n.id));
  }
  return out;
}

/** Public-read buckets are usually a mistake. */
function rulePublicBucket(bp: Blueprint): Diagnostic[] {
  return bp.nodes
    .filter((n) => n.type === 'aws_s3_bucket' && n.props.acl === 'public-read')
    .map((n) => D('warn', 'public-bucket', `${n.id} is public-read.`, n.id));
}

export function lintCloud(bp: Blueprint): Diagnostic[] {
  const byId: ById = new Map(bp.nodes.map((n) => [n.id, n]));
  return [
    ...ruleContainment(bp, byId),
    ...ruleSameVpc(bp, byId),
    ...rulePublicDb(bp),
    ...ruleDbInPublicSubnet(bp, byId),
    ...ruleMissingSecurityGroup(bp),
    ...ruleOpenAdminPort(bp),
    ...rulePublicBucket(bp),
  ];
}
