# Agentic Repo Review: the AI that can look

> **Status:** Proposal / Design
> **Date:** 2026-07-10
> **Scope owner:** Junaid Khan
> **Part of:** `CLOUD_LOCAL_AGENT_ARCHITECTURE.md` (§5 "Level 2", §0.5 — this expands them)
> **Companions:** `VISUAL_CLOUD_BUILDER_ARCHITECTURE.md` (catalog / compiler / lint),
> `CLOUD_BUILDER_TRUST_ARCHITECTURE.md` (the trust boundary this extends)
> **Companion memory:** `canvas-run-anything-vision`

---

## 0. Where this sits (read `CLOUD_LOCAL_AGENT_ARCHITECTURE.md` §0 first)

The local agent's **functional pipeline is shipped** — `analyze` (deterministic repo
scan → `inferBlueprint` → reviewable template) and `deploy` (source/image/push, all
compute types, `--watch`). What is **not** built is the trust/agentic stack (§0.2 of that
doc). This document designs the first and largest of those three deferred layers:

- **#1 Agentic repo review** — the AI *explores* the repo like a developer instead of
  running a fixed scan. **This doc.**
- **#2 Consent / deny-list / audit** — the guardrails that make an AI running commands on
  your machine safe. They exist only to guard #1, so they ship **with** it (§6 here).
- **#3 Device flow / agent session auth** — an independent credential upgrade. This doc
  needs a *session channel* (§4) but **not** device-flow auth; that stays deferred (§11
  Phase 4, cross-referenced).

The deterministic scan is not thrown away — it becomes the **few-shot seed and the
fallback** (§7, §9).

---

## 1. Goal

Turn `analyze` from a **fixed scanner** into a **proposer that can look**: the AI decides
which files matter, reads them (with the user's consent, on the user's machine), builds a
richer app-understanding, and proposes/extends a **catalog-constrained, lint-validated**
blueprint. It reasons about framework specifics, non-standard layouts, and edge cases the
recipes miss, and can answer *"why this infra?"*.

The invariant from `canvas-run-anything-vision` holds unchanged: **the LLM proposes, the
deterministic engine disposes.** The output is still a reviewed blueprint compiled
deterministically to Terraform, applied only after human approval.

---

## 2. Current behavior (what exists today)

`analyze` is a pure function of the files present (`backend/agent/repoScan.js` →
`inferBlueprint.js`):

```
scanRepo(dir)  reads package.json / requirements.txt / Dockerfile / env KEY names
   → a fixed app-understanding object (runtime, framework, ports, services)
   → inferBlueprint() maps it to a lint-clean Blueprint via deterministic recipes
   → saved as a cloud template → user reviews on the canvas
```

**Strength:** reliable, testable, instant, free, always lint-clean. **Limit:** it only
recognizes the shapes the recipes encode (container-web / serverless / static + attached
data services). Anything unusual gets the nearest recipe, and it cannot reason about the
code's actual behavior — a monorepo, a non-standard entrypoint, a service inferred from an
import three directories deep all defeat it.

---

## 3. The shape: a server-side loop with locally-executed tools

### 3.1 Why Claude API + tool use (manual loop), not Managed Agents

The tools must run **on the user's machine** — their repo, their files — **gated by
consent** and **audited**. That is precisely the "host your own compute / client-side
tools / approval gates" case: we do not want Anthropic to host a container with the user's
source; we want the *local agent* to execute each read under the user's control. So the
surface is **Claude API + tool use with a manual agentic loop** (not the SDK tool-runner,
which auto-executes; not Managed Agents, which hosts the sandbox). The manual loop is what
lets us insert the consent gate, the deny-list, and the audit hook between "the AI asked"
and "the command ran."

### 3.2 The loop runs server-side; the CLI is a consented tool-executor

Mapdoc holds the Anthropic key; the **CLI never does** (unchanged from today — the CLI
talks only to Mapdoc, never to a cloud or a model provider). The backend drives the
`messages` loop and relays each requested tool call to the CLI over the session channel
(§4); the CLI executes it **locally, after consent**, and returns the result; the backend
feeds that result back to Claude. The AI never sees the machine — only the tool results
the user allowed.

```
  mapdoc CLI (local)              Mapdoc backend                     Claude API
  ─────────────────              ──────────────                     ──────────
                                 messages.create(tools) ───────────▶ tool_use: read_file
   ◀── tool request ────────────  relay over session channel
   consent gate + deny-list
   execute locally, redact
   ── tool_result ─────────────▶  append tool_result ──────────────▶ (loop continues)
                                        …
                                 end_turn / propose_blueprint ◀───── final proposal
                                 lint + repair → reviewable template
```

Rule (g) — *fix the existing code, don't layer*: the loop lives in the shared agent/LLM
layer and **reuses** `repoScan`/`inferBlueprint` (as seed + fallback) and the catalog /
lint / compiler. It does not fork the deploy pipeline or the analyze route's contract
(still `POST /v1/cloud/agent/analyze → { templateId, name, blueprint }`).

---

## 4. The agent session (the channel this needs — and what it is NOT)

A tool-use loop is inherently **duplex**: the backend must *push* tool requests to the CLI
and *receive* results mid-loop. Today's `analyze` is a single request/response, so this is
genuinely new machinery — the **agent session**: a persistent, outbound-only CLI↔backend
channel that links one CLI invocation to one server-side loop.

- **Transport:** the CLI opens an outbound stream (SSE or long-poll to start; websocket
  later) and posts tool results back on the same session id. No inbound listener on the
  CLI, consistent with the trust boundary.
- **Auth (important scoping):** Phase 1 authenticates the session with the **existing
  `tc_live` API key** — the channel is new, the credential is not. **Device-flow auth
  (`mapdoc login`) is out of scope here** and stays deferred (§11 Phase 4). Conflating the
  two was the mistake §0 of the local-agent doc calls out; keep them separate.

So "agent session" splits cleanly: the **channel** (needed now, built here) vs. the
**credential upgrade** (deferred). This doc builds only the channel.

---

## 5. The tool surface (dedicated, read-only first)

**Dedicated tools, not a raw `bash`** — because every one of the reasons to promote an
action to a dedicated tool applies: we need to **gate** it (consent), **audit** it, and
**parallelize** the read-only ones. A bash string is opaque to all three. (Agent-design
guidance: start with bash for breadth; promote when you need to gate/audit/parallelize —
we need all three from day one.)

| Tool | Input | Parallel-safe | What leaves the machine |
|---|---|---|---|
| `list_files` | `dir`, optional `glob` | yes | file/dir names (denylisted paths omitted) |
| `read_file` | `path` | yes | file contents, **secret-redacted**, size-capped |
| `grep` | `pattern`, optional `path` | yes | matching lines only |
| `read_manifest` | `kind` (package.json / requirements.txt / go.mod / …) | yes | parsed manifest fields |
| `inspect_command` *(Phase 3)* | `command` (bounded allowlist: `npm ls`, `git remote -v`) | **no** | command stdout, redacted |

Only **results** leave the machine, and only ones the user allowed — never the raw tree,
never `.env` values (the `read_file`/`inspect_command` results run through the same
secret-redaction the scan already uses for env values, `repoScan.js`). Read tools are
marked parallel-safe so the backend can batch a fan-out of reads in one turn; the command
tool is serial and always gated.

**How this works today (the existing control the read tools reuse).** The secret filtering
above is not new machinery to build — it is the **same clause the shipped code already
enforces**, at a new enforcement point. The deploy path applies a hard secret denylist,
`SECRET_EXCLUDES` (`backend/agent/cli.js:96` — `.env`, `.env.*`, `.aws`, `.ssh`, `.npmrc`,
`*.pem`, `*.key`, `id_rsa`, `id_ed25519`, `.terraform`, `*.tfstate`), **unconditionally** to
the upload tarball (`cli.js:125`), and the scan already returns env files **keys-only, never
values** (`repoScan.js:108`). The read tools apply that same denylist clause at the read
boundary: a `read_file`/`grep`/`list_files` on a denylisted path is refused, so those files
are never read — the same guarantee the tarball already gives, now at the point the loop reads.

**Read scope — the repo path jail (the PRIMARY boundary).** The denylist above filters
secret-shaped *filenames*; it is **not** a scope boundary. What makes "only *this repo's*
data can leave" true is a **path jail** on every read tool: the requested path is
**canonicalized** (`realpath`, resolving symlinks) and **rejected unless the resolved path is
inside the repo root** (the `dir` `analyze` was pointed at). Absolute paths outside root,
`..` traversal, and symlinks whose target escapes are all refused — and symlink resolution
happens **before** the containment check, or a committed symlink to `~/.ssh/id_rsa` would slip
the jail. This is the control that bounds the data to the project. Without it, the denylist
is a ~13-pattern filename filter over the **whole filesystem**: a prompt-injected AI (§10)
could read `~/.netrc`, `~/.pgpass`, `~/.kube/config`, `~/.docker/config.json`,
`~/.config/gh/hosts.yml`, another repo, or `/etc/passwd` — none of which the denylist covers.
With the jail, `SECRET_EXCLUDES` does its real job as the **secondary, in-repo** filter (a
committed `.env`/`*.pem` *inside* the jailed tree). Control ordering: **(1) jail → the repo is
the scope; (2) denylist → secret files within it; (3) consent → allow reads within this repo.**

---

## 6. Consent, deny-list, audit (the guardrails — #2, ships with #1)

These exist **only** to guard AI-chosen actions, which is why they arrive now and not
before (there were no AI-chosen commands to guard until this loop existed — §0.3 of the
local-agent doc). Three parts, each a small pure gate between "asked" and "ran" — all
operating **inside the read-scope precondition** below:

- **Read scope (the jail, §5) — the precondition, not one of the three guards.** The blanket
  "allow reads" grant is only safe **because reads are jailed to the repo root**: consent is
  to analyzing *this repo*, not the filesystem. A path resolving outside the jailed tree is
  refused regardless of consent. This is the boundary; the three guards below act within it.
- **Consent (tiered).** Read tools (`list_files`/`read_file`/`grep`/`read_manifest`) are
  read-only and secret-redacted, so they default to a **session-level "allow reads"**
  grant the user gives once at the start (or per-call if they prefer strict mode). The
  `inspect_command` tool is **always per-command prompt** — no blanket grant.
- **Deny-list.** A hard denylist of destructive/exfiltrating shapes (`rm`, `curl`/`wget`
  to the network, `git push`, `>`/`>>` redirects, anything outside the allowlist) is
  checked **before** consent is even offered — a denied command is never presented as an
  option, it's refused outright and returned to the AI as `is_error: true` so it adapts.
- **Audit.** Every tool call — the AI's request, the input, the consent decision, and a
  hash of the returned result — is appended to a per-session audit log, surfaced to the
  user. This is the machinery that turns "an AI that can run commands on your machine"
  from a scary idea into a reviewable one.

The AI can only ever *request*; the local agent decides. Even a fully-compromised prompt
(see §10 injection caveat) cannot exceed read-only, redacted, denylisted, consented reads —
all **jailed to the repo root** (§5), so the reachable data is the project, not the disk.

---

## 7. Repo → richer understanding → blueprint

The loop produces a richer **app-understanding** than the fixed scan (real framework
specifics, the actual entrypoint, services inferred from imports the scan can't follow),
then proposes infrastructure. The proposal path is **catalog-constrained and
lint-validated**, and it reuses the deterministic engine as the guardrail:

- **`propose_blueprint(blueprint)` is itself a tool.** The AI emits a blueprint built from
  **catalog node types only** (the vocabulary in `VISUAL_CLOUD_BUILDER_ARCHITECTURE.md`).
  The backend runs the **existing `lintCloud`** over it and returns the diagnostics as the
  tool result: an empty result means "accepted"; lint errors come back as the result so
  the AI **revises and calls again** — a bounded repair loop that reuses the same tool-use
  machinery. The first accepted blueprint becomes the reviewable template.
- **Deterministic recipes are the seed, not the ceiling.** `inferBlueprint`'s recipe for
  the nearest-matching shape is passed into the prompt as a **few-shot baseline**; the AI
  handles the *delta* (the unusual bits) rather than free-generating from nothing. This
  keeps results close to known-good graphs.
- **Nothing else changes downstream.** The accepted blueprint is compiled deterministically
  to Terraform and applied only after human review — the same path a hand-drawn or
  recipe-generated blueprint takes. *LLM proposes, deterministic engine disposes.*

Sanitization is preserved: only the derived understanding and the proposed blueprint leave
the machine; source and secrets stay local (the loop only ever sees allowed, redacted tool
results).

---

## 8. Model + client (rule d: small, reuse the shared wiring)

Reuse the shared Claude client (`backend/pdfImport/ai.js`): `claude-opus-4-8`,
`@anthropic-ai/sdk`, no sampling params. That client today exposes a single-shot
`structuredJson` helper; this feature adds a **sibling** helper for the agentic loop
(new small module, e.g. `backend/agent/llm/repoReview.js`) that shares the SDK wiring and
`MODEL`:

- **Manual tool-use loop** with a `relayToolCall(name, input) → result` callback (the CLI
  relay) — not the SDK tool-runner, so the consent/deny-list/audit gate sits in the
  callback (§6).
- **Adaptive thinking, `effort: "high"`** — this is agentic, exploration-heavy work.
- **A bounded budget** — a hard cap on tool-call iterations plus a token `task_budget`, so
  a single `analyze` can't run away on cost or latency. When the budget is hit, the AI is
  told to `propose_blueprint` with what it has.
- **`propose_blueprint` result = lint diagnostics** (§7), so the repair loop needs no new
  transport.

---

## 9. Graceful degradation (never a hard dependency)

Agentic review is an **enhancement layered on the shipped substitute**, not a replacement:

- **No API key** (`isAvailable()` false, same gate as `pdfImport`) → fall back to the
  deterministic `repoScan → inferBlueprint` path. `analyze` still works, offline and free.
- **Loop fails / user aborts / budget exhausted with no accepted blueprint** → fall back to
  the deterministic blueprint for what the loop did learn (the app-understanding it built
  seeds `inferBlueprint`). The user always gets a reviewable template.

The deterministic path is load-bearing precisely because it's the floor under a
non-deterministic feature.

---

## 10. Trust & security posture (rule b)

Extends `CLOUD_BUILDER_TRUST_ARCHITECTURE.md` — the **"Knows"** boundary is unchanged (only
the *design* leaves; state and secrets stay in-account/on-machine):

- **Local, outbound-only, consented.** The loop can only *request* reads; execution is
  local and gated. No inbound listener; no cloud change (this is `analyze`, not `apply`).
- **Source and secrets never leave.** Only allowed, redacted tool results feed the loop;
  only the derived understanding + blueprint leave. Same guarantee as the shipped
  `analyze`, now with the AI in the loop.
- **Every AI-chosen action is denylisted, consented, and audited** (§6).
- **LLM proposes; deterministic compiler + review apply** — no AI output reaches the cloud
  except as a reviewed blueprint.

**Caveats (explicit):**

- **Prompt injection.** A repo file (a README, a comment, a crafted `package.json`) could
  try to steer the AI. Blast radius is bounded by construction: the AI can't act — it can
  only propose a blueprint a human reviews, and its only tools are read-only, redacted,
  denylisted, consented reads. It cannot exfiltrate (no network tool), write, or apply.
  The `inspect_command` allowlist (Phase 3) is the sharpest surface — keep it tiny.
  **Correction (read scope, §5) — this is the load-bearing part of the caveat.** The
  "bounded by construction" claim above holds only for *actions* (read-only; no write,
  exfil, or apply). It does **not** bound *what data can leave*: `read-only` + `redacted` +
  `denylisted` + `consented` still span the **whole filesystem** — a prompt-injected AI
  could read `~/.netrc`, `~/.kube/config`, another repo, or `/etc/passwd`, none of which the
  filename denylist covers, and those results leave the same way. The **repo path jail
  (§5)** is what actually bounds the reachable data to the project, not the disk. Without the
  jail, the blast radius is filesystem-wide; with it, it is the repo.
- **Redaction is best-effort.** Secret-value redaction on tool results matches known
  key/secret shapes (as the scan does); an unusual secret format could slip into a result
  the user allowed. The session-level "allow reads" grant should make this a conscious
  choice, and strict mode (per-call consent) is available for sensitive repos.
- **Cost/latency.** Bounded by the iteration cap + `task_budget` (§8); when unset by the
  user, default conservatively and fall back deterministically on exhaustion.

---

## 11. Phasing

**Phase 1 — the loop + read-only tools + guardrails, feeding the EXISTING blueprint path.**
Agent-session channel (API-key auth); `list_files`/`read_file`/`grep`/`read_manifest`;
consent (session grant) + deny-list + audit; the loop builds a richer app-understanding
that feeds the **current** `inferBlueprint`. Proves "an AI that looks, safely" without
changing how the blueprint is produced.

**Phase 2 — the AI proposes/extends the blueprint.** `propose_blueprint` tool +
catalog-constraint + lint repair loop (§7), with recipes as the few-shot seed. This is the
co-pilot delta — coverage beyond the recipes, plus "why this infra?".

**Phase 3 — the `inspect_command` tool.** The higher-trust "run `npm ls`" tier — bounded
allowlist, per-command consent, deny-list. Deferred because it's the one surface that runs
*commands*, not just reads.

**Phase 4 (companion, separate work) — device-flow auth.** `mapdoc login`, short-lived
per-device tokens replacing the copied `tc_live` key, and CLI↔canvas session linking.
Independent of #1/#2; upgrades the *credential* on the channel this doc builds. Its own
doc/ticket.

*Update this doc per rule (f) as phases land.*

---

## 12. What's new vs reused

- **New:** the server-side tool-use loop, the dedicated read-tool surface, the
  consent/deny-list/audit gate, the agent-session channel, and the `propose_blueprint`
  lint-repair loop.
- **Reused:** `repoScan`/`inferBlueprint` (few-shot seed **and** fallback), the catalog /
  `lintCloud` / compiler (the guardrail), the shared Claude client (`pdfImport/ai.js`), the
  deployment/review/apply path (unchanged — this only changes how the blueprint is
  *proposed*).

---

## 13. Relationship to the rest of the system

- **Co-pilot modes** (advisor / generative): this is the **repo-aware generative** mode, on
  the same catalog-constrained, propose-not-apply foundation as the canvas co-pilot
  (`cloudArchitect.js` selects a pattern from a typed intent; this explores a repo — same
  disposition, richer input).
- **Deploy / reconcile:** entirely downstream and unchanged. Once the AI-proposed infra is
  reviewed and applied, deploy (the shipped local-agent pipeline) and run reconciliation
  cover it like anything else built on the canvas.

---

## 14. Provider independence (making it model-agnostic / non-Anthropic)

This design has **exactly one provider-shaped seam**. Everything that carries the product's
value is provider-neutral: the tool surface (§5), the consent/deny-list/audit gate (§6), the
agent-session channel (§4), and — the load-bearing one — the **catalog-constraint +
`lintCloud` repair loop** (§7). The *only* Anthropic-specific code is the LLM client wiring
(`pdfImport/ai.js`: the SDK, the model id, the `tool_use`/`tool_result` shape,
`output_config.format`). So going off-Anthropic is a **swap of one adapter, not a rewrite**.

### 14.1 The seam: an `AgentRuntime` port (define it in Phase 1)

Per rule (e), isolate the provider behind one interface so the loop never names a vendor:

```
AgentRuntime.run({ system, tools, messages, budget }, onToolCall) → { blueprint }
```

- `tools` are plain **JSON-Schema** tool definitions (provider-neutral).
- `onToolCall(name, input) → result` is the consent/execute callback (§6) — the gate lives
  here, above the port, so it's identical for every provider.
- The loop, budget (§8), and lint-repair logic live **above** the port. An adapter only
  implements "call the model → return its tool calls or final `propose_blueprint`."

Phase 1 keeps the Anthropic client behind this port (`anthropicRuntime`). Adding a provider
later is a new adapter file, nothing else.

### 14.2 What an adapter normalizes

Only four things differ across providers; all are contained in the adapter:

| Concern | Anthropic | OpenAI-compatible | Gemini | Local (Ollama/llama.cpp/vLLM) |
|---|---|---|---|---|
| Tool-call envelope | `tool_use` / `tool_result` blocks | `tool_calls` / `role:"tool"` | `functionCall` / `functionResponse` | (OpenAI shape) |
| Structured final output | `output_config.format` | `response_format: json_schema` | `responseSchema` | JSON mode + validate-retry, or grammar |
| Tool schema | JSON Schema | JSON Schema (fn params) | JSON Schema (fn decl) | JSON Schema |
| Thinking/effort | adaptive/effort | model-specific / none | model-specific | none |

The JSON-Schema tool definitions are the common denominator — every major provider does a
tool-call loop; only the wrapper differs.

### 14.3 Three routes off Anthropic (in leverage order)

1. **One OpenAI-compatible adapter with a configurable `base_url`.** Covers the entire
   OpenAI-shaped ecosystem in a single stroke — OpenAI, Azure, Groq, Together, Fireworks,
   OpenRouter, **and** self-hosted vLLM/TGI, **and** local Ollama/LM Studio (both expose an
   OpenAI endpoint). Highest coverage per line of code.
2. **A provider-agnostic layer.** In-process via the Vercel AI SDK (unified tool-calling
   across Anthropic/OpenAI/Google/Mistral/Ollama), or a **LiteLLM** proxy sidecar (one
   OpenAI-shaped API in front of 100+ providers, keys/routing outside the app). Use when you
   want to offer a menu of models rather than one configured endpoint.
3. **Fully local / on-device** — point the OpenAI-compatible adapter at `localhost`
   (Ollama / llama.cpp / vLLM) running an open-weight model. The most private version and a
   natural fit for the trust story: source never leaves the machine even for inference.

### 14.4 Why this is safe — the deterministic guardrail *is* what makes the model swappable

"LLM proposes, deterministic engine disposes" is the reason a provider swap doesn't
reopen the safety story. Correctness lives in the **deterministic layer** — the catalog
vocabulary, `lintCloud`, the repair loop, and `inferBlueprint` recipes as the floor. A
weaker or different model simply triggers more repair iterations (an invalid graph is
rejected and revised) or falls back to the recipe seed. The model is a component; the
guardrail is fixed.

### 14.5 Caveats (rule b)

- **Tool-calling reliability varies widely.** Frontier hosted models are strong; small
  local models are weaker and need tighter tool schemas, few-shot, and more repair
  iterations. Budget (§8) and the repair loop absorb this, but expect more turns.
- **Constrained output on weak models.** For the `propose_blueprint` step, weaker/local
  models benefit from **constrained decoding** (llama.cpp GBNF grammars, vLLM guided-JSON) —
  a clean fit because the catalog is a **closed vocabulary**; you can force schema-valid
  nodes at the token level rather than relying on the model to stay in-catalog.
- **"AI native" flips emphasis, not structure.** Making the loop the *primary* path (rather
  than an enhancement over the deterministic scan, §9) is a product choice — but keep the
  deterministic scan as the floor **regardless of provider**. It's what stops a bad or local
  model from shipping garbage, and it's provider-independent by construction.

> The through-line, unchanged from `canvas-run-anything-vision`: the agent and the AI are
> **proposers and couriers** — they read your repo and suggest infra — while the
> deterministic compiler, the in-account runner, and your approval remain the only things
> that change your cloud. Agentic review makes the *proposer* able to look; it does not
> give it a hand on the wheel.
