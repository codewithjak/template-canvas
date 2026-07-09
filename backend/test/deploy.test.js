'use strict';

/**
 * Tests for the container-deploy pure helpers (the buildspec and target
 * derivation). The live CodeBuild/ECR/ECS path is correct-by-construction and
 * verified separately against a real account.
 *
 * Run:  node --test test/
 */

const { test } = require('node:test');
const assert = require('node:assert');

const { deployBuildspec, lambdaBuildspec, staticBuildspec, deployKind, deployTargets, deploySessionPolicy } = require('../cloud/deploy');

test('deployBuildspec does build → push → register → update, in order', () => {
  const spec = deployBuildspec();
  const at = (s) => spec.indexOf(s);
  assert.ok(at('docker login') >= 0, 'logs in to ECR');
  assert.ok(at('docker build') >= 0, 'builds the image');
  assert.ok(at('docker push') >= 0, 'pushes the image');
  assert.ok(at('aws ecs register-task-definition') >= 0, 'registers a task def');
  assert.ok(at('aws ecs update-service') >= 0, 'rolls the service');
  // Ordering: login/build before push before register before update.
  assert.ok(at('docker build') < at('docker push'));
  assert.ok(at('docker push') < at('register-task-definition'));
  assert.ok(at('register-task-definition') < at('update-service'));
  // Uploads a result the backend reads (same convention as plan/apply/drift).
  assert.ok(at('$TF_RESULT_URL') >= 0);
});

test('deployKind classifies container / serverless / static / none', () => {
  assert.strictEqual(deployKind({ nodes: [{ type: 'aws_ecr_repository' }, { type: 'aws_ecs_service' }] }), 'container');
  assert.strictEqual(deployKind({ nodes: [{ type: 'aws_lambda_function' }] }), 'serverless');
  assert.strictEqual(deployKind({ nodes: [{ type: 'aws_cloudfront_distribution' }, { type: 'aws_s3_bucket' }] }), 'static');
  assert.strictEqual(deployKind({ nodes: [{ type: 'aws_vpc' }] }), null);
});

test('deployTargets: container derives ECR + ECS + port', () => {
  const t = deployTargets({
    nodes: [
      { id: 'ecr', type: 'aws_ecr_repository', props: { name: 'shop' } },
      { id: 'app', type: 'aws_ecs_service', props: { name: 'web', cpu: '512', memory: '1024' } },
      { id: 'alb', type: 'aws_lb', props: { name: 'app-alb', targetPort: '8080' } },
    ],
    edges: [{ id: 'e', type: 'routes_to', from: 'alb', to: 'app' }],
  });
  assert.strictEqual(t.kind, 'container');
  assert.strictEqual(t.ecrRepo, 'shop');
  assert.strictEqual(t.ecsCluster, 'web-cluster');
  assert.strictEqual(t.containerPort, 8080);
});

test('deployTargets: serverless → the Lambda function', () => {
  const t = deployTargets({ nodes: [{ id: 'fn', type: 'aws_lambda_function', props: { name: 'api' } }], edges: [] });
  assert.deepStrictEqual(t, { kind: 'serverless', lambdaFunction: 'api' });
});

test('deployTargets: static → the S3 bucket', () => {
  const t = deployTargets({
    nodes: [{ id: 'b', type: 'aws_s3_bucket', props: { name: 'site-assets' } }, { id: 'cdn', type: 'aws_cloudfront_distribution', props: {} }],
    edges: [],
  });
  assert.deepStrictEqual(t, { kind: 'static', bucket: 'site-assets' });
});

test('deployTargets returns null with no deployable workload', () => {
  assert.strictEqual(deployTargets({ nodes: [{ type: 'aws_vpc', props: {} }], edges: [] }), null);
  assert.strictEqual(deployTargets({ nodes: [], edges: [] }), null);
});

test('deploySessionPolicy scopes ECR push to the one repo and ECS update to the one service', () => {
  const targets = { kind: 'container', ecrRepo: 'shop', ecsService: 'web', ecsCluster: 'web-cluster' };
  const policy = JSON.parse(deploySessionPolicy(targets, '123456789012', 'us-east-1'));
  const byId = Object.fromEntries(policy.Statement.map((s) => [s.Sid, s]));

  // ECR push is pinned to the one repository ARN.
  assert.strictEqual(byId.EcrPush.Resource, 'arn:aws:ecr:us-east-1:123456789012:repository/shop');
  assert.ok(byId.EcrPush.Action.includes('ecr:PutImage'));
  // ECS update is pinned to the one service ARN.
  assert.strictEqual(byId.EcsUpdate.Resource, 'arn:aws:ecs:us-east-1:123456789012:service/web-cluster/web');
  assert.strictEqual(byId.EcsUpdate.Action, 'ecs:UpdateService');
  // PassRole is constrained to ECS tasks only.
  assert.strictEqual(byId.PassTaskRoles.Condition.StringEquals['iam:PassedToService'], 'ecs-tasks.amazonaws.com');
  // No wildcard "*" push/update resources leaked in.
  assert.ok(!policy.Statement.some((s) => s.Sid === 'EcrPush' && s.Resource === '*'));
});

test('lambdaBuildspec updates function code; staticBuildspec syncs + invalidates', () => {
  const l = lambdaBuildspec();
  assert.ok(l.includes('aws lambda update-function-code'));
  assert.ok(l.includes('$TF_RESULT_URL'));
  const s = staticBuildspec();
  assert.ok(s.includes('npm run build'));
  assert.ok(s.includes('aws s3 sync'));
  assert.ok(s.includes('create-invalidation'));
});

test('deployTargets defaults container port to 80 without an ALB edge', () => {
  const t = deployTargets({
    nodes: [
      { id: 'ecr', type: 'aws_ecr_repository', props: { name: 'app' } },
      { id: 'app', type: 'aws_ecs_service', props: { name: 'app' } },
    ],
    edges: [],
  });
  assert.strictEqual(t.containerPort, 80);
});
