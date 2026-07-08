'use strict';

/**
 * backend/cloud/deploy.js
 *
 * Container workload deploy in the in-account runner (CLOUD_LOCAL_AGENT_ARCHITECTURE.md
 * Phase 2, Path 2 "cloud runner" — the default). The CLI stages the app source to
 * the customer's own bucket (a presigned upload; no credential held), then this
 * builds the image, pushes it to the deployment's ECR repo, and updates the ECS
 * service — all in the customer's account via CodeBuild, gated by the user's
 * explicit deploy. Mirrors apply.js / destroy.js.
 *
 * PREREQUISITES for the live path (correct-by-construction; verify live):
 *  - a Docker-capable CodeBuild project (privileged mode + an image with docker +
 *    aws cli). The terraform RunnerProject (hashicorp/terraform image) cannot build
 *    images, so a separate `deployProject` is needed.
 *  - the RunnerRole must allow ecr:* on the repo, ecs:RegisterTaskDefinition /
 *    UpdateService, and iam:PassRole on the task execution role.
 *  - the ECS service needs a task execution role (EXEC_ROLE_ARN) and terraform
 *    should `ignore_changes = [task_definition]` so deploys don't fight state.
 */

const { assumeConnectRole } = require('./sts');
const { presignUrl } = require('../storage/s3SigV4');
const { codebuild, httpsRequest } = require('./runner');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const credFields = (c) => ({ accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey, sessionToken: c.sessionToken });

/** The build/push/deploy buildspec. Env-driven, so it's a pure, testable string. */
function deployBuildspec() {
  return [
    'version: 0.2',
    'phases:',
    '  pre_build:',
    '    commands:',
    '      - ACCOUNT=$(aws sts get-caller-identity --query Account --output text)',
    '      - REGISTRY=$ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com',
    '      - aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $REGISTRY',
    '      - curl -sS "$SOURCE_URL" -o src.tar.gz && mkdir -p src && tar xzf src.tar.gz -C src',
    '  build:',
    '    commands:',
    '      - docker build -t $REGISTRY/$ECR_REPO:$IMAGE_TAG src',
    '      - docker push $REGISTRY/$ECR_REPO:$IMAGE_TAG',
    '  post_build:',
    '    commands:',
    '      - IMAGE=$REGISTRY/$ECR_REPO:$IMAGE_TAG',
    '      - CONTAINERS="[{\\"name\\":\\"$CONTAINER_NAME\\",\\"image\\":\\"$IMAGE\\",\\"essential\\":true,\\"portMappings\\":[{\\"containerPort\\":$CONTAINER_PORT}]}]"',
    '      - TASKDEF=$(aws ecs register-task-definition --family $ECS_SERVICE --requires-compatibilities FARGATE --network-mode awsvpc --cpu $ECS_CPU --memory $ECS_MEMORY --execution-role-arn $EXEC_ROLE_ARN --container-definitions "$CONTAINERS" --query taskDefinition.taskDefinitionArn --output text)',
    '      - aws ecs update-service --cluster $ECS_CLUSTER --service $ECS_SERVICE --task-definition $TASKDEF --force-new-deployment',
    '      - printf \'{"image":"%s"}\' "$IMAGE" > result.out',
    '      - curl -sS -X PUT --upload-file result.out "$TF_RESULT_URL"',
  ].join('\n');
}

/**
 * The ECR + ECS deploy targets in a blueprint (pure). Returns null when the
 * blueprint isn't a container app (no ECR + ECS), so the route can 400 cleanly.
 */
function deployTargets(blueprint) {
  const nodes = (blueprint && blueprint.nodes) || [];
  const edges = (blueprint && blueprint.edges) || [];
  const ecr = nodes.find((n) => n.type === 'aws_ecr_repository');
  const ecs = nodes.find((n) => n.type === 'aws_ecs_service');
  if (!ecr || !ecs) return null;
  const albEdge = edges.find((e) => e.type === 'routes_to' && e.to === ecs.id);
  const alb = albEdge ? nodes.find((n) => n.id === albEdge.from) : null;
  const svc = String(ecs.props.name || 'app');
  return {
    ecrRepo: String(ecr.props.name || 'app'),
    ecsService: svc,
    ecsCluster: `${svc}-cluster`,
    containerName: svc,
    containerPort: Number(alb && alb.props.targetPort) || 80,
    cpu: String(ecs.props.cpu || '512'),
    memory: String(ecs.props.memory || '1024'),
  };
}

/** Presign a one-shot PUT URL the CLI uploads the source tarball to (no creds held). */
async function presignSourceUpload({ connection, bucket }) {
  const region = connection.region;
  const { credentials } = await assumeConnectRole({ roleArn: connection.role_arn, externalId: connection.external_id, region });
  const key = `source/${connection.id}-${Date.now()}.tar.gz`;
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const common = { host, region, service: 's3', key, ...credFields(credentials), expiresIn: 3600 };
  return {
    key,
    putUrl: presignUrl({ method: 'PUT', ...common }),
    getUrl: presignUrl({ method: 'GET', ...common }),
  };
}

/** Build → push → update ECS, in the customer's account. @returns {{ image }} */
async function runDeploy({ connection, deployProject, stateBucket, sourceUrl, targets, imageTag, execRoleArn }) {
  const region = connection.region;
  const { credentials } = await assumeConnectRole({ roleArn: connection.role_arn, externalId: connection.external_id, region });
  const key = `deploy/${connection.id}-${Date.now()}.out`;
  const host = `${stateBucket}.s3.${region}.amazonaws.com`;
  const putUrl = presignUrl({ method: 'PUT', host, region, service: 's3', key, ...credFields(credentials), expiresIn: 3600 });
  const getUrl = presignUrl({ method: 'GET', host, region, service: 's3', key, ...credFields(credentials), expiresIn: 3600 });

  const environmentVariablesOverride = [
    { name: 'SOURCE_URL', value: sourceUrl, type: 'PLAINTEXT' },
    { name: 'ECR_REPO', value: targets.ecrRepo, type: 'PLAINTEXT' },
    { name: 'IMAGE_TAG', value: imageTag || 'latest', type: 'PLAINTEXT' },
    { name: 'ECS_CLUSTER', value: targets.ecsCluster, type: 'PLAINTEXT' },
    { name: 'ECS_SERVICE', value: targets.ecsService, type: 'PLAINTEXT' },
    { name: 'CONTAINER_NAME', value: targets.containerName, type: 'PLAINTEXT' },
    { name: 'CONTAINER_PORT', value: String(targets.containerPort), type: 'PLAINTEXT' },
    { name: 'ECS_CPU', value: targets.cpu, type: 'PLAINTEXT' },
    { name: 'ECS_MEMORY', value: targets.memory, type: 'PLAINTEXT' },
    { name: 'EXEC_ROLE_ARN', value: execRoleArn || '', type: 'PLAINTEXT' },
    { name: 'TF_RESULT_URL', value: putUrl, type: 'PLAINTEXT' },
  ];

  const started = await codebuild('StartBuild', {
    projectName: deployProject, buildspecOverride: deployBuildspec(), environmentVariablesOverride,
  }, credentials, region);
  const buildId = started.build && started.build.id;
  if (!buildId) throw new Error('CodeBuild did not return a build id.');

  for (let i = 0; i < 120; i += 1) {
    await sleep(5000);
    const got = await codebuild('BatchGetBuilds', { ids: [buildId] }, credentials, region);
    const b = (got.builds && got.builds[0]) || {};
    if (b.buildStatus && b.buildStatus !== 'IN_PROGRESS') break;
  }
  const res = await httpsRequest('GET', getUrl, {}, null);
  if (res.status !== 200) throw new Error('Deploy result not available (build may have failed).');
  let out = {};
  try { out = JSON.parse(res.body); } catch { /* build may have produced no result */ }
  return { buildId, image: out.image };
}

module.exports = { deployBuildspec, deployTargets, presignSourceUpload, runDeploy };
