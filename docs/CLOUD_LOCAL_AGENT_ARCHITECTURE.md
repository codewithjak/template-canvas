# Local Agent: from repo to live

> **Status:** Proposal / Design
> **Date:** 2026-07-08
> **Scope owner:** Junaid Khan
> **Part of:** `VISUAL_CLOUD_BUILDER_ARCHITECTURE.md` (the cloud pack runtime)
> **Companions:** `CLOUD_IMPORT_ARCHITECTURE.md` (repo-aware is import from code, not an
> account), `docs/CLOUD_BUILDER_DEPLOYMENTS_ARCHITECTURE.md` (a deploy becomes a deployment)
> **Companion memory:** `canvas-run-anything-vision`

---

## 0. Build status — what's implemented vs proposed (read this first)

This document describes the **target** architecture. A functional slice is built; the
security/consent/agentic model around it is **not yet**. Do not read §3/§4/§5/§10 as
current guarantees — they are the intended end state. This section is the source of truth
for what exists today.

### 0.1 Built (works today)

The **functional deploy pipeline is complete end to end** — a repo can become a running
app:

- **`mapdoc` CLI `analyze`** — scans a repo, produces the app understanding, and creates
  a reviewable cloud template on the canvas.
- **`mapdoc` CLI `deploy`** — three modes (`source` / `image` / `push`), the
  container/serverless/static deploy bridge, `--watch` continuous redeploy, and the
  short-lived scoped-credential path for local image push.
- **Deterministic repo scanning** (`backend/agent/repoScan.js`) and deterministic
  blueprint inference (`backend/agent/inferBlueprint.js`).
- Tarball secret-denylist + `.gitignore`/`.dockerignore` handling; source-download URL
  never persisted; cloud changes only via the deterministic runner + human approval.

### 0.2 Proposed (NOT built)

Three layers, described in §3/§4/§5/§10, do not exist yet:

| Area | Doc says | Reality today |
|---|---|---|
| **Auth** (§4) | OAuth device flow, `mapdoc login`, agent session | a long-lived, full-scope `tc_live` API key via `MAPDOC_API_KEY` (`X-API-Key`) |
| **Agentic review** (§5, "Level 2") | the AI drives read commands over your repo (tool-use loop) | a fixed **deterministic** scan of manifests/config — no LLM, no tool loop |
| **Consent/audit** (§3/§10) | per-command consent prompts, destructive deny-list, full audit log | none — the CLI runs a fixed, user-invoked set of operations |

### 0.3 Why these three are not built (deliberate, and in this order)

They form a **dependency stack**, and the functional pipeline was built on an MVP
substitute sitting on top of it:

1. **Agentic review (§5) is the ambition; deterministic scanning is the shipped
   substitute.** The deterministic path (`repoScan` + `inferBlueprint`) is reliable,
   testable, instant, and free, and it covers the common app shapes — so it proves
   "repo → infra" *now*. The agentic loop (LLM tool-calling over the repo) is a much
   larger build with real reliability, latency, and cost questions, and it is **not
   required** to make a repo become a live app. So it was deferred, not skipped.
2. **Consent / deny-list / audit (§3/§10) exists to guard the agentic loop — which
   doesn't exist yet.** Today the CLI runs a fixed, known set of operations that *the
   user* invoked (scan, tar, upload; or `docker`/`aws` in image mode). There are no
   AI-chosen commands to consent to, deny, or log. Building this machinery now would be
   guarding a threat that only appears once #1 lands.
3. **Device flow / agent session (§4) is an auth upgrade, not a functional
   dependency.** The API key already authenticates the CLI to the team, so the whole
   pipeline works without it. Device flow gives short-lived, per-device tokens and links
   the CLI to the browser session — a security/UX improvement, never on the critical
   path to proving the loop.

So the build order was: ship the functional pipeline (with API key + deterministic
scan), defer the trust/agentic stack until the agentic mode is actually wanted.

### 0.4 How the agent works TODAY (deterministic)

```
mapdoc analyze  →  repoScan.js reads package.json / requirements.txt / Dockerfile /
                   env KEY names  →  a fixed app-understanding object  →
                   inferBlueprint.js maps it to a lint-clean Blueprint (recipes) →
                   saved as a cloud template  →  user reviews on the canvas
```

It is a **pure function of the files present**: same repo in, same infra out. No LLM
call, no commands chosen at runtime, no exploration. Strength: deterministic, testable,
cheap, always lint-clean. Limit: it only recognizes the shapes the recipes encode
(container web / serverless / static + attached data services); anything unusual gets the
nearest recipe, and it can't reason about the code's actual behavior.

### 0.5 How it will work with AGENTIC mode (proposed)

```
mapdoc analyze  →  the AI runs a server-side tool-use loop; each step it REQUESTS a
                   read command (ls / grep / read-file / npm ls) that the LOCAL agent
                   executes only AFTER the user consents (deny-list blocks dangerous
                   ones; every call is audited)  →  the AI builds a richer understanding
                   from what it actually read  →  proposes/extends the Blueprint
                   (still catalog-constrained + lint-validated)  →  user reviews
```

The AI becomes a **proposer that can look**, instead of a fixed scanner. It reasons about
framework specifics, non-standard layouts, and edge cases the recipes miss, and can
answer "why this infra?" The deterministic recipes remain the **reliable baseline/few-shot
seed**; the agent handles the delta. The output is still a reviewed, lint-clean blueprint
compiled deterministically to Terraform — *LLM proposes, the deterministic engine
disposes* holds unchanged.

### 0.6 What full implementation solves (why it's worth building)

- **Coverage beyond the recipes.** Deterministic inference maps unusual apps to the
  nearest known shape; the agent can model what the app actually needs.
- **Explanation + advice.** "Why ECS not Lambda?", "you also need a queue here" — the
  deterministic path can't reason; the agent can (this is the co-pilot/advisor value).
- **Real security posture for an interactive agent.** Per-command consent + deny-list +
  audit turn "an AI that can run commands on your machine" from a scary idea into a
  safe, reviewable one — the prerequisite for trusting agentic mode at all.
- **Proper auth.** Short-lived, per-device, revocable tokens + a CLI↔canvas session
  replace a copy-pasted long-lived full-scope key — smaller blast radius, better UX.

Until then, the shipped deterministic MVP delivers the core promise (repo → reviewable
infra → deploy) without any of the agentic risk surface.

---

## 1. Goal

Close the loop a vibe coder actually cares about: **"I have a repo, make my app
live."** A local agent reviews the repo on the user's machine, the AI proposes the
right infrastructure on the canvas, the user applies it (deterministic runner), and
the **same agent builds and ships the app onto that infrastructure**. One tool spans
both halves that are missing today.

```
  mapdoc (local agent)                  Mapdoc AI + canvas             cloud account
  ───────────────────                   ──────────────────             ─────────────
  read repo (Level 2, consented)  →     understand app                 (untouched here)
  return understanding            →     propose blueprint (review)
                                        apply (deterministic runner) → infra created
  build + push + deploy the app   ────────────────────────────────→   app is live
```

---

## 2. The two gaps this closes

1. **The browser can't read your repo.** The builder is sandboxed and cannot see
   local files, so today the AI is blind to your code (it only classifies a typed
   sentence, see the current `llm/architect.js`). A local agent is the bridge.
2. **The builder stands up infra but not the workload.** We generate and apply the
   host (VPC/ALB/ECS/RDS...), but the app itself never lands on it (ECS
   `task_definition` is a placeholder; EC2 boots blank). Only inline Lambda runs end
   to end. The agent is where the workload deploy happens.

One local agent closes both, and the second half reuses the first (it already has
the code locally).

---

## 3. Trust boundary (read this first)

> **Note:** the boundaries below describe the target model. Per-command consent /
> gating is **proposed, not built** (§0.2) — today the CLI runs a fixed, user-invoked
> set of operations. The *upload* and *cloud-change* boundaries here ARE real today.

This is a **local dev-machine** capability, not cloud access. The boundaries:

- **The agent runs on the user's machine, outbound-only, user-started.** It is the
  coding-agent model (Claude Code / Cursor): local, user-started. NOT inbound SSH into
  their box (no open ports, no handing us credentials to their machine).
- **It touches only the local repo and build artifacts.** *(Target: read-scoped by
  default, every AI command shown and gated — proposed, §0.)* **What leaves the machine
  differs by action
  (see §10.1):** *analyze* sends only key NAMES, never secret values; *deploy* in
  source-upload mode uploads your source (minus secrets and `.gitignore`/denylisted
  files) to YOUR OWN account for the build; *deploy* in image mode uploads nothing
  but the built image. Credentials (`.env`, `.aws`, `.ssh`, `*.pem`) are always
  excluded from any upload.
- **It does NOT get raw shell in the cloud account.** All cloud *changes* still go
  through the deterministic runner + the near-powerless ConnectRole + human approval.
  The one cloud thing the agent does directly is push a build artifact with a
  **short-lived, narrowly-scoped** credential (ECR push only), minted per deploy.
- **The AI proposes, it never applies.** The blueprint is a reviewed proposal; the
  deterministic compiler + approval gate apply. Straight from `canvas-run-anything-vision`.

So the blast radius is the user's own laptop (their choice) plus a scoped artifact
push, never an open-ended agent in production and never our servers holding their
source or secrets.

---

## 4. The local agent (`mapdoc` CLI)

> **Status: partially built.** The CLI and its transport exist; the **auth model below
> (device flow / `mapdoc login` / agent session) is PROPOSED** — today it's a long-lived
> `tc_live` API key via `MAPDOC_API_KEY`. See §0.

- **Transport:** outbound HTTPS/websocket to Mapdoc. No inbound listener.
- **Auth:** OAuth device flow — `mapdoc login` links the CLI to the user's **Mapdoc
  account** (this is the "connect the Mapdoc user account" channel). The browser
  canvas and the CLI are then two clients of the same account; the backend links them
  into one **agent session**.
- **Capabilities (tiered by permission):**
  - *read:* list files, read files, grep, detect manifests — the default.
  - *inspect:* run bounded, read-only commands (`npm ls`, `git remote -v`) with a
    per-command prompt and a destructive-command deny-list.
  - *build/deploy:* build an image/bundle, push to ECR, trigger the ECS/Lambda/S3
    update (Phase 2+), each explicitly authorized.
- **The AI drives it as a tool.** Server-side, the AI runs a tool-use loop; each tool
  call is executed *locally* by the agent (with permission) and the result returns to
  the AI. The AI never sees the machine directly, only tool results the user allowed.

---

## 5. Level 2: agentic repo review

> **Status: PROPOSED — not built.** Today `analyze` runs a **deterministic** scan
> (`repoScan.js`), not an AI tool-use loop. This section is the intended upgrade; see
> §0.4 (how it works now) and §0.5 (how agentic will work).

The AI explores the codebase like a developer would, to build an **app understanding**:

- Signals it gathers: language/runtime (`package.json`/`requirements.txt`/`go.mod`),
  framework (Next.js/Express/Django/Rails), containerization (`Dockerfile`), exposed
  ports, build + start commands, and external-service needs from config/imports
  (`DATABASE_URL` → a DB, `REDIS_URL` → cache, S3 SDK usage → a bucket, a queue client
  → SQS).
- Output: a compact, **sanitized** app-understanding object (runtime, framework,
  ports, `buildCommand`, `startCommand`, `dockerfile?`, `services[]`). Full source and
  secrets stay local; only this derived profile leaves.
- Permission model: read-only by default, each command surfaced, secrets redacted,
  auditable. This is the "shell/terminal session" the user pictured, scoped safely.

---

## 6. Repo → blueprint (infra generation)

The app understanding feeds the co-pilot's **catalog-constrained, lint-validated**
generation (the shared foundation: catalog as vocabulary, current canvas as context,
lint as the guardrail with a repair loop). It infers infra and draws it for review:

| Repo signal | Inferred infra |
|---|---|
| Web framework + exposed port, containerized | ALB + ECS/Fargate (+ ECR) |
| Single handler / event-shaped | API Gateway + Lambda |
| Postgres/MySQL dependency | RDS (private) + SG wiring |
| Redis dependency | ElastiCache (future node) |
| S3 SDK usage | S3 bucket + IAM policy |
| Static frontend build output | S3 + CloudFront |

Compute choice (container → ECS, handler → Lambda, VM → EC2) is the AI's proposal; the
user adjusts on the canvas. Still a proposal, still deterministic-compiled to Terraform,
still human-approved before apply.

> **Relation to import:** this is `CLOUD_IMPORT_ARCHITECTURE.md` run from *code* instead
> of a *live account* — infer the model from what the app needs rather than from what
> already exists. Same "propose a reviewable blueprint" shape.

---

## 7. The workload-deploy bridge

Deploy happens only **after** the infra is reviewed and applied, and it is always an
**explicit, user-triggered** action, never automatic. Once the infra is on the canvas
and applied, the CLI asks the user *where to deploy from*. This is the key design
point: the deploy **target is a user choice**, which is what makes a local deploy
legitimate (explicit consent, on the user's own machine, for their own account).

**The prompt: pick a deploy target.**

- **Path 2 — via the cloud runner (default, purest).** Source is staged to the user's
  own account (a Mapdoc-issued **presigned upload URL** — a one-shot link, not a
  credential the CLI holds), the in-account runner (CodeBuild) builds the image, pushes
  to ECR, and rolls ECS. Nothing cloud-facing runs on the local machine, no credential
  is minted, source never transits Mapdoc. Needs no local Docker. Slower (cold build,
  build minutes), but it "just works" and keeps the CLI credential-free. **This is the
  default.** *Only the opaque S3 key is persisted (in `cloud_runs`); the source
  **download** URL is never stored — it is minted fresh, short-lived, at build time, so a
  leaked DB row can't fetch the tarball.*
- **Path 1 — deploy from here (opt-in, fast).** The CLI builds the image locally (the
  user's Docker + source), then pushes to ECR + rolls ECS using a **short-lived
  credential Mapdoc mints on demand, scoped to exactly this repo + service**, expiring
  in minutes. Legitimate only because the user explicitly chose this path; the
  credential goes to the user's own agent acting on the user's own account (the same
  thing `aws ecr get-login` does). Fast dev loop; needs local Docker.

By compute type, "deploy" means:
- **Container (ECS/Fargate):** build image → push to the ECR repo the canvas created →
  update the ECS task definition → roll the service.
- **Serverless (Lambda):** package the code (or use the inline handler) → update the function.
- **Static (S3 + CloudFront):** build → sync output to the bucket → invalidate the distribution.

In every path the infra it deploys onto was applied deterministically, and the deploy
is an action the user explicitly triggered and chose the mode for. The AI never deploys.

**Defaults + build order:** ship **Path 2 (runner)** first — it needs nothing special
on the CLI (no Docker, no minted credential). Add **Path 1 (from here)** later, since it
brings the "Mapdoc mints scoped deploy credentials" backend piece + a small deploy-role
in the connect stack. Optionally remember the user's choice as a per-project preference.

New infra this needs: an **`aws_ecr_repository`** node (so a container app has a registry
to push to), with a `uses_image` edge from the ECS service the deploy path reads.

---

## 8. How the pieces connect

```
mapdoc CLI ──(device-auth)── Mapdoc account ──┬── browser canvas (same account)
    │                                          │
    │  tool results / app understanding        │  proposed blueprint, review, apply
    ▼                                          ▼
 Mapdoc AI (tool-use loop) ───────────► deterministic runner ──► customer AWS account
                                          (ConnectRole, unchanged; app deploy via
                                           scoped short-lived push or in-account build)
```

The agent session links the CLI and the canvas through the backend; the AI orchestrates;
the cloud is only ever touched by the runner and one scoped deploy credential.

---

## 9. What's new vs reused

- **New:** the `mapdoc` CLI (local agent), an agent-session concept in the backend, an
  AI tool-use loop that can call agent tools, the app-understanding artifact, the deploy
  actions, and an `aws_ecr_repository` node.
- **Reused:** the catalog / compiler / lint (blueprint generation + validation), the
  deployment model (a deploy becomes a `cloud_deployments` row), the runner + ConnectRole
  (cloud changes), and the shared Claude client (`pdfImport/ai.js`, already the
  structured-output muscle behind the architect).

---

## 10. Security posture (consolidated)

**Real today:**
- Local, outbound-only, user-started; no inbound SSH, no open ports.
- The CLI runs a **fixed, user-invoked** set of operations (scan, tar, upload; or
  `docker`/`aws` in image mode) — no AI-chosen commands.
- No raw cloud shell. Cloud changes = deterministic runner + human approval, OR (for a
  CLI "deploy from here") a short-lived credential scoped by an inline session policy to
  exactly one ECR repo push + one ECS service update.
- Secrets excluded from uploads; source-download URL never persisted (§10.1).

**Proposed (NOT built — needed once the agentic loop of §5 exists):** per-command consent
prompts, a destructive-command deny-list, and a full audit log. These guard *AI-chosen*
commands, of which there are none today (§0.2–0.3).
- LLM proposes only; deterministic compiler + approval gate apply.

### 10.1 What leaves the machine, by action (be precise)

The earlier drafts overclaimed "source never leaves the machine" — true for *analyze*,
NOT for source-upload *deploy*. The honest, per-action statement:

| Action | What leaves the machine | Where it goes |
|---|---|---|
| **analyze** | the sanitized app understanding (key NAMES only, never values) | Mapdoc |
| **deploy `--mode source`** | your **source** (minus secrets + `.gitignore`/denylist) | YOUR OWN account bucket (never Mapdoc) — the in-account runner builds it |
| **deploy `--mode image`** | only the **built container image** | your ECR (source stays local) |
| **deploy `--mode push`** | only an **existing image** you already built | your ECR (source stays local) |

- **Nothing sensitive ever transits Mapdoc's servers.** Analyze sends a derived profile;
  deploy source/images go straight to the user's own AWS account.
- **The credential denylist is always applied** to the source tarball (`.env*`, `.aws`,
  `.ssh`, `*.pem`, `*.key`, `*.tfstate`, `.npmrc`, …) plus the repo's `.gitignore`, so
  secrets aren't shipped even in source-upload mode. Image modes avoid the question
  entirely (source never leaves).
- **Recommendation for secret-sensitive users:** use `--mode image` (or `--mode push`) —
  source stays on the machine and only the built artifact reaches your registry.

---

## 11. Phasing

**Phase 1 — repo → infra.** `mapdoc` CLI → app understanding → catalog-constrained
blueprint on the canvas (review). Proves "point at my repo, get reviewable infra."
*Shipped as a **deterministic** scan with API-key auth (not the device-flow/agentic
form above); those are follow-on upgrades — see §0.*

**Phase 2 — deploy: containers.** `aws_ecr_repository` node; agent builds locally, scoped
push to ECR, ECS task-definition update + roll. The first true "app → live" path.

**Phase 3 — deploy: serverless + static.** Lambda package/update; S3 sync + CloudFront
invalidation. Covers the common vibe-coder shapes.

**Phase 4 — continuous.** Watch the repo, redeploy on change; surface deploy status next
to drift/health on the canvas (the operational layer).

---

## 12. Relationship to the rest of the system

- **The workload boundary** (Lambda inline works, ECS/EC2 don't): this is what finally
  closes it, for any compute, via the agent.
- **The co-pilot modes** (advisor / generative chatbot): this is the repo-aware mode +
  deploy, on the same catalog-constrained, propose-not-apply foundation.
- **Deployments / drift / health:** a deployed app is a deployment, so drift and the
  planned health signal cover it like anything else built on the canvas.

> The design principle holds throughout: the agent and the AI are **proposers and
> couriers** — they read your repo, suggest infra, and carry your build — while the
> deterministic compiler, the in-account runner, and your approval remain the only
> things that change your cloud. That is what makes "repo to live" trustworthy on a real
> account.
