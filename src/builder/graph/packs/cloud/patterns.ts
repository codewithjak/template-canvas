/**
 * patterns.ts — vetted reference blueprints (P10).
 *
 * The architect SELECTS + ADAPTS one of these rather than free-generating, so
 * every result is a known-good, lint-clean graph built from catalog nodes. Each
 * carries tags used by the local keyword fallback when the LLM isn't available.
 */

import type { Blueprint, GraphNode, GraphEdge } from '../../../types/blueprint';

export interface PatternMeta { id: string; title: string; description: string; }
interface Pattern extends PatternMeta { tags: string[]; blueprint: Blueprint; }

type Part = { nodes: GraphNode[]; edges: GraphEdge[] };

/** Shared 3-tier network: public subnet + two private subnets + web/db SGs. */
const network = (): Part => ({
  nodes: [
    { id: 'vpc', type: 'aws_vpc', props: { name: 'main', cidr: '10.0.0.0/16' } },
    { id: 'subnet-pub', type: 'aws_subnet', parent: 'vpc', props: { cidr: '10.0.1.0/24', az: 'us-east-1a', public: 'true' } },
    { id: 'subnet-a', type: 'aws_subnet', parent: 'vpc', props: { cidr: '10.0.2.0/24', az: 'us-east-1a', public: 'false' } },
    { id: 'subnet-b', type: 'aws_subnet', parent: 'vpc', props: { cidr: '10.0.3.0/24', az: 'us-east-1b', public: 'false' } },
    { id: 'sg-web', type: 'aws_security_group', parent: 'vpc', props: { name: 'web', ingressPort: '443' } },
    { id: 'sg-db', type: 'aws_security_group', parent: 'vpc', props: { name: 'db', ingressPort: '5432' } },
  ],
  edges: [],
});

/** ALB → Fargate → private Postgres, wired and secured. */
const webTier = (): Part => ({
  nodes: [
    { id: 'alb', type: 'aws_lb', parent: 'vpc', props: { name: 'app-alb', scheme: 'internet-facing' } },
    { id: 'app', type: 'aws_ecs_service', parent: 'subnet-pub', props: { name: 'app', desiredCount: '2', cpu: '512', memory: '1024' } },
    { id: 'db', type: 'aws_db_instance', parent: 'subnet-a', props: { engine: 'postgres', size: 'db.t3.micro', publicAccess: 'false' } },
  ],
  edges: [
    { id: 'e-web-alb', from: 'sg-web', to: 'alb', type: 'attached_to' },
    { id: 'e-web-app', from: 'sg-web', to: 'app', type: 'attached_to' },
    { id: 'e-db-rds', from: 'sg-db', to: 'db', type: 'attached_to' },
    { id: 'e-alb-app', from: 'alb', to: 'app', type: 'routes_to' },
    { id: 'e-app-db', from: 'app', to: 'db', type: 'connects_to' },
  ],
});

const s3 = (id: string, bucket: string): GraphNode => ({ id, type: 'aws_s3_bucket', props: { name: bucket, acl: 'private' } });

function makeBlueprint(name: string, parts: Part[]): Blueprint {
  return {
    nodes: parts.flatMap((p) => p.nodes),
    edges: parts.flatMap((p) => p.edges),
    meta: { pack: 'cloud', name, provider: 'aws', region: 'us-east-1' },
  };
}

export const PATTERNS: Pattern[] = [
  {
    id: 'basic-web-server',
    title: 'Basic web server',
    description: 'A VPC with one public subnet, a security group, and an EC2 instance.',
    tags: ['basic', 'simple', 'starter', 'minimal', 'web server', 'vm', 'ec2'],
    blueprint: makeBlueprint('Basic web server', [{
      nodes: [
        { id: 'vpc', type: 'aws_vpc', props: { name: 'main', cidr: '10.0.0.0/16' } },
        { id: 'subnet-pub', type: 'aws_subnet', parent: 'vpc', props: { cidr: '10.0.1.0/24', az: 'us-east-1a', public: 'true' } },
        { id: 'sg-web', type: 'aws_security_group', parent: 'vpc', props: { name: 'web', ingressPort: '443' } },
        { id: 'web', type: 'aws_instance', parent: 'subnet-pub', props: { name: 'web-1', ami: 'ami-0abc123', size: 't3.micro' } },
      ],
      edges: [{ id: 'e-sg-web', from: 'sg-web', to: 'web', type: 'attached_to' }],
    }]),
  },
  {
    id: 'realtime-voice-app',
    title: 'Real-time voice agent',
    description: 'Public ALB + Fargate backend, private Postgres, and an S3 bucket for recordings — the infra for a live voice-agent app.',
    tags: ['voice', 'agent', 'call', 'realtime', 'audio', 'speech', 'phone'],
    blueprint: makeBlueprint('Voice agent', [network(), webTier(), { nodes: [s3('recordings', 'voice-recordings')], edges: [] }]),
  },
  {
    id: 'crud-web-app',
    title: 'CRUD web app / API',
    description: 'ALB + Fargate + private Postgres in a VPC — a standard backend or dashboard.',
    tags: ['crud', 'api', 'backend', 'web', 'app', 'dashboard', 'saas', 'service'],
    blueprint: makeBlueprint('Web app', [network(), webTier()]),
  },
  {
    id: 'static-site-api',
    title: 'Static site + API',
    description: 'S3 + CloudFront for the frontend, plus an ALB / Fargate / Postgres API tier.',
    tags: ['static', 'site', 'website', 'landing', 'spa', 'frontend', 'marketing'],
    blueprint: makeBlueprint('Static site + API', [
      network(),
      webTier(),
      {
        nodes: [s3('site', 'site-assets'), { id: 'cdn', type: 'aws_cloudfront_distribution', props: { comment: 'site cdn' } }],
        edges: [{ id: 'e-cdn-site', from: 'cdn', to: 'site', type: 'origin' }],
      },
    ]),
  },
  {
    id: 'data-pipeline',
    title: 'Data pipeline',
    description: 'S3 raw + processed buckets, a worker instance, and an IAM role.',
    tags: ['data', 'pipeline', 'etl', 'batch', 'analytics', 'process', 'ingest'],
    blueprint: makeBlueprint('Data pipeline', [{
      nodes: [
        { id: 'vpc', type: 'aws_vpc', props: { name: 'main', cidr: '10.0.0.0/16' } },
        { id: 'subnet-pub', type: 'aws_subnet', parent: 'vpc', props: { cidr: '10.0.1.0/24', az: 'us-east-1a', public: 'true' } },
        { id: 'sg-web', type: 'aws_security_group', parent: 'vpc', props: { name: 'worker', ingressPort: '443' } },
        { id: 'worker', type: 'aws_instance', parent: 'subnet-pub', props: { name: 'worker', ami: 'ami-0abc123', size: 't3.small' } },
        s3('raw', 'pipeline-raw'),
        s3('processed', 'pipeline-processed'),
        { id: 'role', type: 'aws_iam_role', props: { name: 'pipeline-role' } },
      ],
      edges: [{ id: 'e-sg-worker', from: 'sg-web', to: 'worker', type: 'attached_to' }],
    }]),
  },
];

export const patternMeta = (): PatternMeta[] => PATTERNS.map(({ id, title, description }) => ({ id, title, description }));

/** Directly loadable templates (id + title + the blueprint), for the picker. */
export const templateList = (): Array<{ id: string; title: string; blueprint: Blueprint }> =>
  PATTERNS.map(({ id, title, blueprint }) => ({ id, title, blueprint }));
