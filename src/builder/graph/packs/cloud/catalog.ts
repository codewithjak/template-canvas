/**
 * catalog.ts — cloud pack node catalog (AWS, v1 core nodes).
 *
 * One factory per service (mirrors elementFactories.ts), each carrying:
 *   • default props        — sensible starting values
 *   • fields               — the properties-panel schema (data-driven)
 *   • container            — the provider's containment rule (types + required)
 *   • connections          — permitted outgoing connections (the rules the canvas
 *                            enforces and the P3 compiler consumes)
 *
 * The container/connection rules are the provider's HARD rules, declared as data
 * and enforced uniformly by the constraint engine. See
 * CLOUD_CONSTRAINTS_ARCHITECTURE.md and VISUAL_CLOUD_BUILDER_ARCHITECTURE.md P2.
 */

import type { CatalogEntry, ConnectionRule, ContainerRule, FieldDescriptor, NodeCatalog } from '../../spine/domainPack';
import type { GraphNode } from '../../../types/blueprint';

const AZS = ['us-east-1a', 'us-east-1b', 'us-east-1c'];

// ── tiny field + node builders (keep each entry a one-liner) ──────────────────
const txt = (key: string, label: string): FieldDescriptor => ({ key, label, kind: 'text' });
const num = (key: string, label: string): FieldDescriptor => ({ key, label, kind: 'number' });
const sel = (key: string, label: string, options: string[]): FieldDescriptor =>
  ({ key, label, kind: 'select', options });
const code = (key: string, label: string): FieldDescriptor => ({ key, label, kind: 'textarea' });

/** Containment helper: contained in one of `types`, required by default. */
const inside = (types: string[], required = true): ContainerRule => ({ types, required });

function node(
  type: string,
  label: string,
  group: string,
  defaults: Record<string, unknown>,
  fields: FieldDescriptor[],
  rules: { container?: ContainerRule; connections?: ConnectionRule[]; invariants?: string[] } = {},
): CatalogEntry {
  const prefix = type.replace(/^aws_/, '');
  return {
    type,
    label,
    group,
    fields,
    container: rules.container,
    connections: rules.connections,
    invariants: rules.invariants,
    create: (): GraphNode => ({ id: `${prefix}-${Date.now()}`, type, props: { ...defaults } }),
  };
}

export const awsCatalog: NodeCatalog = [
  // ── Network ─────────────────────────────────────────────────────────────
  node('aws_vpc', 'VPC', 'Network',
    { name: 'main', cidr: '10.0.0.0/16', nat: 'false' },
    [txt('name', 'Name'), txt('cidr', 'CIDR block'), sel('nat', 'NAT egress (private subnets)', ['false', 'true'])]),

  node('aws_subnet', 'Subnet', 'Network',
    { cidr: '10.0.1.0/24', az: 'us-east-1a', public: 'true' },
    [txt('cidr', 'CIDR block'), sel('az', 'Availability zone', AZS), sel('public', 'Public', ['true', 'false'])],
    { container: inside(['aws_vpc']), invariants: ['cidr-within-vpc'] }),

  node('aws_security_group', 'Security Group', 'Network',
    { name: 'web', ingressPort: '443' },
    [txt('name', 'Name'), num('ingressPort', 'Ingress port')],
    {
      container: inside(['aws_vpc']),
      connections: [{ type: 'attached_to', to: ['aws_instance', 'aws_db_instance', 'aws_lb', 'aws_ecs_service'], sameVpc: true }],
    }),

  node('aws_lb', 'Load Balancer (ALB)', 'Network',
    { name: 'web-alb', scheme: 'internet-facing', targetPort: '80' },
    [txt('name', 'Name'), sel('scheme', 'Scheme', ['internet-facing', 'internal']), num('targetPort', 'Target port')],
    { container: inside(['aws_vpc']), connections: [{ type: 'routes_to', to: ['aws_instance', 'aws_ecs_service'] }] }),

  node('aws_cloudfront_distribution', 'CloudFront', 'Network',
    { comment: 'cdn' },
    [txt('comment', 'Comment')],
    { connections: [{ type: 'origin', to: ['aws_s3_bucket', 'aws_lb'] }] }),

  // ── Compute ─────────────────────────────────────────────────────────────
  node('aws_instance', 'EC2 Instance', 'Compute',
    { name: 'web-1', ami: 'ami-0abc123', size: 't3.micro' },
    [txt('name', 'Name'), txt('ami', 'AMI'), sel('size', 'Instance type', ['t3.micro', 't3.small', 't3.medium', 't3.large'])],
    {
      container: inside(['aws_subnet']),
      connections: [
        { type: 'connects_to', to: ['aws_db_instance'] },
        { type: 'uses_role', to: ['aws_iam_role'], max: 1 },
      ],
    }),

  node('aws_ecs_service', 'ECS Service (Fargate)', 'Compute',
    { name: 'app', desiredCount: '2', cpu: '256', memory: '512' },
    [txt('name', 'Name'), num('desiredCount', 'Desired count'), sel('cpu', 'CPU', ['256', '512', '1024']), sel('memory', 'Memory (MB)', ['512', '1024', '2048'])],
    { container: inside(['aws_subnet']), connections: [{ type: 'connects_to', to: ['aws_db_instance'] }] }),

  // ── Database ────────────────────────────────────────────────────────────
  node('aws_db_instance', 'RDS Database', 'Database',
    { engine: 'postgres', size: 'db.t3.micro', publicAccess: 'false' },
    [sel('engine', 'Engine', ['postgres', 'mysql', 'mariadb']), sel('size', 'Instance class', ['db.t3.micro', 'db.t3.small', 'db.t3.medium']), sel('publicAccess', 'Publicly accessible', ['false', 'true'])],
    { container: inside(['aws_subnet']), invariants: ['rds-needs-two-azs'] }),

  // ── Storage ─────────────────────────────────────────────────────────────
  node('aws_s3_bucket', 'S3 Bucket', 'Storage',
    { name: 'my-bucket', acl: 'private' },
    [txt('name', 'Bucket name'), sel('acl', 'ACL', ['private', 'public-read'])]),

  // ── Security ────────────────────────────────────────────────────────────
  node('aws_iam_role', 'IAM Role', 'Security',
    { name: 'app-role', managedPolicyArn: '' },
    [txt('name', 'Name'), txt('managedPolicyArn', 'Managed policy ARN (optional)')]),

  // ── API + serverless compute ──────────────────────────────────────────────
  node('aws_apigatewayv2_api', 'API Gateway (HTTP)', 'Network',
    { name: 'http-api' },
    [txt('name', 'Name')],
    { connections: [{ type: 'route', to: ['aws_lambda_function'] }] }),

  node('aws_lambda_function', 'Lambda Function', 'Compute',
    {
      name: 'fn', runtime: 'nodejs20.x', handler: 'index.handler', memory: '128', timeout: '3',
      method: 'GET', path: '/',
      code: 'exports.handler = async (event) => ({\n  statusCode: 200,\n  headers: { "content-type": "application/json" },\n  body: JSON.stringify({ message: "hello from mapdoc" }),\n});',
    },
    [
      txt('name', 'Name'), sel('runtime', 'Runtime', ['nodejs20.x', 'python3.12', 'go1.x', 'java21']),
      txt('handler', 'Handler'), num('memory', 'Memory (MB)'), num('timeout', 'Timeout (s)'),
      sel('method', 'HTTP method', ['GET', 'POST', 'PUT', 'DELETE', 'ANY']), txt('path', 'Route path'),
      code('code', 'Handler code'),
    ],
    { connections: [{ type: 'uses_role', to: ['aws_iam_role'], max: 1 }] }),

  // ── Data ──────────────────────────────────────────────────────────────────
  node('aws_dynamodb_table', 'DynamoDB Table', 'Database',
    { name: 'table', hashKey: 'id', billingMode: 'PAY_PER_REQUEST' },
    [txt('name', 'Name'), txt('hashKey', 'Partition key'), sel('billingMode', 'Billing mode', ['PAY_PER_REQUEST', 'PROVISIONED'])]),

  // ── Observability ─────────────────────────────────────────────────────────
  node('aws_cloudwatch_log_group', 'CloudWatch Log Group', 'Observability',
    { name: '/aws/app', retentionDays: '14' },
    [txt('name', 'Name'), num('retentionDays', 'Retention (days)')]),

  // ── Messaging ─────────────────────────────────────────────────────────────
  node('aws_sqs_queue', 'SQS Queue', 'Messaging',
    { name: 'queue', fifo: 'false', visibilityTimeout: '30' },
    [txt('name', 'Name'), sel('fifo', 'FIFO', ['false', 'true']), num('visibilityTimeout', 'Visibility timeout (s)')]),

  node('aws_sns_topic', 'SNS Topic', 'Messaging',
    { name: 'topic' },
    [txt('name', 'Name')],
    { connections: [{ type: 'publishes_to', to: ['aws_sqs_queue'] }] }),
];
