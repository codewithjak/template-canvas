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
 *
 * The ECS task execution role and `ignore_changes = [task_definition]` are now
 * emitted by the compiler (emitEcs), so the deploy just copies the existing task
 * definition and swaps the image — no execution-role ARN needs to be passed in.
 */

const { assumeConnectRole } = require('./sts');
const { presignUrl } = require('../storage/s3SigV4');
const { codebuild, httpsRequest } = require('./runner');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const credFields = (c) => ({ accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey, sessionToken: c.sessionToken });

/** The build/push/deploy buildspec. Env-driven, so it's a pure, testable string. */
function deployBuildspec() {
  // Rolls a new image by copying the deployment's EXISTING task definition (which
  // already carries the compiler-synthesized execution role + container config)
  // and swapping only the image — so no execution-role ARN needs to be passed in.
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
    '      - CUR=$(aws ecs describe-task-definition --task-definition $ECS_SERVICE --query taskDefinition)',
    "      - NEW=$(echo \"$CUR\" | jq --arg IMG \"$IMAGE\" '.containerDefinitions[0].image=$IMG | {family,networkMode,requiresCompatibilities,cpu,memory,executionRoleArn,containerDefinitions}')",
    '      - TASKDEF=$(aws ecs register-task-definition --cli-input-json "$NEW" --query taskDefinition.taskDefinitionArn --output text)',
    '      - aws ecs update-service --cluster $ECS_CLUSTER --service $ECS_SERVICE --task-definition $TASKDEF --force-new-deployment',
    '      - printf \'{"image":"%s"}\' "$IMAGE" > result.out',
    '      - curl -sS -X PUT --upload-file result.out "$TF_RESULT_URL"',
  ].join('\n');
}

/** Serverless: package the function source and update the Lambda code in place. */
function lambdaBuildspec() {
  return [
    'version: 0.2',
    'phases:',
    '  build:',
    '    commands:',
    '      - curl -sS "$SOURCE_URL" -o src.tar.gz && mkdir -p src && tar xzf src.tar.gz -C src',
    '      - cd src && (test -f package.json && npm ci --omit=dev || true)',
    '      - zip -qr ../fn.zip . && cd ..',
    '      - aws lambda update-function-code --function-name $LAMBDA_FN --zip-file fileb://fn.zip --publish',
    '      - printf \'{"function":"%s"}\' "$LAMBDA_FN" > result.out',
    '      - curl -sS -X PUT --upload-file result.out "$TF_RESULT_URL"',
  ].join('\n');
}

/** Static: build the frontend, sync the output to S3, and invalidate CloudFront. */
function staticBuildspec() {
  return [
    'version: 0.2',
    'phases:',
    '  build:',
    '    commands:',
    '      - curl -sS "$SOURCE_URL" -o src.tar.gz && mkdir -p src && tar xzf src.tar.gz -C src',
    '      - cd src && (test -f package.json && npm ci && npm run build || true)',
    '      - OUT=$(ls -d dist build out public 2>/dev/null | head -1); OUT=${OUT:-.}',
    '      - aws s3 sync "$OUT" "s3://$BUCKET" --delete',
    '      - cd ..',
    "      - DIST=$(aws cloudfront list-distributions --query \"DistributionList.Items[?contains(to_string(Origins), '$BUCKET')].Id | [0]\" --output text)",
    '      - test "$DIST" != "None" -a -n "$DIST" && aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/*" || true',
    '      - printf \'{"bucket":"%s"}\' "$BUCKET" > result.out',
    '      - curl -sS -X PUT --upload-file result.out "$TF_RESULT_URL"',
  ].join('\n');
}

/** The buildspec + env for a deploy target's kind. */
function specAndEnv(targets, sourceUrl, resultUrl, imageTag) {
  const base = [
    { name: 'SOURCE_URL', value: sourceUrl, type: 'PLAINTEXT' },
    { name: 'TF_RESULT_URL', value: resultUrl, type: 'PLAINTEXT' },
  ];
  if (targets.kind === 'serverless') {
    return { spec: lambdaBuildspec(), env: [...base, { name: 'LAMBDA_FN', value: targets.lambdaFunction, type: 'PLAINTEXT' }] };
  }
  if (targets.kind === 'static') {
    return { spec: staticBuildspec(), env: [...base, { name: 'BUCKET', value: targets.bucket, type: 'PLAINTEXT' }] };
  }
  return {
    spec: deployBuildspec(),
    env: [...base,
      { name: 'ECR_REPO', value: targets.ecrRepo, type: 'PLAINTEXT' },
      { name: 'IMAGE_TAG', value: imageTag || 'latest', type: 'PLAINTEXT' },
      { name: 'ECS_CLUSTER', value: targets.ecsCluster, type: 'PLAINTEXT' },
      { name: 'ECS_SERVICE', value: targets.ecsService, type: 'PLAINTEXT' },
    ],
  };
}

/**
 * The workload kind a blueprint deploys (pure): a container (ECR + ECS), a
 * serverless function (Lambda), or a static site (S3 + CloudFront). null = nothing
 * deployable. Container wins over serverless wins over static for a mixed app; a
 * full-stack app (Lambda + static) deploys its function here and its site separately.
 */
function deployKind(blueprint) {
  const types = new Set(((blueprint && blueprint.nodes) || []).map((n) => n.type));
  if (types.has('aws_ecr_repository') && types.has('aws_ecs_service')) return 'container';
  if (types.has('aws_lambda_function')) return 'serverless';
  if (types.has('aws_cloudfront_distribution') && types.has('aws_s3_bucket')) return 'static';
  return null;
}

/** Kind-specific deploy coordinates (pure). null when there's nothing to deploy. */
function deployTargets(blueprint) {
  const kind = deployKind(blueprint);
  if (!kind) return null;
  const nodes = (blueprint && blueprint.nodes) || [];
  const edges = (blueprint && blueprint.edges) || [];

  if (kind === 'container') {
    const ecr = nodes.find((n) => n.type === 'aws_ecr_repository');
    const ecs = nodes.find((n) => n.type === 'aws_ecs_service');
    const albEdge = edges.find((e) => e.type === 'routes_to' && e.to === ecs.id);
    const alb = albEdge ? nodes.find((n) => n.id === albEdge.from) : null;
    const svc = String(ecs.props.name || 'app');
    return {
      kind, ecrRepo: String(ecr.props.name || 'app'), ecsService: svc, ecsCluster: `${svc}-cluster`,
      containerName: svc, containerPort: Number(alb && alb.props.targetPort) || 80,
      cpu: String(ecs.props.cpu || '512'), memory: String(ecs.props.memory || '1024'),
    };
  }
  if (kind === 'serverless') {
    const fn = nodes.find((n) => n.type === 'aws_lambda_function');
    return { kind, lambdaFunction: String(fn.props.name || 'fn') };
  }
  const bucket = nodes.find((n) => n.type === 'aws_s3_bucket');
  return { kind, bucket: String(bucket.props.name || 'site') };
}

/**
 * Least-privilege session policy for a CLI "deploy from here" (Path 1). Narrows
 * the assumed credentials to exactly: ECR auth + push to the ONE repo, and ECS
 * register-task-def + update the ONE service (+ the passrole/describe those need).
 * The role's own permissions remain the ceiling; this is the floor.
 */
function deploySessionPolicy(targets, accountId, region) {
  const repoArn = `arn:aws:ecr:${region}:${accountId}:repository/${targets.ecrRepo}`;
  const svcArn = `arn:aws:ecs:${region}:${accountId}:service/${targets.ecsCluster}/${targets.ecsService}`;
  const taskDefArn = `arn:aws:ecs:${region}:${accountId}:task-definition/${targets.ecsService}:*`;
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      { Sid: 'EcrAuth', Effect: 'Allow', Action: 'ecr:GetAuthorizationToken', Resource: '*' },
      {
        Sid: 'EcrPush',
        Effect: 'Allow',
        Action: [
          'ecr:BatchCheckLayerAvailability', 'ecr:InitiateLayerUpload', 'ecr:UploadLayerPart',
          'ecr:CompleteLayerUpload', 'ecr:PutImage', 'ecr:BatchGetImage', 'ecr:GetDownloadUrlForLayer',
        ],
        Resource: repoArn,
      },
      { Sid: 'EcsRegister', Effect: 'Allow', Action: 'ecs:RegisterTaskDefinition', Resource: '*' },
      { Sid: 'EcsDescribe', Effect: 'Allow', Action: ['ecs:DescribeTaskDefinition', 'ecs:DescribeServices'], Resource: '*' },
      { Sid: 'EcsUpdate', Effect: 'Allow', Action: 'ecs:UpdateService', Resource: svcArn },
      {
        Sid: 'PassTaskRoles',
        Effect: 'Allow',
        Action: 'iam:PassRole',
        Resource: `arn:aws:iam::${accountId}:role/*`,
        Condition: { StringEquals: { 'iam:PassedToService': 'ecs-tasks.amazonaws.com' } },
      },
      { Sid: 'TaskDefScope', Effect: 'Allow', Action: 'ecs:DeregisterTaskDefinition', Resource: taskDefArn },
    ],
  });
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

/**
 * Deploy the staged source in the customer's account: container image roll,
 * Lambda code update, or static sync + invalidation depending on the target kind.
 * @returns {{ buildId, result }} the parsed result the buildspec uploaded.
 */
async function runDeploy({ connection, deployProject, stateBucket, sourceUrl, targets, imageTag }) {
  const region = connection.region;
  const { credentials } = await assumeConnectRole({ roleArn: connection.role_arn, externalId: connection.external_id, region });
  const key = `deploy/${connection.id}-${Date.now()}.out`;
  const host = `${stateBucket}.s3.${region}.amazonaws.com`;
  const putUrl = presignUrl({ method: 'PUT', host, region, service: 's3', key, ...credFields(credentials), expiresIn: 3600 });
  const getUrl = presignUrl({ method: 'GET', host, region, service: 's3', key, ...credFields(credentials), expiresIn: 3600 });

  const { spec, env } = specAndEnv(targets, sourceUrl, putUrl, imageTag);

  const started = await codebuild('StartBuild', {
    projectName: deployProject, buildspecOverride: spec, environmentVariablesOverride: env,
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
  let result = {};
  try { result = JSON.parse(res.body); } catch { /* build may have produced no result */ }
  return { buildId, result };
}

module.exports = {
  deployKind, deployBuildspec, lambdaBuildspec, staticBuildspec, deployTargets,
  deploySessionPolicy, presignSourceUpload, runDeploy,
};
