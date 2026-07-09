# Drift Detection: security gaps the architecture doc omits

> **Status:** Review finding / must-address before continuous drift ships broadly
> **Date:** 2026-07-10
> **Reviews:** `src/builder/connect/CLOUD_DRIFT_ARCHITECTURE.md` (the drift design)
> **Against:** `CLOUD_BUILDER_TRUST_ARCHITECTURE.md` (the trust posture it inherits)
> **Code in scope:** `backend/cloud/driftWorker.js`, `backend/cloud/runner.js`,
> `backend/cloud/sts.js`, `backend/cloud/bootstrapTemplate.js`,
> `backend/cloud/connections.js`, `backend/routes/cloudDrift.js`

---

## 0. Why this doc exists

`CLOUD_DRIFT_ARCHITECTURE.md` is a clean functional design, but it is written as a
*reuse* story ("everything except the interpretation is already built"). That framing
hides the fact that drift, and especially the Phase 2 continuous worker, quietly changes
the **security posture** the trust doc promises. Every gap below is something the drift
doc does not say and should. Each is anchored to the drift-doc section that omits it and
to the code that makes it real.

The single sentence version: **the drift worker runs customer Terraform under
`PowerUserAccess`, unattended, across every tenant, with no human-approval gate, and the
design doc calls this "read-only reuse."**

---

## 1. The trust chain as actually built (the drift doc shows none of this)

The drift doc's §4 flow says "assume Connect role, StartBuild the runner (as today)" and
stops. The real chain has three roles and one override that together define the blast
radius. None appear in the drift doc.

### 1.1 The three roles (`bootstrapTemplate.js`, mirrors `infra/connect-account/stack.yaml`)

| Role | Assumed by | Trust condition | Effective permission |
|---|---|---|---|
| **ConnectRole** (`:118`) | Mapdoc backend, via `assumeConnectRole` (`sts.js:85`) | `${PlatformAccountId}:root` + `ExternalId` | **Narrow** inline policy: `codebuild:StartBuild/BatchGetBuilds/StopBuild` on the one RunnerProject, `iam:PassRole` on RunnerRole, `s3:Get/List` on state, `logs:*` |
| **RunnerRole** (`:74`) | `codebuild.amazonaws.com` only | service principal | `ManagedPolicyArns = RunnerPolicyArn`, **default `arn:aws:iam::aws:policy/PowerUserAccess`** (`:32`) |
| **DeployRole** (`:157`) | Mapdoc backend, via `assumeScopedRole` | `root` + `ExternalId` | Scoped ECR/ECS, **further narrowed by an inline session policy** at assume time. Not in scope here; this one is done right. |

### 1.2 The override that collapses the narrow ConnectRole into PowerUser

The RunnerProject ships a **placeholder** buildspec (`bootstrapTemplate.js:112`:
*"Buildspec is supplied at StartBuild time by Mapdoc"*). The runner supplies the real one
at launch via **`buildspecOverride: spec`** (`runner.js:117`), plus env vars including the
base64 HCL (`runner.js:118-124`).

Therefore the effective privilege of anyone holding 900s ConnectRole creds is:

```
StartBuild(RunnerProject, buildspecOverride = <arbitrary shell>)
   -> CodeBuild executes those commands AS RunnerRole
   -> RunnerRole = PowerUserAccess, with iam:PassRole already granted
```

The narrow ConnectRole is a paper wall. `StartBuild + buildspecOverride +
PassRole(RunnerRole)` reaches straight through it to the PowerUser role behind it. This is
the trust doc's own **S0 weak point** (`CLOUD_BUILDER_TRUST_ARCHITECTURE.md:82`), not the
**S1 hardened posture** it recommends (`:87-89`: *"Fixed buildspec... not overridable.
Mapdoc cannot inject commands."*). As built, Mapdoc **can** inject commands. The drift doc
never mentions which posture it runs under.

---

## 2. Each step the drift doc misses

Below, "Doc says" quotes `CLOUD_DRIFT_ARCHITECTURE.md`; "Reality" is the code; "Missing
step" is what the doc must add.

### Gap A. Drift `plan` is not read-only in the security sense

- **Doc says (§2, §3.2, lines 33-77):** "a diff is a problem," "plan interpreted as a
  health signal." Framed as passive observation.
- **Reality:** the buildspec base64-decodes stored `applied.hcl` into `main.tf` and runs
  `terraform init` + `terraform plan -refresh-only` (`runner.js:64-87`,
  `driftBuildspec`). `init` fetches and executes **provider plugins and module sources**
  referenced by the HCL; `plan`/refresh evaluates **`external` data sources** and provider
  config. All of it runs as **RunnerRole = PowerUserAccess**. The worker comment even
  asserts the opposite (`driftWorker.js:128`: *"drift is read-only, so an abandoned build
  is harmless"*).
- **Missing step:** state that drift executes code (providers/modules/external data
  sources) under a write-capable role, and that a malicious or compromised `applied.hcl`
  row is a code-execution vector on the next check.

### Gap B. Continuous drift removes the human-approval gate, silently

- **Doc says (§6, lines 114-121):** approval is described only for "Apply to fix"
  ("reuses the existing approve-and-apply path"). **Doc says (§7, lines 126-132):** the
  Phase 2 worker "runs drift checks for each verified connection... Durable, survives
  restarts, like the existing retry worker." Presented as pure operations.
- **Reality:** the whole trust model leans on **mandatory human approval**
  (`CLOUD_BUILDER_TRUST_ARCHITECTURE.md:94`, §5.4: *"Nothing irreversible happens
  automatically. This is the brake."*). That brake guards `apply` only. The drift worker
  runs `plan` (which, per Gap A, executes code) **with no user present and no approval**,
  on a timer (`driftWorker.js:186-205`, wired at `index.js:585`).
- **Missing step:** state explicitly that continuous drift is **ungated**, that the
  approval brake does not cover it, and therefore that the drift path must be independently
  constrained (see Gap C).

### Gap C. Drift runs under the full Connect->PowerUser path, not a read-only role

- **Doc says:** nothing. The doc never names the role drift assumes.
- **Reality:** `runDrift -> runBuild -> assumeConnectRole` (`runner.js`, `sts.js:85`) with
  **no session policy**, unlike deploy which uses `assumeScopedRole` + inline session
  policy (`sts.js:94`). So a pure read (health check) carries the write-capable PowerUser
  ceiling.
- **Missing step:** the trust doc already offers a **plan-only / read-only role**
  (`CLOUD_BUILDER_TRUST_ARCHITECTURE.md:5.3`). The drift doc should mandate that drift runs
  under that role (or a restrictive session policy), never the full Connect path. This is
  the single highest-leverage fix.

### Gap D. "No standing access between runs" becomes standing, automated, cross-tenant

- **Doc says (§7):** the worker checks "each verified connection," "survives restarts."
- **Reality:** the trust doc promises **no standing access between runs**
  (`CLOUD_BUILDER_TRUST_ARCHITECTURE.md:5.5`, user-paced, revocable). The worker uses
  **admin/service-role DB scope** (`getAdmin()`, `driftWorker.js:195`) and each sweep loads
  **every verified connection across every tenant**, including `role_arn` and
  `external_id` (`fetchVerifiedConnections`, `driftWorker.js:53-64`), then assumes into each
  account. This converts user-initiated access into a built-in, always-warm, cross-tenant
  assumption engine. A compromised backend no longer waits for a user; the worker is a
  pre-wired lateral-movement path into every connected account.
- **Missing step:** name the posture change from "user-paced, no standing access" to
  "platform-paced, standing capability across all tenants," and state the compensating
  control (scoped role from Gap C, per-tenant opt-in from Gap F).

### Gap E. `external_id` is a plaintext, all-tenants-in-one-process secret

- **Doc says:** nothing about secret storage.
- **Reality:** `external_id` is stored plaintext (`connections.js:18`, `randomUUID()`, no
  app-layer encryption). Combined with Mapdoc's own IAM principal it is one of the two
  halves of AssumeRole. The worker loads **every tenant's** `role_arn` + `external_id` into
  one process on every sweep (`driftWorker.js:57`). A single DB-read leak yields one half of
  the key for every account at once, and the worker maximizes rather than minimizes that
  exposure window.
- **Missing step:** call out at-rest handling of `external_id`, and that the sweep's
  admin-scope read aggregates all tenants' assume-role secrets into memory regularly.

### Gap F. Continuous checks have no customer consent or opt-out, and spend customer money

- **Doc says (§7):** "a periodic worker" with a cadence.
- **Reality:** each check is a **CodeBuild run + Describe/List calls in the customer's
  account**, billed to the customer. Cadence is Mapdoc-side env only
  (`DRIFT_CHECK_INTERVAL_MS`, `DRIFT_CHECK_BATCH`, `driftWorker.js:32-35`). There is no
  per-deployment opt-in/opt-out: connect once and every active deployment is enrolled in
  perpetual, cost-incurring, role-assuming checks. The only switch is the global
  `DRIFT_WORKER_ENABLED` (`driftWorker.js:188`), which is not the customer's.
- **Missing step:** require **explicit per-deployment opt-in** to continuous drift, and a
  customer-visible cadence/disable control. State that continuous drift spends customer
  budget.

### Gap G. Drift quietly widens what Mapdoc retains (the "we hold nothing" drift)

- **Doc says (§7, line 131):** "notifies on new drift (reuse the existing webhook/email
  machinery)." **Doc says (§10):** "a drift check stores its parsed diff in `plan`."
- **Reality (good part):** the parser keeps only `address / type / name / action`
  (`planParser.js:34-43`); raw plan JSON (which can carry attribute values, IPs, secrets)
  is uploaded to the **customer's own** state bucket, fetched transiently, parsed in memory,
  discarded. So `CLOUD_BUILDER_TRUST_ARCHITECTURE.md:5.6` mostly holds.
- **Reality (the drift):** the continuous worker persists a **timestamped inventory of every
  customer's live resource addresses, every 6h, forever** in `cloud_runs` (kind=`drift`,
  `driftWorker.js:132-135`). Resource addresses (`aws_db_instance.prod_customers`,
  `aws_secretsmanager_secret.stripe_key`) are themselves sensitive architectural
  intelligence. The webhook payload ships those addresses out too (`driftWorker.js:142-153`).
  The trust doc says "Mapdoc only sees what the worker chooses to report, or nothing"
  (`:5.6`); the worker now durably accumulates the customer's live topology on a schedule
  they did not initiate.
- **Missing step:** acknowledge that continuous drift changes retention from "a plan the
  user asked for" to "a durable, cross-tenant, timestamped map of live infrastructure," and
  decide the retention/TTL policy for `kind=drift` rows.

### Gap H. Buildspec injection is the real ceiling, and the doc implies a fixed pipeline

- **Doc says (§4):** "StartBuild the runner (as today)."
- **Reality:** §1.2 above. The project buildspec is a placeholder; Mapdoc supplies the whole
  buildspec via `buildspecOverride` (`runner.js:117`). Anyone with ConnectRole creds runs
  arbitrary commands as PowerUser, no Terraform required. The drift worker exercises this
  path unattended for all tenants.
- **Missing step:** state that the buildspec is Mapdoc-injected (S0), not customer-fixed
  (S1), and that closing this is a precondition for calling the runner "hardened."

### Gap I. Single-instance assumption collides with the customer's own state lock

- **Doc says (§7):** "Durable, survives restarts, like the existing retry worker."
- **Reality:** the worker is single-instance with no cross-instance claim
  (`driftWorker.js:20, 192`, `workerBusy` guards one process only). Run two backend
  instances and two sweeps assume into the same account and run `terraform init` against the
  **same S3 backend + DynamoDB lock** the customer's own applies use. Automated drift can
  contend with, or block, a human apply on the customer's lock table.
- **Missing step:** state the single-instance requirement as a **correctness constraint for
  the customer's state**, not just an internal caveat, and require a claim (`FOR UPDATE SKIP
  LOCKED`) before any multi-instance rollout.

---

## 3. Who is affected, and how (threat scenarios)

1. **Customer AWS account, code execution (highest severity).** A compromised Mapdoc
   backend, a malicious insider, or any authz/SQLi bug that can write `cloud_runs.hcl` or
   call `StartBuild` gains **arbitrary command execution as PowerUserAccess** in every
   connected account, unattended, via `buildspecOverride` (Gap H) or a malicious module in
   `applied.hcl` executed on the next sweep (Gap A). The approval brake does not apply
   (Gap B). Live today.
2. **Customer bill and consent.** Perpetual CodeBuild runs and API storms billed to the
   customer, on a cadence they cannot see or stop (Gap F).
3. **Customer Terraform state.** Automated drift can race or block a human apply on the
   customer's own S3/DynamoDB lock under multi-instance (Gap I).
4. **Customer architecture privacy.** A durable, cross-tenant topology inventory accrues in
   Mapdoc, and addresses egress via webhooks, against the "we hold nothing" posture (Gap G).
5. **Assume-role secret exposure.** Plaintext `external_id` for all tenants pulled into one
   process each sweep (Gap E).

---

## 4. Remediation (phased)

**P0 (before continuous drift runs for real customers):**
1. **Scope the drift role.** Run drift under a `terraform plan`-only / read-only role
   (`CLOUD_BUILDER_TRUST_ARCHITECTURE.md:5.3`) or a restrictive inline session policy, via
   the `assumeScopedRole` path, never the full Connect->PowerUser path (Gap C).
2. **Correct the "read-only" claim** in the drift doc and in `driftWorker.js:128`; treat
   `applied.hcl` as untrusted input to Terraform (Gap A).
3. **Per-deployment opt-in** for continuous drift, plus a customer-visible cadence/disable
   control; state that checks spend customer budget (Gap F).

**P1 (hardening the runner, benefits all run kinds):**
4. **Bake the plan/apply/drift buildspecs into the RunnerProject** (or separate projects)
   and drop `buildspecOverride`; pass only env vars. This implements S1 and removes the
   command-injection ceiling (Gap H, `bootstrapTemplate.js:112`, `runner.js:117`).
5. **Pin/allowlist provider and module sources**, disallow `external` data sources for the
   drift path, ideally against a vendored provider mirror (Gap A).
6. **Drop the `PowerUserAccess` default** for `RunnerPolicyArn`, or split a read-only
   managed policy for the drift/plan runner (Gap C, `bootstrapTemplate.js:32`).

**P2 (data and multi-instance):**
7. **Encrypt `external_id` at rest**; narrow the sweep's admin-scope read (Gap E).
8. **Retention/TTL policy** for `kind=drift` rows; decide what topology history Mapdoc keeps
   (Gap G).
9. **Cross-instance claim** (`FOR UPDATE SKIP LOCKED`) before any multi-instance rollout
   (Gap I).

---

## 5. One-line summary per gap

| Gap | The step the drift doc misses |
|---|---|
| A | drift `plan` executes code (providers/modules/external) under a write-capable role |
| B | continuous drift is ungated; the human-approval brake does not cover it |
| C | drift uses the full Connect->PowerUser path, not the available read-only role |
| D | "no standing access" becomes standing, automated, cross-tenant assumption |
| E | plaintext `external_id` for all tenants aggregated into one process each sweep |
| F | no customer consent/opt-out; continuous checks spend customer money |
| G | durable cross-tenant topology inventory drifts from "we hold nothing" |
| H | Mapdoc injects the buildspec (S0), so it can run arbitrary commands as PowerUser |
| I | single-instance is a correctness constraint for the customer's state lock |

> The drift doc's premise ("reuse what exists") is true for the mechanics and false for the
> posture. Reusing the plan runner unattended, for all tenants, on a timer, is a different
> security object than a user clicking "plan" once. This doc is the missing half.
