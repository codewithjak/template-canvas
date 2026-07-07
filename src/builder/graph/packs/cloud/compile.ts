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

/** Walk the parent chain to the enclosing VPC id. */
function vpcIdOf(ctx: Ctx, node: GraphNode): string | undefined {
  let cur: GraphNode | undefined = node;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (cur.type === 'aws_vpc') return cur.id;
    cur = cur.parent ? ctx.byId.get(cur.parent) : undefined;
  }
  return undefined;
}

/** Subnet id refs that belong to a VPC (direct children). */
function subnetIdsInVpc(ctx: Ctx, vpcId: string): string[] {
  return ctx.bp.nodes
    .filter((n) => n.type === 'aws_subnet' && n.parent === vpcId)
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
  const vpc = refId(ctx, vpcIdOf(ctx, n));
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
  const vpcId = vpcIdOf(ctx, n);
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

function emitIamRole(n: GraphNode, ctx: Ctx): string {
  const tn = tname(n.id);
  const policy =
    'assume_role_policy = jsonencode({\n'
    + '    Version = "2012-10-17"\n'
    + '    Statement = [{\n'
    + '      Action    = "sts:AssumeRole"\n'
    + '      Effect    = "Allow"\n'
    + '      Principal = { Service = "ec2.amazonaws.com" }\n'
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
  // An instance can only assume a role through an instance profile — synthesize
  // one when any instance uses this role (referenced by emitInstance above).
  const usedByInstance = ctx.bp.edges.some((e) => e.type === 'uses_role' && e.to === n.id);
  if (usedByInstance) {
    blocks.push(resource('aws_iam_instance_profile', `${tn}_profile`, [
      `name = ${q(tn + '-profile')}`,
      `role = aws_iam_role.${tn}.name`,
    ]));
  }
  return blocks.join('\n\n');
}

function emitLb(n: GraphNode, ctx: Ctx): string {
  const p = n.props;
  const vpcId = vpcIdOf(ctx, n);
  const subnetIds = vpcId ? subnetIdsInVpc(ctx, vpcId) : [];
  const sgs = sgIdsAttachedTo(ctx, n.id);
  return resource('aws_lb', tname(n.id), [
    `name               = ${q(p.name)}`,
    `internal           = ${p.scheme === 'internal'}`,
    'load_balancer_type = "application"',
    ...(sgs.length ? [`security_groups    = [${sgs.join(', ')}]`] : []),
    subnetIds.length
      ? `subnets            = [${subnetIds.join(', ')}]`
      : '# subnets: add subnets to the VPC (an ALB needs ≥2 AZs)',
  ]);
}

function emitCloudFront(n: GraphNode, ctx: Ctx): string {
  const tn = tname(n.id);
  const originEdge = ctx.bp.edges.find((e) => e.type === 'origin' && e.from === n.id);
  const target = originEdge ? ctx.byId.get(originEdge.to) : undefined;
  const originId = target ? tname(target.id) : 'origin';
  const domain = !target
    ? '"example.com"'
    : target.type === 'aws_s3_bucket'
      ? `aws_s3_bucket.${tname(target.id)}.bucket_regional_domain_name`
      : `aws_lb.${tname(target.id)}.dns_name`;
  return [
    `resource "aws_cloudfront_distribution" "${tn}" {`,
    '  enabled = true',
    `  comment = ${q(n.props.comment)}`,
    '  origin {',
    `    domain_name = ${domain}`,
    `    origin_id   = ${q(originId)}`,
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
}

function emitEcs(n: GraphNode, ctx: Ctx): string {
  const p = n.props;
  const tn = tname(n.id);
  const vpcId = vpcIdOf(ctx, n);
  const subnetIds = vpcId ? subnetIdsInVpc(ctx, vpcId) : [];
  const sgs = sgIdsAttachedTo(ctx, n.id);
  const cluster = resource('aws_ecs_cluster', `${tn}_cluster`, [`name = ${q(String(p.name) + '-cluster')}`]);
  // If an ALB routes to this service, register it in the ALB's target group.
  const lbEdge = ctx.bp.edges.find(
    (e) => e.type === 'routes_to' && e.to === n.id && ctx.byId.get(e.from)?.type === 'aws_lb',
  );
  const lbBlock = lbEdge ? [
    '  load_balancer {',
    `    target_group_arn = aws_lb_target_group.${tname(lbEdge.from)}_tg.arn`,
    `    container_name   = ${q(p.name)}`,
    '    container_port   = 80',
    '  }',
  ] : [];
  const service = [
    `resource "aws_ecs_service" "${tn}" {`,
    `  name            = ${q(p.name)}`,
    `  cluster         = aws_ecs_cluster.${tn}_cluster.id`,
    `  desired_count   = ${Number(p.desiredCount) || 1}`,
    '  launch_type     = "FARGATE"',
    '  # task_definition is your container/app — out of infra scope (the user supplies it)',
    '  task_definition = "REPLACE_WITH_TASK_DEFINITION_ARN"',
    ...lbBlock,
    '  network_configuration {',
    `    subnets         = [${subnetIds.join(', ')}]`,
    ...(sgs.length ? [`    security_groups = [${sgs.join(', ')}]`] : ['    # security_groups: attach one']),
    '  }',
    '}',
  ].join('\n');
  return cluster + '\n\n' + service;
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
 * ALB delivery: a target group + HTTP listener, plus attachments for each
 * "routes_to" target. An ALB alone routes nowhere; these are what connect it to
 * the instances/services it points at. (ECS targets register via their own
 * load_balancer block in emitEcs.)
 */
function emitLbCompletion(lb: GraphNode, ctx: Ctx): string[] {
  const routes = ctx.bp.edges.filter((e) => e.type === 'routes_to' && e.from === lb.id);
  if (!routes.length) return [];
  const targets = routes.map((e) => ctx.byId.get(e.to)).filter((n): n is GraphNode => !!n);
  const ln = tname(lb.id);
  const vpcId = vpcIdOf(ctx, lb);
  const targetType = targets.some((t) => t.type === 'aws_ecs_service') ? 'ip' : 'instance';
  const out: string[] = [];

  out.push(resource('aws_lb_target_group', `${ln}_tg`, [
    `name        = ${q(String(lb.props.name || ln) + '-tg')}`,
    'port        = 80',
    'protocol    = "HTTP"',
    ...(vpcId ? [`vpc_id      = aws_vpc.${tname(vpcId)}.id`] : []),
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
  }
  return out;
}

// ── Header / orchestration ───────────────────────────────────────────────────
function header(bp: Blueprint): string {
  const region = bp.meta.region || 'us-east-1';
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
    '  }',
    '}',
    '',
    'provider "aws" {',
    `  region = "${region}"`,
    '}',
  ].join('\n');
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
  if (bp.nodes.some((n) => n.type === 'aws_db_instance')) parts.push(DB_PASSWORD_VAR);

  return parts.join('\n\n') + '\n';
}
