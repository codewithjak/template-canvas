# Cloud Builder Trust Models: Minimizing Mapdoc Involvement

> **Status:** Proposal / Design
> **Date:** 2026-06-30
> **Scope owner:** Junaid Khan
> **Part of:** `VISUAL_CLOUD_BUILDER_ARCHITECTURE.md` (the cloud pack runtime and its trust posture)
> **Companion memory:** `canvas-run-anything-vision`

---

## 1. Goal

Define how the interaction between Mapdoc and a customer's cloud account can be
**minimized**, so the product is more secure and less dependent on Mapdoc. The
question this doc answers: for a given level of convenience, what is the least
Mapdoc has to **hold**, **do**, and **know** about a customer's account?

The output is a spectrum of strategies, all driven by the same blueprint and the
same deterministic compiler, differing only in **where execution runs** and **how
much Mapdoc is in the loop**. They share one runner interface, so a customer can
pick a posture without changing the design experience.

---

## 2. Threat model: what we are minimizing against

We are not only defending against an external attacker. The stronger requirement
is to shrink what a **compromised or malicious Mapdoc** could do, so a customer's
trust does not rest on "Mapdoc is well behaved."

Concretely, a security-conscious customer asks:

- If Mapdoc is breached, what can the attacker do in **my** account?
- Does Mapdoc ever **hold my credentials**?
- Can Mapdoc **act in my account** without my involvement?
- Does Mapdoc **know** about my account, my state, my secrets?
- Can I **revoke** it instantly and verify what it did?

Minimizing involvement means driving each of those toward "nothing" or "only what
I approved."

---

## 3. The five trust dimensions

Every strategy below is measured on the same five axes. "More secure and less
dependent" means reducing each one.

| Dimension | Question | Minimized state |
|---|---|---|
| **Holds** | Does Mapdoc hold any credentials? | Holds nothing, or only a short-lived ability to start a fixed job |
| **Can do** | What can Mapdoc do in the account? | Trigger a fixed, scoped pipeline, or nothing |
| **Knows** | What does Mapdoc know (account id, state, outputs, secrets)? | Only the design; state and secrets stay in-account |
| **Runs where** | Where does Terraform execute? | Inside the customer's account or infrastructure, never on Mapdoc |
| **Who triggers** | Who initiates a run? | The customer (pull), not Mapdoc (push) |

> A run already executes inside the customer's account today (the **Runs where**
> axis is solved). The work of this doc is reducing **Holds**, **Can do**,
> **Knows**, and **Who triggers**.

---

## 4. The strategies

Ordered from most Mapdoc involvement to least. All share the blueprint and the
deterministic `graph -> Terraform` compiler. They differ in the **runner**.

### S0. System-mediated push (current baseline)

Mapdoc assumes the Connect role, holds short-lived credentials, calls CodeBuild
`StartBuild` **with a buildspec it supplies**, polls, and reads results. Terraform
runs in an ephemeral CodeBuild sandbox in the customer's account.

| Dimension | Value |
|---|---|
| Holds | Short-lived assumed credentials (minted on demand) |
| Can do | Trigger the runner **and dictate the buildspec** (so effectively run arbitrary commands as the RunnerRole) |
| Knows | Account id, region, state location, outputs |
| Runs where | Customer's CodeBuild sandbox |
| Who triggers | Mapdoc (push) |

**Weak points:** Mapdoc dictates what the worker runs, and the RunnerRole defaults
to broad (PowerUserAccess). Convenient, but not the strongest posture.

### S1. System-mediated, hardened (recommended default)

Same trigger model as S0, but locked down:

- **Fixed buildspec**, defined in the customer's stack, **not overridable**. Mapdoc
  cannot inject commands.
- **Design-derived least-privilege policy** per blueprint (see §5.1), enforced as a
  session policy. The runner can only create what the design declares. Drop the
  PowerUserAccess default.
- **Mandatory human approval** for apply. Plan is read-only.

| Dimension | Value |
|---|---|
| Holds | Short-lived credentials that can **only start a fixed pipeline** |
| Can do | Trigger a fixed, scoped, human-gated pipeline. Cannot inject commands or exceed the derived policy |
| Knows | Account id and outputs (reducible further in S-cross-cutting) |
| Runs where | Customer's CodeBuild sandbox |
| Who triggers | Mapdoc (push) |

**Worst case for a compromised Mapdoc:** it can get a **human-approved,
narrowly-scoped plan** applied. No arbitrary commands, no broad access.

### S2. Pull-based in-account agent

The customer runs a small **worker inside their own account** that **pulls**
approved blueprints from Mapdoc and runs Terraform locally. Mapdoc assumes nothing
and holds nothing.

| Dimension | Value |
|---|---|
| Holds | **Nothing** (no assumable execution role, no credentials) |
| Can do | **Nothing** directly in the account. It only serves blueprints the agent pulls |
| Knows | The design, plus whatever the agent chooses to report back (can be near-zero) |
| Runs where | The customer's agent, in their account |
| Who triggers | The customer's agent (pull or event-driven) |

This is how Spacelift and Terraform Cloud "agents" work. **Mapdoc cannot reach into
the account at all.**

**Tradeoff:** the customer runs and maintains the agent, and Mapdoc cannot push a
run (the agent polls or reacts to an event). Slightly more setup, dramatically less
trust required.

### S3. GitOps / bring-your-own-pipeline

Mapdoc emits Terraform into the customer's **own Git repository** (opens a pull
request). The customer's existing CI/CD, with their credentials, their reviews, and
their policy checks, plans and applies. Mapdoc never connects to the cloud account.

| Dimension | Value |
|---|---|
| Holds | Nothing in the cloud account (at most a repo-scoped Git token, or the customer pulls) |
| Can do | Open a PR with generated code. Nothing in the cloud |
| Knows | Nothing about the account; only the repo |
| Runs where | The customer's existing CI/CD |
| Who triggers | The customer's pipeline (on merge) |

Fits teams with mature IaC governance: code review, CI policy (OPA / Sentinel),
existing approval flows.

**Tradeoff:** requires the customer to have a Terraform CI workflow. Mapdoc loses
one-click apply and live outcome reflection; it becomes a code generator plus PR
opener.

### S4. Export-only / fully offline

Mapdoc generates Terraform; the customer downloads it and runs it themselves,
entirely outside Mapdoc. No connection of any kind.

| Dimension | Value |
|---|---|
| Holds | Nothing |
| Can do | Nothing in the account |
| Knows | Nothing |
| Runs where | Wherever the customer runs Terraform |
| Who triggers | The customer, manually |

Maximal assurance: Mapdoc is air-gapped from the account. This is the **no-lock-in
floor** that the open Terraform output guarantees is always available.

---

## 5. Cross-cutting hardening (applies across S0 to S2)

These reduce the dimensions regardless of which mediated strategy is in use.

### 5.1 Design-derived least-privilege policy

Permissions are generated from the blueprint, like the Terraform is. Each catalog
node declares its required IAM actions; the policy for a run is the **union of the
actions of the nodes used**, and nothing more. This scales with the catalog by
construction: adding a Lambda node adds its permission set, included only when a
blueprint uses it. No admin, no hand-maintained static policy, never over-broad.

### 5.2 Locked pipeline, no code injection

The runner's buildspec is fixed in the customer's account and not overridable. The
worker **pulls** the approved blueprint instead of Mapdoc handing it commands. This
turns Mapdoc's role from "trigger and dictate" into "trigger only."

### 5.3 Plan-only / read-only mode

A runner identity that can `terraform plan` (read) but never `apply` (write), so a
customer can evaluate with zero write risk before granting apply.

### 5.4 Mandatory human approval gate

`apply` requires a person to approve the exact plan diff. Nothing irreversible
happens automatically. This is the brake that bounds even an over-scoped role.

### 5.5 Minimal, pinned, revocable trust

Short assume-role session (for example 15 minutes), `ExternalId` and account-pinned
trust, instant revocation by deleting the role or rotating the ExternalId. No
standing access between runs.

### 5.6 State and outputs stay in-account

Terraform state in the customer's S3, outputs captured in their account. Mapdoc only
sees what the worker chooses to report, or nothing.

### 5.7 Open output and auditability

The output is plain Terraform, so the customer can always self-host and verify, and
is never locked in. Every action appears in their own CloudTrail, by their own
roles, and the template, HCL, and plan are reviewable before apply.

---

## 6. Comparison

| | Holds creds | Can act in account | Knows account | Runs where | Triggers | Customer effort | Convenience |
|---|---|---|---|---|---|---|---|
| **S0** current | short-lived | trigger + dictate | yes | their sandbox | Mapdoc | low | highest |
| **S1** hardened | short-lived (start only) | trigger fixed pipeline | yes | their sandbox | Mapdoc | low | high |
| **S2** agent | none | none | minimal | their agent | customer | medium | medium |
| **S3** GitOps | none (repo token) | none | none | their CI/CD | customer | medium | medium |
| **S4** export | none | none | none | anywhere | customer | high (manual) | low |

---

## 7. The one irreducible dependency

The single thing that cannot move out of Mapdoc is that **Mapdoc produces the
design** (the blueprint and the HCL). If it makes the design, it shapes "what to
build." But that dependency is bounded on every side:

- **Least-privilege scoping** limits what the design can touch (§5.1).
- **The human gate** limits what gets applied (§5.4).
- **Open Terraform output** means the customer can run and verify it independently
  (§5.7), and replace Mapdoc's runner entirely (S3, S4).

So even the irreducible dependency is reviewable and replaceable.

---

## 8. Recommendation and sequencing

Support a **spectrum**, not a single posture. One compiler, multiple runner
adapters behind the existing `RunnerAdapter` interface, selectable per connection:

- **Default: S1** (system-mediated, hardened). Easy onboarding, strong posture.
- **Offer: S2** (in-account agent) for security-conscious or regulated customers who
  require that Mapdoc cannot know or touch their account.
- **Offer: S3** (GitOps) for teams with mature IaC pipelines.
- **Always available: S4** (export) as the no-lock-in floor.

Build bottom-up, because each rung stands on the one below:

1. **Least-privilege deriver** (§5.1). Pure, testable, and everything scoped depends
   on it.
2. **Lock the pipeline** (§5.2), turning S0 into S1.
3. **In-account state and minimal window** (§5.5, §5.6).
4. **Agent runner adapter** (S2), a third `RunnerAdapter` alongside CodeBuild and
   local-simulate.
5. **GitOps emitter** (S3), the Terraform-to-PR path.

> The design experience never changes across these. The customer draws the same
> blueprint and reviews the same plan. Only the runner location and the amount of
> trust placed in Mapdoc differ.
