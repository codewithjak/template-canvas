/**
 * compile.ts — cloud pack compiler (graph → Terraform). Platform P3.
 *
 * A pure, deterministic function: the same Blueprint always yields the exact
 * same HCL (snapshot-testable). Built as a registry of small per-node emitters
 * — the same shape as backend/renderer/elementDrawers.js.
 *
 * The three structural facts become Terraform:
 *   parent (containment)     → a parent-id reference   (subnet_id = aws_subnet.x.id)
 *   edge "attached_to"       → a reference on the target (vpc_security_group_ids)
 *   edge "connects_to"       → a generated rule         (aws_security_group_rule)
 *
 * It also SYNTHESIZES resources the user never drew (aws_db_subnet_group for RDS)
 * — one node can emit multiple resources.
 *
 * See VISUAL_CLOUD_BUILDER_ARCHITECTURE.md §5.
 */

import type { Blueprint, GraphNode } from '../../../types/blueprint';
import { vpcIdOf } from './queries';

interface Ctx {
  bp: Blueprint;
  byId: Map<string, GraphNode>;
}

// ── HCL helpers ───────────────────────────────────────────────────────────────
const tname = (id: string) => id.replace(/[^a-zA-Z0-9_]/g, '_');
const q = (v: unknown) => JSON.stringify(String(v ?? ''));
const tag = (name: unknown) => `{ Name = ${q(name)} }`;

function resource(type: string, name: string, lines: string[]): string {
  return `resource "${type}" "${name}" {\n` + lines.map((l) => '  ' + l).join('\n') + '\n}';
}

const ingressBlock = (port: number) =>
  `ingress {\n    from_port   = ${port}\n    to_port     = ${port}\n    protocol    = "tcp"\n    cidr_blocks = ["0.0.0.0/0"]\n  }`;

const egressAll =
  'egress {\n    from_port   = 0\n    to_port     = 0\n    protocol    = "-1"\n    cidr_blocks = ["0.0.0.0/0"]\n  }';

// ── Relationship resolution ─────────────────────────────────────────────────
/** A `type.tname.id` reference for a node id, or undefined if it's missing. */
function refId(ctx: Ctx, id?: string): string | undefined {
  if (!id) return undefined;
  const n = ctx.byId.get(id);
  return n ? `${n.type}.${tname(id)}.id` : undefined;
}

/** Security-group id refs attached_to a node (incoming "attached_to" edges). */
function sgIdsAttachedTo(ctx: Ctx, nodeId: string): string[] {
  return ctx.bp.edges
    .filter((e) => e.type === 'attached_to' && e.to === nodeId)
    .map((e) => ctx.byId.get(e.from))
    .filter((n): n is GraphNode => !!n && n.type === 'aws_security_group')
    .map((n) => `aws_security_group.${tname(n.id)}.id`);
}

/** Subnet id refs that belong to a VPC (direct children). */
function subnetIdsInVpc(ctx: Ctx, vpcId: string): string[] {
  return ctx.bp.nodes
    .filter((n) => n.type === 'aws_subnet' && n.parent === vpcId)
    .map((n) => `aws_subnet.${tname(n.id)}.id`);
}

/** Subnet id refs in a VPC filtered by public/private (for ALB placement). */
function subnetIdsByAccess(ctx: Ctx, vpcId: string, wantPublic: boolean): string[] {
  return ctx.bp.nodes
    .filter((n) => n.type === 'aws_subnet' && n.parent === vpcId && (n.props.public === 'true') === wantPublic)
    .map((n) => `aws_subnet.${tname(n.id)}.id`);
}

const dbPort = (engine: unknown) => (engine === 'mysql' || engine === 'mariadb' ? 3306 : 5432);

// ── Per-node emitters (one per type) ─────────────────────────────────────────
function emitVpc(n: GraphNode): string {
  return resource('aws_vpc', tname(n.id), [
    `cidr_block = ${q(n.props.cidr)}`,
    `tags       = ${tag(n.props.name ?? n.type)}`,
  ]);
}

function emitSubnet(n: GraphNode, ctx: Ctx): string {
  const p = n.props;
  const vpc = refId(ctx, n.parent);
  return resource('aws_subnet', tname(n.id), [
    ...(vpc ? [`vpc_id                  = ${vpc}`] : []),
    `cidr_block              = ${q(p.cidr)}`,
    `availability_zone       = ${q(p.az)}`,
    `map_public_ip_on_launch = ${p.public === 'true'}`,
    `tags                    = ${tag(n.id)}`,
  ]);
}

function emitSecurityGroup(n: GraphNode, ctx: Ctx): string {
  const p = n.props;
  const vpc = refId(ctx, vpcIdOf(ctx.byId, n));
  return resource('aws_security_group', tname(n.id), [
    `name = ${q(p.name)}`,
    ...(vpc ? [`vpc_id = ${vpc}`] : []),
    ingressBlock(Number(p.ingressPort) || 443),
    egressAll,
  ]);
}

/** The role an instance/service uses (outgoing "uses_role" edge), or undefined. */
function roleUsedBy(ctx: Ctx, nodeId: string): GraphNode | undefined {
  const e = ctx.bp.edges.find((edge) => edge.type === 'uses_role' && edge.from === nodeId);
  return e ? ctx.byId.get(e.to) : undefined;
}

function emitInstance(n: GraphNode, ctx: Ctx): string {
  const p = n.props;
  const subnet = refId(ctx, n.parent);
  const sgs = sgIdsAttachedTo(ctx, n.id);
  const role = roleUsedBy(ctx, n.id);
  return resource('aws_instance', tname(n.id), [
    `ami                    = ${q(p.ami)}`,
    `instance_type          = ${q(p.size)}`,
    ...(subnet ? [`subnet_id              = ${subnet}`] : []),
    ...(sgs.length ? [`vpc_security_group_ids = [${sgs.join(', ')}]`] : []),
    // Instance profile is synthesized in emitIamRole (below).
    ...(role ? [`iam_instance_profile   = aws_iam_instance_profile.${tname(role.id)}_profile.name`] : []),
    `tags                   = ${tag(p.name ?? n.id)}`,
  ]);
}

function emitDb(n: GraphNode, ctx: Ctx): string {
  const p = n.props;
  const tn = tname(n.id);
  const vpcId = vpcIdOf(ctx.byId, n);
  const subnetIds = vpcId ? subnetIdsInVpc(ctx, vpcId) : [];
  const sgs = sgIdsAttachedTo(ctx, n.id);
  const blocks: string[] = [];

  // SYNTHESIZED — the user didn't draw this; RDS requires it.
  if (subnetIds.length) {
    blocks.push(resource('aws_db_subnet_group', tn, [
      `name       = ${q(tn + '-subnets')}`,
      `subnet_ids = [${subnetIds.join(', ')}]`,
    ]));
  }
  blocks.push(resource('aws_db_instance', tn, [
    `engine                 = ${q(p.engine)}`,
    `instance_class         = ${q(p.size)}`,
    'allocated_storage      = 20',
    ...(subnetIds.length ? [`db_subnet_group_name   = aws_db_subnet_group.${tn}.name`] : []),
    ...(sgs.length ? [`vpc_security_group_ids = [${sgs.join(', ')}]`] : []),
    `publicly_accessible    = ${p.publicAccess === 'true'}`,
    'username               = "dbadmin"',
    'password               = var.db_password',
    'skip_final_snapshot    = true',
    `tags                   = ${tag(n.id)}`,
  ]));
  return blocks.join('\n\n');
}

function emitS3(n: GraphNode): string {
  return resource('aws_s3_bucket', tname(n.id), [
    `bucket = ${q(n.props.name)}`,
    `tags   = ${tag(n.props.name ?? n.id)}`,
  ]);
}

/** Which AWS service principal a consumer of a role trusts. */
const ROLE_PRINCIPAL: Record<string, string> = {
  aws_instance: 'ec2.amazonaws.com',
  aws_lambda_function: 'lambda.amazonaws.com',
  aws_ecs_service: 'ecs-tasks.amazonaws.com',
};

function emitIamRole(n: GraphNode, ctx: Ctx): string {
  const tn = tname(n.id);
  // Who uses this role (incoming uses_role edges) decides its trust policy: a
  // Lambda's role must trust lambda.amazonaws.com, an EC2's ec2.amazonaws.com.
  const consumers = ctx.bp.edges
    .filter((e) => e.type === 'uses_role' && e.to === n.id)
    .map((e) => ctx.byId.get(e.from))
    .filter((c): c is GraphNode => !!c);
  const services = [...new Set(consumers.map((c) => ROLE_PRINCIPAL[c.type]).filter(Boolean))];
  if (!services.length) services.push('ec2.amazonaws.com'); // sensible default
  const principal = services.length === 1
    ? `Service = ${q(services[0])}`
    : `Service = [${services.map(q).join(', ')}]`;
  const policy =
    'assume_role_policy = jsonencode({\n'
    + '    Version = "2012-10-17"\n'
    + '    Statement = [{\n'
    + '      Action    = "sts:AssumeRole"\n'
    + '      Effect    = "Allow"\n'
    + `      Principal = { ${principal} }\n`
    + '    }]\n'
    + '  })';
  const blocks = [resource('aws_iam_role', tn, [`name = ${q(n.props.name)}`, policy])];

  // Attach a managed policy so the role actually grants something.
  if (n.props.managedPolicyArn) {
    blocks.push(resource('aws_iam_role_policy_attachment', `${tn}_attach`, [
      `role       = aws_iam_role.${tn}.name`,
      `policy_arn = ${q(n.props.managedPolicyArn)}`,
    ]));
  }
  // Only an EC2 instance needs an instance profile to assume a role (Lambda/ECS
  // reference the role ARN directly).
  if (consumers.some((c) => c.type === 'aws_instance')) {
    blocks.push(resource('aws_iam_instance_profile', `${tn}_profile`, [
      `name = ${q(tn + '-profile')}`,
      `role = aws_iam_role.${tn}.name`,
    ]));
  }
  return blocks.join('\n\n');
}

function emitLb(n: GraphNode, ctx: Ctx): string {
  const p = n.props;
  const internal = p.scheme === 'internal';
  const vpcId = vpcIdOf(ctx.byId, n);
  // Internet-facing ALBs must sit in PUBLIC subnets (a private one has no IGW
  // route and the apply fails); internal ALBs sit in private subnets.
  const subnetIds = vpcId ? subnetIdsByAccess(ctx, vpcId, !internal) : [];
  // Its own synthesized SG (emitLbCompletion) plus any the user attached.
  const sgs = [...(vpcId ? [`aws_security_group.${tname(n.id)}_sg.id`] : []), ...sgIdsAttachedTo(ctx, n.id)];
  return resource('aws_lb', tname(n.id), [
    `name               = ${q(p.name)}`,
    `internal           = ${internal}`,
    'load_balancer_type = "application"',
    ...(sgs.length ? [`security_groups    = [${sgs.join(', ')}]`] : []),
    subnetIds.length
      ? `subnets            = [${subnetIds.join(', ')}]`
      : `# subnets: add ≥2 ${internal ? 'private' : 'public'} subnets to the VPC (an ALB needs 2 AZs)`,
  ]);
}

function emitCloudFront(n: GraphNode, ctx: Ctx): string {
  const tn = tname(n.id);
  const originEdge = ctx.bp.edges.find((e) => e.type === 'origin' && e.from === n.id);
  const target = originEdge ? ctx.byId.get(originEdge.to) : undefined;
  const isS3 = target?.type === 'aws_s3_bucket';
  const originId = target ? tname(target.id) : 'origin';
  const domain = !target
    ? '"example.com"'
    : isS3
      ? `aws_s3_bucket.${tname(target.id)}.bucket_regional_domain_name`
      : `aws_lb.${tname(target.id)}.dns_name`;

  // Each origin TYPE needs different plumbing to be valid + actually serve:
  //  • S3 (private bucket) → an origin access control + a bucket policy, else 403.
  //  • custom (ALB) → a custom_origin_config, else terraform validate fails.
  const originExtra: string[] = [];
  const extra: string[] = [];
  if (isS3 && target) {
    const bn = tname(target.id);
    extra.push(resource('aws_cloudfront_origin_access_control', `${tn}_oac`, [
      `name                              = ${q(tn + '-oac')}`,
      'origin_access_control_origin_type = "s3"',
      'signing_behavior                  = "always"',
      'signing_protocol                  = "sigv4"',
    ]));
    originExtra.push(`    origin_access_control_id = aws_cloudfront_origin_access_control.${tn}_oac.id`);
    extra.push(resource('aws_s3_bucket_policy', `${bn}_cf`, [
      `bucket = aws_s3_bucket.${bn}.id`,
      'policy = jsonencode({\n'
      + '    Version = "2012-10-17"\n'
      + '    Statement = [{\n'
      + '      Effect    = "Allow"\n'
      + '      Principal = { Service = "cloudfront.amazonaws.com" }\n'
      + '      Action    = "s3:GetObject"\n'
      + `      Resource  = "\${aws_s3_bucket.${bn}.arn}/*"\n`
      + `      Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.${tn}.arn } }\n`
      + '    }]\n'
      + '  })',
    ]));
  } else if (target && !isS3) {
    // ALB origin: our ALB completion only creates an HTTP:80 listener, so reach
    // it over HTTP (https-only here would 502 against a listener that isn't there).
    originExtra.push(
      '    custom_origin_config {',
      '      http_port              = 80',
      '      https_port             = 443',
      '      origin_protocol_policy = "http-only"',
      '      origin_ssl_protocols   = ["TLSv1.2"]',
      '    }',
    );
  }

  const dist = [
    `resource "aws_cloudfront_distribution" "${tn}" {`,
    '  enabled = true',
    `  comment = ${q(n.props.comment)}`,
    '  origin {',
    `    domain_name = ${domain}`,
    `    origin_id   = ${q(originId)}`,
    ...originExtra,
    '  }',
    '  default_cache_behavior {',
    `    target_origin_id       = ${q(originId)}`,
    '    viewer_protocol_policy = "redirect-to-https"',
    '    allowed_methods        = ["GET", "HEAD"]',
    '    cached_methods         = ["GET", "HEAD"]',
    '    forwarded_values {',
    '      query_string = false',
    '      cookies { forward = "none" }',
    '    }',
    '  }',
    '  restrictions {',
    '    geo_restriction { restriction_type = "none" }',
    '  }',
    '  viewer_certificate {',
    '    cloudfront_default_certificate = true',
    '  }',
    '}',
  ].join('\n');
  return [dist, ...extra].join('\n\n');
}

function emitEcs(n: GraphNode, ctx: Ctx): string {
  const p = n.props;
  const tn = tname(n.id);
  const vpcId = vpcIdOf(ctx.byId, n);
  const subnetIds = vpcId ? subnetIdsInVpc(ctx, vpcId) : [];
  const sgs = sgIdsAttachedTo(ctx, n.id);
  const cpu = String(p.cpu || '256');
  const memory = String(p.memory || '512');
  const cluster = resource('aws_ecs_cluster', `${tn}_cluster`, [`name = ${q(String(p.name) + '-cluster')}`]);

  // If an ALB routes to this service, register it in the ALB's target group.
  const lbEdge = ctx.bp.edges.find(
    (e) => e.type === 'routes_to' && e.to === n.id && ctx.byId.get(e.from)?.type === 'aws_lb',
  );
  const lbNode = lbEdge ? ctx.byId.get(lbEdge.from) : undefined;
  const port = Number(lbNode && lbNode.props.targetPort) || 80;
  const lbBlock = lbNode ? [
    '  load_balancer {',
    `    target_group_arn = aws_lb_target_group.${tname(lbNode.id)}_tg.arn`,
    `    container_name   = ${q(p.name)}`,
    `    container_port   = ${port}`,
    '  }',
  ] : [];

  // Task execution role: lets Fargate pull the image from ECR and write logs.
  const execRole = resource('aws_iam_role', `${tn}_exec`, [
    `name = ${q(tn + '-exec')}`,
    'assume_role_policy = jsonencode({\n'
    + '    Version = "2012-10-17"\n'
    + '    Statement = [{\n'
    + '      Action    = "sts:AssumeRole"\n'
    + '      Effect    = "Allow"\n'
    + '      Principal = { Service = "ecs-tasks.amazonaws.com" }\n'
    + '    }]\n'
    + '  })',
  ]);
  const execAttach = resource('aws_iam_role_policy_attachment', `${tn}_exec`, [
    `role       = aws_iam_role.${tn}_exec.name`,
    'policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"',
  ]);

  // Initial task definition with a placeholder image, so the service applies and
  // comes up; real deploys register new revisions out-of-band (see ignore_changes).
  const taskDef = resource('aws_ecs_task_definition', tn, [
    `family                   = ${q(p.name)}`,
    'requires_compatibilities = ["FARGATE"]',
    'network_mode             = "awsvpc"',
    `cpu                      = ${q(cpu)}`,
    `memory                   = ${q(memory)}`,
    `execution_role_arn       = aws_iam_role.${tn}_exec.arn`,
    'container_definitions    = jsonencode([{\n'
    + `    name         = ${q(p.name)}\n`
    + '    image        = "public.ecr.aws/nginx/nginx:latest"\n'
    + '    essential    = true\n'
    + `    portMappings = [{ containerPort = ${port} }]\n`
    + '  }])',
  ]);

  const service = [
    `resource "aws_ecs_service" "${tn}" {`,
    `  name            = ${q(p.name)}`,
    `  cluster         = aws_ecs_cluster.${tn}_cluster.id`,
    `  task_definition = aws_ecs_task_definition.${tn}.arn`,
    `  desired_count   = ${Number(p.desiredCount) || 1}`,
    '  launch_type     = "FARGATE"',
    ...lbBlock,
    '  network_configuration {',
    `    subnets          = [${subnetIds.join(', ')}]`,
    ...(sgs.length ? [`    security_groups  = [${sgs.join(', ')}]`] : ['    # security_groups: attach one']),
    '    assign_public_ip = true',
    '  }',
    '  # Deploys register new task-def revisions out-of-band; don\'t treat that as drift.',
    '  lifecycle {',
    '    ignore_changes = [task_definition]',
    '  }',
    '}',
  ].join('\n');

  return [cluster, execRole, execAttach, taskDef, service].join('\n\n');
}

/** "connects_to" edges → aws_security_group_rule (ingress on the target's SG). */
function emitConnectRules(ctx: Ctx): string[] {
  const out: string[] = [];
  for (const e of ctx.bp.edges) {
    if (e.type !== 'connects_to') continue;
    const a = ctx.byId.get(e.from);
    const b = ctx.byId.get(e.to);
    if (!a || !b) continue;
    const aSg = sgIdsAttachedTo(ctx, a.id)[0];
    const bSg = sgIdsAttachedTo(ctx, b.id)[0];
    if (!aSg || !bSg) {
      out.push(`# connects_to ${a.type} → ${b.type}: needs a security group on both ends`);
      continue;
    }
    const port = b.type === 'aws_db_instance' ? dbPort(b.props.engine) : 443;
    out.push(resource('aws_security_group_rule', `${tname(a.id)}_to_${tname(b.id)}`, [
      'type                     = "ingress"',
      `from_port                = ${port}`,
      `to_port                  = ${port}`,
      'protocol                 = "tcp"',
      `security_group_id        = ${bSg}`,
      `source_security_group_id = ${aSg}`,
    ]));
  }
  return out;
}

// ── Serverless / data / messaging / observability emitters ───────────────────
/** HCL-safe string literal for arbitrary code: escape Terraform's own template
 *  markers so a handler containing `${...}` isn't interpolated by Terraform.
 *  (Function replacements — a `'$${'` string arg would collapse to `${`.) */
function hclCode(s: unknown): string {
  return q(String(s).replace(/\$\{/g, () => '$${').replace(/%\{/g, () => '%%{'));
}

function emitLambda(n: GraphNode, ctx: Ctx): string {
  const p = n.props;
  const tn = tname(n.id);
  const role = roleUsedBy(ctx, n.id);
  const runtime = String(p.runtime || 'nodejs20.x');
  // Inline code only zips for interpreted runtimes; compiled ones need a package.
  const ext = runtime.startsWith('python') ? '.py' : runtime.startsWith('nodejs') ? '.js' : null;
  const srcFile = (String(p.handler || 'index.handler').split('.')[0] || 'index') + (ext || '');
  const blocks: string[] = [];

  let packageLines: string[];
  if (ext && p.code) {
    // The handler travels inline in the HCL and is zipped in-account by the
    // archive provider — no separate upload channel needed.
    blocks.push([
      `data "archive_file" "${tn}_code" {`,
      '  type        = "zip"',
      `  output_path = ${q(tn + '.zip')}`,
      '  source {',
      `    content  = ${hclCode(p.code)}`,
      `    filename = ${q(srcFile)}`,
      '  }',
      '}',
    ].join('\n'));
    packageLines = [
      `filename         = data.archive_file.${tn}_code.output_path`,
      `source_code_hash = data.archive_file.${tn}_code.output_base64sha256`,
    ];
  } else {
    packageLines = [
      '# filename: your deployment package (compiled runtime — supply a zip)',
      'filename         = "REPLACE_WITH_PACKAGE.zip"',
    ];
  }

  blocks.push(resource('aws_lambda_function', tn, [
    `function_name    = ${q(p.name)}`,
    `runtime          = ${q(runtime)}`,
    `handler          = ${q(p.handler)}`,
    `memory_size      = ${Number(p.memory) || 128}`,
    `timeout          = ${Number(p.timeout) || 3}`,
    ...packageLines,
    role
      ? `role             = aws_iam_role.${tname(role.id)}.arn`
      : '# role: connect an IAM role (uses_role) — Lambda requires an execution role',
  ]));
  return blocks.join('\n\n');
}

/** API Gateway HTTP API + its auto-deploy $default stage. */
function emitApiGateway(n: GraphNode): string {
  const tn = tname(n.id);
  return [
    resource('aws_apigatewayv2_api', tn, [
      `name          = ${q(n.props.name)}`,
      'protocol_type = "HTTP"',
    ]),
    resource('aws_apigatewayv2_stage', `${tn}_default`, [
      `api_id      = aws_apigatewayv2_api.${tn}.id`,
      'name        = "$default"',
      'auto_deploy = true',
    ]),
  ].join('\n\n');
}

/**
 * "route" edges (API → Lambda) → the plumbing that makes a method+path invoke a
 * function: a proxy integration, a route keyed by the Lambda's method+path, and
 * the permission letting API Gateway invoke it. The route key comes from the
 * target Lambda's own `method`/`path` fields.
 */
function emitApiRoutes(ctx: Ctx): string[] {
  const out: string[] = [];
  for (const e of ctx.bp.edges) {
    if (e.type !== 'route') continue;
    const api = ctx.byId.get(e.from);
    const fn = ctx.byId.get(e.to);
    if (!api || api.type !== 'aws_apigatewayv2_api' || !fn || fn.type !== 'aws_lambda_function') continue;
    const an = tname(api.id);
    const fnTn = tname(fn.id);
    const pair = `${an}_${fnTn}`;
    const method = String(fn.props.method || 'GET').toUpperCase();
    const path = String(fn.props.path || '/');
    out.push(resource('aws_apigatewayv2_integration', pair, [
      `api_id                 = aws_apigatewayv2_api.${an}.id`,
      'integration_type       = "AWS_PROXY"',
      `integration_uri        = aws_lambda_function.${fnTn}.invoke_arn`,
      'integration_method     = "POST"',
      'payload_format_version = "2.0"',
    ]));
    out.push(resource('aws_apigatewayv2_route', pair, [
      `api_id    = aws_apigatewayv2_api.${an}.id`,
      `route_key = ${q(`${method} ${path}`)}`,
      `target    = "integrations/\${aws_apigatewayv2_integration.${pair}.id}"`,
    ]));
    out.push(resource('aws_lambda_permission', `${pair}_perm`, [
      `statement_id  = ${q('AllowInvoke-' + pair)}`,
      'action        = "lambda:InvokeFunction"',
      `function_name = aws_lambda_function.${fnTn}.function_name`,
      'principal     = "apigateway.amazonaws.com"',
      `source_arn    = "\${aws_apigatewayv2_api.${an}.execution_arn}/*/*"`,
    ]));
  }
  return out;
}

function emitDynamo(n: GraphNode): string {
  const p = n.props;
  const hashKey = String(p.hashKey || 'id');
  const billing = String(p.billingMode || 'PAY_PER_REQUEST');
  // PROVISIONED requires explicit capacities (PAY_PER_REQUEST must not set them).
  const provisioned = billing === 'PROVISIONED';
  return resource('aws_dynamodb_table', tname(n.id), [
    `name         = ${q(p.name)}`,
    `billing_mode = ${q(billing)}`,
    ...(provisioned ? [
      `read_capacity  = ${Number(p.readCapacity) || 5}`,
      `write_capacity = ${Number(p.writeCapacity) || 5}`,
    ] : []),
    `hash_key     = ${q(hashKey)}`,
    `attribute {\n    name = ${q(hashKey)}\n    type = "S"\n  }`,
  ]);
}

function emitLogGroup(n: GraphNode): string {
  return resource('aws_cloudwatch_log_group', tname(n.id), [
    `name              = ${q(n.props.name)}`,
    `retention_in_days = ${Number(n.props.retentionDays) || 14}`,
  ]);
}

function emitEcr(n: GraphNode): string {
  const p = n.props;
  return resource('aws_ecr_repository', tname(n.id), [
    `name                 = ${q(p.name)}`,
    `image_tag_mutability = ${q(p.mutability || 'MUTABLE')}`,
    `image_scanning_configuration {\n    scan_on_push = ${p.scanOnPush === 'true'}\n  }`,
  ]);
}

function emitSqs(n: GraphNode): string {
  const p = n.props;
  const fifo = p.fifo === 'true';
  const name = fifo && !String(p.name).endsWith('.fifo') ? `${p.name}.fifo` : String(p.name);
  return resource('aws_sqs_queue', tname(n.id), [
    `name                       = ${q(name)}`,
    ...(fifo ? ['fifo_queue                 = true'] : []),
    `visibility_timeout_seconds = ${Number(p.visibilityTimeout) || 30}`,
  ]);
}

function emitSns(n: GraphNode): string {
  return resource('aws_sns_topic', tname(n.id), [`name = ${q(n.props.name)}`]);
}

/** "publishes_to" edges (SNS → SQS) → a subscription + a queue policy that lets
 *  the topic deliver (SQS drops SNS messages without it — the coherence lesson). */
function emitSnsSubscriptions(ctx: Ctx): string[] {
  const out: string[] = [];
  for (const e of ctx.bp.edges) {
    if (e.type !== 'publishes_to') continue;
    const topic = ctx.byId.get(e.from);
    const queue = ctx.byId.get(e.to);
    if (!topic || topic.type !== 'aws_sns_topic' || !queue || queue.type !== 'aws_sqs_queue') continue;
    const tn = tname(topic.id);
    const qn = tname(queue.id);
    out.push(resource('aws_sns_topic_subscription', `${tn}_to_${qn}`, [
      `topic_arn = aws_sns_topic.${tn}.arn`,
      'protocol  = "sqs"',
      `endpoint  = aws_sqs_queue.${qn}.arn`,
    ]));
    out.push(resource('aws_sqs_queue_policy', `${qn}_from_${tn}`, [
      `queue_url = aws_sqs_queue.${qn}.id`,
      'policy = jsonencode({\n'
      + '    Version = "2012-10-17"\n'
      + '    Statement = [{\n'
      + '      Effect    = "Allow"\n'
      + '      Principal = { Service = "sns.amazonaws.com" }\n'
      + '      Action    = "sqs:SendMessage"\n'
      + `      Resource  = aws_sqs_queue.${qn}.arn\n`
      + `      Condition = { ArnEquals = { "aws:SourceArn" = aws_sns_topic.${tn}.arn } }\n`
      + '    }]\n'
      + '  })',
    ]));
  }
  return out;
}

// ── Completion synthesis (resources the drawn nodes need to actually work) ────
/**
 * VPC internet + routing: an IGW + public route table for public subnets (so
 * "public" actually means reachable), and — when the VPC opts into NAT and has
 * both public and private subnets — a NAT gateway + private route table for
 * private-subnet egress. All synthesized; the user only drew the VPC and subnets.
 */
function emitVpcNetworking(vpc: GraphNode, ctx: Ctx): string[] {
  const vp = tname(vpc.id);
  const vpcRef = `aws_vpc.${vp}.id`;
  const label = String(vpc.props.name ?? 'main');
  const subnets = ctx.bp.nodes.filter((n) => n.type === 'aws_subnet' && n.parent === vpc.id);
  const publicSubnets = subnets.filter((s) => s.props.public === 'true');
  const privateSubnets = subnets.filter((s) => s.props.public !== 'true');
  const out: string[] = [];

  if (publicSubnets.length) {
    out.push(resource('aws_internet_gateway', `${vp}_igw`, [
      `vpc_id = ${vpcRef}`,
      `tags   = ${tag(label + '-igw')}`,
    ]));
    out.push(resource('aws_route_table', `${vp}_public`, [
      `vpc_id = ${vpcRef}`,
      `route {\n    cidr_block = "0.0.0.0/0"\n    gateway_id = aws_internet_gateway.${vp}_igw.id\n  }`,
      `tags   = ${tag(label + '-public')}`,
    ]));
    for (const s of publicSubnets) {
      out.push(resource('aws_route_table_association', `${tname(s.id)}_public`, [
        `subnet_id      = aws_subnet.${tname(s.id)}.id`,
        `route_table_id = aws_route_table.${vp}_public.id`,
      ]));
    }
  }

  if (vpc.props.nat === 'true' && privateSubnets.length && publicSubnets.length) {
    out.push(resource('aws_eip', `${vp}_nat`, ['domain = "vpc"']));
    out.push(resource('aws_nat_gateway', `${vp}_nat`, [
      `allocation_id = aws_eip.${vp}_nat.id`,
      `subnet_id     = aws_subnet.${tname(publicSubnets[0].id)}.id`,
      `tags          = ${tag(label + '-nat')}`,
    ]));
    out.push(resource('aws_route_table', `${vp}_private`, [
      `vpc_id = ${vpcRef}`,
      `route {\n    cidr_block     = "0.0.0.0/0"\n    nat_gateway_id = aws_nat_gateway.${vp}_nat.id\n  }`,
      `tags   = ${tag(label + '-private')}`,
    ]));
    for (const s of privateSubnets) {
      out.push(resource('aws_route_table_association', `${tname(s.id)}_private`, [
        `subnet_id      = aws_subnet.${tname(s.id)}.id`,
        `route_table_id = aws_route_table.${vp}_private.id`,
      ]));
    }
  }
  return out;
}

/**
 * ALB delivery + security coherence. An ALB needs its own security group
 * (inbound 80 from the internet) or nothing reaches it; and each target's
 * security group must admit the ALB on the target port or traffic is dropped at
 * the instance. So this synthesizes: the ALB SG (always), and — when the ALB
 * routes somewhere — a target group + HTTP listener, per-instance attachments,
 * and a least-privilege ingress rule opening each target's SG to the ALB SG on
 * the target port. (ECS targets register via their load_balancer block in emitEcs.)
 */
function emitLbCompletion(lb: GraphNode, ctx: Ctx): string[] {
  const ln = tname(lb.id);
  const vpcId = vpcIdOf(ctx.byId, lb);
  if (!vpcId) return []; // an ALB must be in a VPC to get an SG / target group
  const label = String(lb.props.name || ln);
  const targetPort = Number(lb.props.targetPort) || 80;
  const out: string[] = [];

  // ALB security group: inbound 80 from the internet, egress all.
  out.push(resource('aws_security_group', `${ln}_sg`, [
    `name   = ${q(label + '-alb-sg')}`,
    `vpc_id = aws_vpc.${tname(vpcId)}.id`,
    'ingress {\n    from_port   = 80\n    to_port     = 80\n    protocol    = "tcp"\n    cidr_blocks = ["0.0.0.0/0"]\n  }',
    egressAll,
  ]));

  const targets = ctx.bp.edges
    .filter((e) => e.type === 'routes_to' && e.from === lb.id)
    .map((e) => ctx.byId.get(e.to))
    .filter((n): n is GraphNode => !!n);
  if (!targets.length) return out; // SG only; nothing to route yet

  const targetType = targets.some((t) => t.type === 'aws_ecs_service') ? 'ip' : 'instance';
  out.push(resource('aws_lb_target_group', `${ln}_tg`, [
    `name        = ${q(label + '-tg')}`,
    `port        = ${targetPort}`,
    'protocol    = "HTTP"',
    `vpc_id      = aws_vpc.${tname(vpcId)}.id`,
    `target_type = ${q(targetType)}`,
  ]));
  out.push(resource('aws_lb_listener', `${ln}_listener`, [
    `load_balancer_arn = aws_lb.${ln}.arn`,
    'port              = 80',
    'protocol          = "HTTP"',
    `default_action {\n    type             = "forward"\n    target_group_arn = aws_lb_target_group.${ln}_tg.arn\n  }`,
  ]));
  for (const t of targets) {
    if (t.type === 'aws_instance') {
      out.push(resource('aws_lb_target_group_attachment', `${ln}_${tname(t.id)}`, [
        `target_group_arn = aws_lb_target_group.${ln}_tg.arn`,
        `target_id        = aws_instance.${tname(t.id)}.id`,
      ]));
    }
    // Open the target's SG to the ALB on the target port (least-privilege).
    const targetSg = sgIdsAttachedTo(ctx, t.id)[0];
    if (targetSg) {
      out.push(resource('aws_security_group_rule', `${ln}_to_${tname(t.id)}`, [
        'type                     = "ingress"',
        `from_port                = ${targetPort}`,
        `to_port                  = ${targetPort}`,
        'protocol                 = "tcp"',
        `security_group_id        = ${targetSg}`,
        `source_security_group_id = aws_security_group.${ln}_sg.id`,
      ]));
    }
  }
  return out;
}

// ── Header / orchestration ───────────────────────────────────────────────────
function header(bp: Blueprint): string {
  const region = bp.meta.region || 'us-east-1';
  // The archive provider zips inline Lambda code (emitLambda).
  const needsArchive = bp.nodes.some((n) => n.type === 'aws_lambda_function');
  return [
    `# Terraform for "${bp.meta.name}" — generated by the cloud pack compiler.`,
    '# Deterministic: the same blueprint always produces this exact file.',
    '',
    'terraform {',
    '  required_providers {',
    '    aws = {',
    '      source  = "hashicorp/aws"',
    '      version = "~> 5.0"',
    '    }',
    ...(needsArchive ? [
      '    archive = {',
      '      source  = "hashicorp/archive"',
      '      version = "~> 2.0"',
      '    }',
    ] : []),
    '  }',
    '}',
    '',
    'provider "aws" {',
    `  region = "${region}"`,
    '}',
  ].join('\n');
}

/** Expose the live endpoint URL of each API Gateway as a terraform output, so the
 *  apply outcome (which captures `terraform output`) shows it on the canvas. */
function emitOutputs(bp: Blueprint): string[] {
  return bp.nodes
    .filter((n) => n.type === 'aws_apigatewayv2_api')
    .map((n) => [
      `output "${tname(n.id)}_url" {`,
      `  value = aws_apigatewayv2_api.${tname(n.id)}.api_endpoint`,
      '}',
    ].join('\n'));
}

const DB_PASSWORD_VAR =
  'variable "db_password" {\n  type      = string\n  sensitive = true\n}';

const EMITTERS: Record<string, (n: GraphNode, ctx: Ctx) => string> = {
  aws_vpc: emitVpc,
  aws_subnet: emitSubnet,
  aws_security_group: emitSecurityGroup,
  aws_instance: emitInstance,
  aws_db_instance: emitDb,
  aws_lb: emitLb,
  aws_cloudfront_distribution: emitCloudFront,
  aws_ecs_service: emitEcs,
  aws_s3_bucket: emitS3,
  aws_iam_role: emitIamRole,
  aws_lambda_function: emitLambda,
  aws_ecr_repository: emitEcr,
  aws_apigatewayv2_api: emitApiGateway,
  aws_dynamodb_table: emitDynamo,
  aws_cloudwatch_log_group: emitLogGroup,
  aws_sqs_queue: emitSqs,
  aws_sns_topic: emitSns,
};

export function compileToTerraform(bp: Blueprint): string {
  const ctx: Ctx = { bp, byId: new Map(bp.nodes.map((n) => [n.id, n])) };

  const parts: string[] = [header(bp)];
  for (const n of bp.nodes) {
    const emit = EMITTERS[n.type];
    parts.push(emit ? emit(n, ctx) : `# unsupported node type: ${n.type}`);
  }
  // Completion synthesis: routing/gateways for VPCs, target groups/listeners for
  // ALBs — the plumbing the drawn nodes need to actually function.
  for (const n of bp.nodes) {
    if (n.type === 'aws_vpc') parts.push(...emitVpcNetworking(n, ctx));
    if (n.type === 'aws_lb') parts.push(...emitLbCompletion(n, ctx));
  }
  parts.push(...emitConnectRules(ctx));
  parts.push(...emitSnsSubscriptions(ctx));
  parts.push(...emitApiRoutes(ctx));
  if (bp.nodes.some((n) => n.type === 'aws_db_instance')) parts.push(DB_PASSWORD_VAR);
  parts.push(...emitOutputs(bp));

  return parts.join('\n\n') + '\n';
}
