/**
 * catalog.ts — cloud pack node catalog (AWS, v1 core nodes — P2).
 *
 * ~10 core services. One factory per node type (mirrors elementFactories.ts),
 * each carrying:
 *   • default props        — sensible starting values
 *   • fields               — the properties-panel schema (data-driven)
 *   • parents              — valid container types (containment rules)
 *   • edges                — permitted outgoing connections (the rules the
 *                            canvas enforces and the P3 compiler consumes)
 *
 * See VISUAL_CLOUD_BUILDER_ARCHITECTURE.md P2.
 */

import type { CatalogEntry, EdgeRule, FieldDescriptor, NodeCatalog } from '../../spine/domainPack';
import type { GraphNode } from '../../../types/blueprint';

const AZS = ['us-east-1a', 'us-east-1b', 'us-east-1c'];

// ── tiny field + node builders (keep each entry a one-liner) ──────────────────
const txt = (key: string, label: string): FieldDescriptor => ({ key, label, kind: 'text' });
const num = (key: string, label: string): FieldDescriptor => ({ key, label, kind: 'number' });
const sel = (key: string, label: string, options: string[]): FieldDescriptor =>
  ({ key, label, kind: 'select', options });

function node(
  type: string,
  label: string,
  group: string,
  defaults: Record<string, unknown>,
  fields: FieldDescriptor[],
  rules: { parents?: string[]; edges?: EdgeRule[] } = {},
): CatalogEntry {
  const prefix = type.replace(/^aws_/, '');
  return {
    type,
    label,
    group,
    fields,
    parents: rules.parents,
    edges: rules.edges,
    create: (): GraphNode => ({ id: `${prefix}-${Date.now()}`, type, props: { ...defaults } }),
  };
}

export const awsCatalog: NodeCatalog = [
  // ── Network ─────────────────────────────────────────────────────────────
  node('aws_vpc', 'VPC', 'Network',
    { name: 'main', cidr: '10.0.0.0/16' },
    [txt('name', 'Name'), txt('cidr', 'CIDR block')]),

  node('aws_subnet', 'Subnet', 'Network',
    { cidr: '10.0.1.0/24', az: 'us-east-1a', public: 'true' },
    [txt('cidr', 'CIDR block'), sel('az', 'Availability zone', AZS), sel('public', 'Public', ['true', 'false'])],
    { parents: ['aws_vpc'] }),

  node('aws_security_group', 'Security Group', 'Network',
    { name: 'web', ingressPort: '443' },
    [txt('name', 'Name'), num('ingressPort', 'Ingress port')],
    { parents: ['aws_vpc'], edges: [{ type: 'attached_to', to: ['aws_instance', 'aws_db_instance', 'aws_lb', 'aws_ecs_service'] }] }),

  node('aws_lb', 'Load Balancer (ALB)', 'Network',
    { name: 'web-alb', scheme: 'internet-facing' },
    [txt('name', 'Name'), sel('scheme', 'Scheme', ['internet-facing', 'internal'])],
    { parents: ['aws_vpc'], edges: [{ type: 'routes_to', to: ['aws_instance', 'aws_ecs_service'] }] }),

  node('aws_cloudfront_distribution', 'CloudFront', 'Network',
    { comment: 'cdn' },
    [txt('comment', 'Comment')],
    { edges: [{ type: 'origin', to: ['aws_s3_bucket', 'aws_lb'] }] }),

  // ── Compute ─────────────────────────────────────────────────────────────
  node('aws_instance', 'EC2 Instance', 'Compute',
    { name: 'web-1', ami: 'ami-0abc123', size: 't3.micro' },
    [txt('name', 'Name'), txt('ami', 'AMI'), sel('size', 'Instance type', ['t3.micro', 't3.small', 't3.medium', 't3.large'])],
    { parents: ['aws_subnet'], edges: [{ type: 'connects_to', to: ['aws_db_instance'] }] }),

  node('aws_ecs_service', 'ECS Service (Fargate)', 'Compute',
    { name: 'app', desiredCount: '2', cpu: '256', memory: '512' },
    [txt('name', 'Name'), num('desiredCount', 'Desired count'), sel('cpu', 'CPU', ['256', '512', '1024']), sel('memory', 'Memory (MB)', ['512', '1024', '2048'])],
    { parents: ['aws_subnet'], edges: [{ type: 'connects_to', to: ['aws_db_instance'] }] }),

  // ── Database ────────────────────────────────────────────────────────────
  node('aws_db_instance', 'RDS Database', 'Database',
    { engine: 'postgres', size: 'db.t3.micro', publicAccess: 'false' },
    [sel('engine', 'Engine', ['postgres', 'mysql', 'mariadb']), sel('size', 'Instance class', ['db.t3.micro', 'db.t3.small', 'db.t3.medium']), sel('publicAccess', 'Publicly accessible', ['false', 'true'])],
    { parents: ['aws_subnet'] }),

  // ── Storage ─────────────────────────────────────────────────────────────
  node('aws_s3_bucket', 'S3 Bucket', 'Storage',
    { name: 'my-bucket', acl: 'private' },
    [txt('name', 'Bucket name'), sel('acl', 'ACL', ['private', 'public-read'])]),

  // ── Security ────────────────────────────────────────────────────────────
  node('aws_iam_role', 'IAM Role', 'Security',
    { name: 'app-role' },
    [txt('name', 'Name')]),
];
