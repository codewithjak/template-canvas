# Service Constraints: enforcing provider rules per service

> **Status:** Proposal / Design (implementation in progress)
> **Date:** 2026-06-30
> **Scope owner:** Junaid Khan
> **Part of:** `VISUAL_CLOUD_BUILDER_ARCHITECTURE.md` (the cloud pack)
> **Companion memory:** `canvas-run-anything-vision`

---

## 1. Goal

Each cloud service has **hard rules defined by the provider**: a subnet lives in
exactly one VPC, a security group attaches only to resources in the same VPC, an
EC2 instance lives in a subnet, RDS needs subnets in two availability zones. These
rules must be **declared on the service and enforced uniformly**, not patched in
one place (for example `onConnect`) and missed in another.

The symptom that motivated this: because connection rules were enforced only when
a node *had* rules, VPC and Subnet (which had none) could be connected to anything,
so the canvas allowed drawing a subnet to two VPCs. That is a provider-illegal
shape. The fix is architectural: model the rules as data, enforce them in one
engine, leave no permissive gaps.

---

## 2. The problem with the old approach

Rules were scattered and partial:

- `onConnect` allowed an edge unless the source declared rules and none matched, so
  rule-less node types connected freely.
- containment was a loose `parents: string[]` with no notion of "required" or
  "same scope".
- the linter hand-wrote each check.

There was no single description of "what is legal for this service", so gaps were
inevitable.

---

## 3. The model: `ServiceConstraints` on each catalog entry

Every service declares its provider rules as data:

```ts
interface ContainerRule {
  types: string[];   // allowed parent types, e.g. subnet -> ['aws_vpc']
  required: boolean; // must it have a parent? (subnet: yes; s3 bucket: no)
}

interface ConnectionRule {
  type: string;      // 'attached_to' | 'connects_to' | 'routes_to' | 'origin'
  to: string[];      // valid target types
  sameVpc?: boolean; // both ends must share a VPC (security group <-> instance)
  max?: number;      // cardinality cap per source (optional)
}

interface CatalogEntry {
  // …type, label, group, create, fields…
  container?: ContainerRule;       // replaces the old `parents`
  connections?: ConnectionRule[];  // replaces the old `edges`
  invariants?: InvariantId[];      // named cross-cutting validators
}
```

The single-parent rule (a subnet in exactly one VPC) is **structural**: a node has
one `parent`, so "two VPCs" is impossible by construction. The spec adds the rest:
which parent, whether required, which connections, cardinality, same-scope, and
named invariants for the complex cases.

---

## 4. The engine: one enforcement layer, three call sites

A small, pure engine reads the constraints. Every interaction point consults it
instead of having its own logic.

```ts
connectionRule(pack, fromType, toType): ConnectionRule | undefined
containerTypes(pack, type): string[]
containerRequired(pack, type): boolean
```

| Call site | Uses | Effect |
|---|---|---|
| **Connect** (drawing an edge) | `connectionRule` | allow only declared connections; reject VPC-to-subnet, VPC-to-VPC, etc.; tag valid ones with the rule's type |
| **Container** (the dropdown, future drag-to-nest) | `containerTypes` | list only valid parents; block invalid |
| **Lint** (live) | `containerRequired`, `connections`, `invariants` | required-parent, wrong-parent, same-VPC, cardinality, and provider invariants become diagnostics |

The linter's structural checks become **derived from the constraints**; only the
genuinely cross-cutting invariants remain as bespoke validators.

---

## 5. AWS rules, declared (the 10 current services)

| Service | container | connections | invariants |
|---|---|---|---|
| VPC | none | | |
| Subnet | `aws_vpc`, required | | cidr-within-vpc |
| Security Group | `aws_vpc`, required | attached_to instance/db/lb/ecs, sameVpc | |
| EC2 Instance | `aws_subnet`, required | connects_to db | |
| ECS Service | `aws_subnet`, required | connects_to db | |
| RDS | `aws_subnet`, required | | rds-needs-two-azs, not-publicly-accessible |
| Load Balancer | `aws_vpc`, required | routes_to instance/ecs | needs-two-azs |
| S3 Bucket | none | | not-public-read |
| CloudFront | none | origin s3/lb | |
| IAM Role | none | | |

These are the provider's rules expressed as data on the service, not logic spread
across the UI.

---

## 6. Invariants (the complex, cross-cutting rules)

Some rules cannot be expressed as a simple container or connection. They are named
validators the engine runs over the whole blueprint:

| Invariant | Rule | Status |
|---|---|---|
| `same-vpc` | a `sameVpc` connection's endpoints must share a VPC | implement now (lint) |
| `db-not-public` | RDS not `publicly_accessible` and not in a public subnet | already a rule |
| `ssh-open` | security group must not open 22/3389 to 0.0.0.0/0 | already a rule |
| `cidr-within-vpc` | a subnet CIDR must fall inside its VPC CIDR | future (needs CIDR math) |
| `rds-needs-two-azs` | RDS subnet group must span two AZs | future |

The structural rules (container, connections, required, same-VPC) ship with this
change; the CIDR and multi-AZ invariants are follow-ups, declared here so the model
has a home for them.

---

## 7. Why this is the right level

- **Provider-specific:** AWS rules live in the AWS catalog; Azure and GCP declare
  their own against the same engine.
- **Single source of truth:** connect, container, and lint all read one spec, so
  there are no permissive gaps.
- **Composes and scales:** adding a service (Lambda, etc.) means declaring its
  constraints once; all three call sites enforce them automatically. The same
  design-derived pattern as the compiler, the IAM deriver, and the cost estimator.

---

## 8. Implementation mapping

1. `spine/domainPack.ts`: replace `parents` / `edges` with `container` /
   `connections`; add `ContainerRule`, `ConnectionRule`, `invariants`.
2. `spine/constraints.ts`: the engine (`connectionRule`, `containerTypes`,
   `containerRequired`).
3. `packs/cloud/catalog.ts`: backfill the 10 services with their constraints.
4. `GraphCanvasBase.tsx`: `onConnect` and the container dropdown consume the engine.
5. `packs/cloud/lint.ts`: containment checks derive from `container`; add the
   `same-vpc` invariant; keep the existing bespoke invariants.
