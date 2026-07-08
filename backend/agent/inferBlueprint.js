'use strict';

/**
 * backend/agent/inferBlueprint.js
 *
 * App understanding → a lint-clean cloud Blueprint (CLOUD_LOCAL_AGENT_ARCHITECTURE.md,
 * Phase 1). Deterministic recipes (not the LLM) so the first cut is reliable and
 * reviewable; an LLM refinement layer comes later. It picks a topology from the
 * profile, then attaches the data/messaging services the app needs. Every recipe
 * is built to pass the cloud linter (the canvas will still show it for review).
 */

const HANDLER = `exports.handler = async (event) => {
  const method = event.requestContext && event.requestContext.http && event.requestContext.http.method;
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ok: true, method: method || "GET", path: event.rawPath || "/" }),
  };
};`;

const slug = (s) => String(s || 'app').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'app';

/** Shared 3-tier network: one public + two private subnets (2 AZs) + web/db SGs. */
function network(nodes) {
  nodes.push(
    { id: 'vpc', type: 'aws_vpc', props: { name: 'main', cidr: '10.0.0.0/16', nat: 'false' } },
    { id: 'subnet-pub', type: 'aws_subnet', parent: 'vpc', props: { cidr: '10.0.1.0/24', az: 'us-east-1a', public: 'true' } },
    { id: 'subnet-a', type: 'aws_subnet', parent: 'vpc', props: { cidr: '10.0.2.0/24', az: 'us-east-1a', public: 'false' } },
    { id: 'subnet-b', type: 'aws_subnet', parent: 'vpc', props: { cidr: '10.0.3.0/24', az: 'us-east-1b', public: 'false' } },
    { id: 'sg-web', type: 'aws_security_group', parent: 'vpc', props: { name: 'web', ingressPort: '443' } },
    { id: 'sg-db', type: 'aws_security_group', parent: 'vpc', props: { name: 'db', ingressPort: '5432' } },
  );
}

/** Container web tier: ALB → Fargate (+ ECR) (+ private RDS). */
function buildContainerWeb(nodes, edges, { engine, wantsDb }) {
  network(nodes);
  nodes.push(
    { id: 'alb', type: 'aws_lb', parent: 'vpc', props: { name: 'app-alb', scheme: 'internet-facing', targetPort: '80' } },
    { id: 'app', type: 'aws_ecs_service', parent: 'subnet-pub', props: { name: 'app', desiredCount: '2', cpu: '512', memory: '1024' } },
    { id: 'ecr', type: 'aws_ecr_repository', props: { name: 'app', mutability: 'MUTABLE', scanOnPush: 'true' } },
  );
  edges.push(
    { id: 'e-web-alb', from: 'sg-web', to: 'alb', type: 'attached_to' },
    { id: 'e-web-app', from: 'sg-web', to: 'app', type: 'attached_to' },
    { id: 'e-alb-app', from: 'alb', to: 'app', type: 'routes_to' },
    { id: 'e-app-ecr', from: 'app', to: 'ecr', type: 'uses_image' },
  );
  if (wantsDb) {
    nodes.push({ id: 'db', type: 'aws_db_instance', parent: 'subnet-a', props: { engine, size: 'db.t3.micro', publicAccess: 'false' } });
    edges.push(
      { id: 'e-db-rds', from: 'sg-db', to: 'db', type: 'attached_to' },
      { id: 'e-app-db', from: 'app', to: 'db', type: 'connects_to' },
    );
  }
}

/** Serverless API: API Gateway → Lambda (role) (+ DynamoDB). */
function buildServerless(nodes, edges, wantsDynamo) {
  nodes.push(
    { id: 'api', type: 'aws_apigatewayv2_api', props: { name: 'http-api' } },
    { id: 'fn-role', type: 'aws_iam_role', props: { name: 'api-role', managedPolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole' } },
    { id: 'fn', type: 'aws_lambda_function', props: { name: 'api', runtime: 'nodejs20.x', handler: 'index.handler', memory: '128', timeout: '3', method: 'ANY', path: '/{proxy+}', code: HANDLER } },
  );
  edges.push(
    { id: 'e-fn-role', from: 'fn', to: 'fn-role', type: 'uses_role' },
    { id: 'e-api-fn', from: 'api', to: 'fn', type: 'route' },
  );
  if (wantsDynamo) nodes.push({ id: 'table', type: 'aws_dynamodb_table', props: { name: 'items', hashKey: 'id', billingMode: 'PAY_PER_REQUEST' } });
}

/** Static site: S3 + CloudFront. */
function buildStatic(nodes, edges) {
  nodes.push(
    { id: 'site', type: 'aws_s3_bucket', props: { name: 'site-assets', acl: 'private' } },
    { id: 'cdn', type: 'aws_cloudfront_distribution', props: { comment: 'site cdn' } },
  );
  edges.push({ id: 'e-cdn-site', from: 'cdn', to: 'site', type: 'origin' });
}

function inferBlueprint(app) {
  const nodes = [];
  const edges = [];
  const services = app.services || [];
  const wantsDb = services.includes('postgres') || services.includes('mysql');
  const engine = services.includes('mysql') ? 'mysql' : 'postgres';
  const wantsDynamo = services.includes('dynamodb');
  const wantsS3 = services.includes('s3');
  const wantsSqs = services.includes('sqs');
  const wantsSns = services.includes('sns');

  const isServerFramework = ['express', 'next', 'django', 'flask', 'rails'].includes(app.framework);
  const container = Boolean(app.containerized) || isServerFramework || wantsDb;
  const staticSite = app.isStatic && !container;

  if (staticSite) {
    buildStatic(nodes, edges);
  } else if (container) {
    buildContainerWeb(nodes, edges, { engine, wantsDb });
  } else {
    buildServerless(nodes, edges, wantsDynamo);
  }

  // Attach data/messaging services the topology didn't already include.
  if (wantsDynamo && !nodes.some((n) => n.type === 'aws_dynamodb_table')) {
    nodes.push({ id: 'table', type: 'aws_dynamodb_table', props: { name: 'items', hashKey: 'id', billingMode: 'PAY_PER_REQUEST' } });
  }
  if (wantsS3 && !nodes.some((n) => n.type === 'aws_s3_bucket')) {
    nodes.push({ id: 'bucket', type: 'aws_s3_bucket', props: { name: `${slug(app.name)}-assets`, acl: 'private' } });
  }
  if (wantsSqs) nodes.push({ id: 'queue', type: 'aws_sqs_queue', props: { name: 'work', fifo: 'false', visibilityTimeout: '30' } });
  if (wantsSns) {
    nodes.push({ id: 'topic', type: 'aws_sns_topic', props: { name: 'events' } });
    if (wantsSqs) edges.push({ id: 'e-topic-queue', from: 'topic', to: 'queue', type: 'publishes_to' });
  }

  return { nodes, edges, meta: { pack: 'cloud', name: app.name || 'app', provider: 'aws', region: 'us-east-1' } };
}

module.exports = { inferBlueprint };
