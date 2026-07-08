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

const { deployBuildspec, deployTargets } = require('../cloud/deploy');

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

test('deployTargets derives ECR + ECS + container port from the blueprint', () => {
  const bp = {
    nodes: [
      { id: 'ecr', type: 'aws_ecr_repository', props: { name: 'shop' } },
      { id: 'app', type: 'aws_ecs_service', props: { name: 'web', cpu: '512', memory: '1024' } },
      { id: 'alb', type: 'aws_lb', props: { name: 'app-alb', targetPort: '8080' } },
    ],
    edges: [{ id: 'e', type: 'routes_to', from: 'alb', to: 'app' }],
  };
  const t = deployTargets(bp);
  assert.strictEqual(t.ecrRepo, 'shop');
  assert.strictEqual(t.ecsService, 'web');
  assert.strictEqual(t.ecsCluster, 'web-cluster');
  assert.strictEqual(t.containerName, 'web');
  assert.strictEqual(t.containerPort, 8080);
});

test('deployTargets returns null when not a container app', () => {
  assert.strictEqual(deployTargets({ nodes: [{ id: 'fn', type: 'aws_lambda_function', props: {} }], edges: [] }), null);
  assert.strictEqual(deployTargets({ nodes: [], edges: [] }), null);
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
