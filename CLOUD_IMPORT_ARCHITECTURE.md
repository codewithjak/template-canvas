# Import: bringing an existing account into the canvas

> **Status:** Proposal / Design
> **Date:** 2026-07-07
> **Scope owner:** Junaid Khan
> **Part of:** `VISUAL_CLOUD_BUILDER_ARCHITECTURE.md` (the cloud pack runtime)
> **Companions:** `docs/CLOUD_BUILDER_DEPLOYMENTS_ARCHITECTURE.md` (a discovered infra
> becomes a deployment), `CLOUD_DRIFT_ARCHITECTURE.md` §8 (this is the north star it names)
> **Companion memory:** `canvas-run-anything-vision`

---

## 1. Goal

Take an AWS account that already has live infrastructure **Mapdoc never deployed**
and pull it into the editable canvas: draw what is really running, adopt it as a
managed deployment, and from then on plan / apply / drift / destroy it like anything
built here. This is the return leg of the bidirectional model. Drift answers "did
what we deployed move?"; import answers the prior question the wedge cannot: "what
is already here?"

Without it, a connected account that was not built through Mapdoc is invisible: the
runner only knows what is in a deployment's Terraform state, and an unmanaged account
has no such state (see `CLOUD_DRIFT_ARCHITECTURE.md` §1, §9.2).

---

## 2. What the current architecture gives us, and what it does not

**One-way today.** `compile.ts` is a pure `Blueprint → HCL` function: a registry of
per-node emitters (`EMITTERS`) over the ~11-type `catalog.ts` (VPC, subnet, security
group, ALB, CloudFront, EC2, ECS, RDS, S3, IAM role). There is no inverse. Import is
that inverse: a **decompiler** from real resources back to a `Blueprint`.

Three properties of the compiler define how hard the inverse is:

1. **The catalog is a curated subset.** A real account has hundreds of resource
   types; we model a handful. Import is therefore inherently **lossy and partial**:
   most accounts contain resources with no catalog node.
2. **The graph abstracts away synthesized resources.** One node emits several
   resources the user never drew: RDS synthesizes `aws_db_subnet_group`, ECS
   synthesizes `aws_ecs_cluster`, `connects_to` edges synthesize
   `aws_security_group_rule`. The decompiler must **re-collapse** these back into
   the node (or the edge) they came from, or they surface as spurious nodes.
3. **Relationships are structural, not stored.** Containment (`parent`) and edges
   (`attached_to`, `connects_to`, `routes_to`, `origin`) are inferred by the
   compiler from references (subnet in VPC, SG ids on an instance, SG rule between
   two SGs). Import must **re-infer** them from the live resources' associations.

**The IAM boundary forces discovery in-account.** The `ConnectRole` we assume
(`infra/connect-account/stack.yaml`) grants only `codebuild:StartBuild`,
`iam:PassRole` for the runner, and read on the state bucket + logs. It has **no
`Describe*` / `List*`** on the account's resources. So our backend physically cannot
enumerate a customer's infrastructure. Discovery must run **inside the runner**
(CodeBuild, `RunnerRole`), exactly like plan/apply, using whatever the customer's
`RunnerPolicyArn` grants. This is not a limitation to work around; it is the trust
model ("the runner is the customer's; we hold nothing") and import must keep it.

---

## 3. The model: three planes

Import is three separable steps. Keeping them separate is what makes it tractable.

```
  DISCOVER            MODEL (decompile)              ADOPT (identity + state)
  real resources  →   Blueprint (nodes/edges)   →    a managed deployment
  (in the runner)     (ours, from an inventory)       (state in customer S3)
```

- **Discover** — enumerate what exists and produce a sanitized **inventory** (types,
  identifiers, key attributes, associations). Runs in the runner; secrets never
  leave the account.
- **Model** — decompile the inventory into a `Blueprint`: map types to catalog
  nodes, rebuild containment and edges, collapse synthesized resources, represent
  the unmodeled remainder as opaque nodes. This is ours and pure/testable.
- **Adopt** — make it real and managed: the blueprint becomes a template, a
  `cloud_deployments` row (its own state key), and Terraform **import** lands the
  resources in that deployment's state. After this it is an ordinary deployment.

---

## 4. Discover (in the runner)

The runner produces a **sanitized resource inventory** as its result artifact, the
same way plan/drift upload a parsed result today (`runner.js` presigns a result URL;
the buildspec `curl`s the output to it). The inventory is JSON: per resource an
address/id, type, region, a whitelist of non-sensitive attributes, and associations
(VPC/subnet membership, attached SG ids, SG rules, LB targets). **No secrets, no
state blob** leaves the account.

Enumeration options, all runnable in-account:

- **Terraform 1.5+ native import (recommended).** Enumerate resource ids (Cloud
  Control `list-resources` or `Describe*`), emit `import {}` blocks, then
  `terraform plan -generate-config-out=generated.tf` produces HCL for exactly those
  resources and `apply` writes them into state. Native, no third-party tool, and it
  lands real state in the customer's S3 under the deployment's key. Downside: you
  must know ids up front, so it still needs an enumeration pass.
- **`terraformer`.** Scans a live account and generates HCL + tfstate directly.
  Broadest coverage, fastest to a first result; third-party, and its output usually
  needs massaging. Good for Phase 1 breadth.
- **AWS Config / Resource Explorer / Cloud Control API.** Pure inventory sources to
  drive the enumeration pass, independent of Terraform.

The decompiler (§5) consumes the **inventory**, not raw state, so the discovery tool
is swappable. We can read the resulting tfstate from S3 via the ConnectRole
(`s3:GetObject` on the state bucket) if needed, but the inventory path is preferred
because it keeps secrets in-account by construction.

---

## 5. Model: the decompiler (inverse of `compile.ts`)

A pure function `inventory → Blueprint`, mirroring `compile.ts` in reverse. For each
compiler rule there is a decompiler rule:

| Compiler (`compile.ts`) | Decompiler |
|---|---|
| node `type` → `resource "type"` | resource `type` → catalog node of that `type` (if modeled) |
| `parent` → `subnet_id` / `vpc_id` ref | membership (subnet's `vpc_id`, instance's `subnet_id`) → `parent` |
| `attached_to` edge → `vpc_security_group_ids` | a resource's attached SG ids → `attached_to` edges from those SGs |
| `connects_to` edge → `aws_security_group_rule` | an SG rule between two SGs → a `connects_to` edge (re-collapsed) |
| `routes_to` / `origin` edges → LB/CloudFront refs | target group members / distribution origin → those edges |
| RDS synthesizes `aws_db_subnet_group` | drop it; fold back into the `aws_db_instance` node |
| ECS synthesizes `aws_ecs_cluster` | drop it; fold back into the `aws_ecs_service` node |

Node identity: the compiler keys everything on `tname(id)` and emits
`type.tname(id)`. The decompiler must **mint stable node ids** whose
`type.tname(id)` maps back to the real resource, so the `address → node` map that
drift and outcome reflection already rely on (`outcome.ts`) works unchanged for an
imported deployment. Deriving the id from the resource's real name/tag keeps it
stable across re-imports.

**The unmodeled remainder.** Resources with no catalog node (the majority) cannot be
dropped (they are real and managed) nor drawn as first-class nodes (we have no
emitter). Represent them as **opaque nodes**: a new `aws_opaque` catalog entry that
carries the raw `type`, address, and read-only attributes, renders as a neutral
"unmanaged/imported" box, and is **excluded from `compileToTerraform`** (its HCL is
the generated config, not re-emitted). This keeps the graph faithful without
pretending we model everything, and marks exactly what the catalog should grow to
cover next.

The decompiler is pure and snapshot-testable, the same discipline as the compiler.

---

## 6. Adopt: identity and state

A discovered infra becomes a first-class **deployment** (the deployments doc is the
prerequisite that makes this possible — an account can hold many):

1. The reconstructed `Blueprint` is saved as a `templates` row
   (`environment='cloud'`), so it opens in the canvas like any design.
2. A `cloud_deployments` row is created for `(connection, template)`, its state key
   being the deployment's own `state/{connection}/{deployment}.tfstate`.
3. Terraform **import** (the `import {}` + apply from §4) lands the real resources in
   that state key. From here the deployment is indistinguishable from one Mapdoc
   built: drift, apply, destroy, and the future health signal all operate on it.

**Provenance.** `cloud_deployments` gains `source text default 'drawn'` set to
`'imported'` for these, and an `imported_at`. Useful for UI ("imported from your
account") and for treating the first post-import plan specially (§7).

---

## 7. Fidelity: the "first plan is clean" test

The acceptance criterion for a correct import is that immediately after adoption,
`terraform plan` on the deployment shows **no changes**. If the generated HCL does
not exactly match reality, the first plan proposes spurious diffs, and drift (which
is that same plan, `CLOUD_DRIFT_ARCHITECTURE.md` §3.2) becomes noise.

This is the same fidelity risk as drift, and it is real: Terraform's own
`generate-config-out` is known to emit config that needs hand-tuning. So import is a
**review-then-adopt** flow, never silent:

- Discover + decompile produce a *proposed* blueprint shown on the canvas (opaque
  nodes and inferred edges visibly marked).
- A dry-run plan against the imported state is shown (like the drift/approval gate).
- The user adopts only when that plan is clean (or knowingly accepts the diff).

No import writes to the blueprint library or marks a deployment managed until the
user approves, mirroring the human-in-the-loop apply/reconcile path.

---

## 8. Trust

Import must not weaken "we hold nothing":

- **Enumeration and Terraform import run in the runner** (customer account), forced
  by the ConnectRole having no `Describe*` and correct by the trust model.
- **State stays in the customer's S3** under the deployment key, exactly as for
  drawn deployments. We never store tfstate.
- **We store only the abstract blueprint** (types, names, structure) as template
  `body_json`, and the sanitized inventory transiently. Secrets in real resources
  (RDS passwords, keys) live only in the customer's state, never in the inventory or
  the blueprint. The runner sanitizes attributes before upload.

So import extends the model without changing the custody boundary, the same way the
planned health/cost/posture collectors do (deployments doc §11.4).

---

## 9. Data model

- **`cloud_deployments`**: add `source text not null default 'drawn'`
  (`drawn` | `imported`) and `imported_at timestamptz`.
- **`templates`**: no change; the reconstructed blueprint is ordinary `body_json`
  with `environment='cloud'`.
- **Catalog**: add an `aws_opaque` node type for the unmodeled remainder (raw type +
  attributes, not compiled).
- **Runner**: an `inventoryBuildspec` (enumerate → sanitized inventory → upload) and
  an `importBuildspec` (`import {}` + `generate-config-out` → apply into the
  deployment state key), reusing `runBuild` and its presigned result exactly like
  plan/drift.
- **Backend**: a decompiler module (`inventory → Blueprint`, pure) and an import
  route (`POST /v1/cloud/import { connectionId }` → run discovery → return the
  proposed blueprint; `POST .../adopt` → create template + deployment + import).

---

## 10. Flow (end to end)

```
connect account (existing)
   → POST /v1/cloud/import { connectionId }
       runner: enumerate → sanitized inventory (in-account)
       backend: decompile inventory → proposed Blueprint (opaque nodes + inferred edges)
   → canvas shows the proposed design for REVIEW
   → POST .../adopt
       create template (environment='cloud') + cloud_deployments (source='imported')
       runner: terraform import → real state in state/{conn}/{deployment}.tfstate
       dry-run plan → must be clean
   → now a managed deployment: drift / apply / destroy / health all work
```

---

## 11. Phasing

**Phase 1 — the wedge (single region, catalog subset).** Enumerate one region;
decompile the catalog-modeled types (VPC/subnet/SG/EC2/RDS/S3/ALB) with containment;
everything else becomes opaque nodes. Import via `import {}` +
`generate-config-out`. Review-then-adopt. Proves the loop on a real account.

**Phase 2 — relationships + synthesized collapse.** Re-infer `attached_to`,
`connects_to`, `routes_to`, `origin`; fold `aws_db_subnet_group` /
`aws_ecs_cluster` / `aws_security_group_rule` back into their nodes/edges, so an
imported design round-trips through `compile.ts` cleanly.

**Phase 3 — breadth + continuous.** Multi-region / multi-account discovery; grow the
catalog to demote opaque nodes into first-class ones; periodic re-discovery that
diffs the live account against the model to surface **new** un-managed resources
(the ghost detection named in `CLOUD_DRIFT_ARCHITECTURE.md` §2, §8) — the same
sweeper pattern as drift, one collector deeper.

**Phase 4 — pull reconciliation.** With a faithful decompiler, accept live drift by
updating the blueprint from reality instead of only pushing (`CLOUD_DRIFT_ARCHITECTURE.md`
§6 pull), because that is just import applied to a single changed resource.

---

## 12. Relationship to the rest of the system

- **Deployments** (companion doc) is the prerequisite: import produces a deployment,
  and only a per-deployment state key lets a discovered infra coexist with others in
  the account.
- **Drift** is import's twin: both run `terraform plan` in the runner and map
  addresses to nodes; drift interprets a diff as a problem, import's "first plan"
  interprets a diff as **infidelity to fix before adopting**.
- **The operational layer** (deployments doc §11): once imported, a resource is a
  deployment node, so health / cost / posture signals attach to it like any other.

> The decompiler is the one genuinely new engine here; everything else (in-account
> runner, per-deployment state, address→node map, review-then-apply) already exists.
> That is what makes import a large but bounded build rather than a new platform.
