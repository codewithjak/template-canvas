# Outbound Webhooks & the Connector Layer

## Overview

This document describes how MapDoc evolves from a **request/response** generation
API into an **event-driven** one — capable of being triggered by external systems
and notifying them when generation finishes — and how that same machinery powers a
horizontal, no-code connector layer (Zapier, Make, n8n — interchangeable bridges).

### Integration model: two universal primitives, many bridges

MapDoc does not "integrate with system X." It exposes two generic primitives and
lets the automation ecosystem bridge to everything else:

- **A universal way in** — the API + inbound webhooks (a caller pushes `templateId`
  + `data` and triggers generation).
- **A universal way out** — outbound webhooks (MapDoc notifies subscribers when a
  result is ready).

Zapier, Make, and n8n are **interchangeable bridges** over those two primitives —
not special-cased integrations. Anything not reachable through a bridge reaches the
same primitives directly: nearly every platform can fire its own webhook or call an
API. This is what makes the system usable across other systems **without building a
single native per-system integration**. The connector + webhook + API layer *is*
the integration story — the right shape for a "design-once, generate-anything"
engine rather than a document tool.

> **Bridges vs. the direct path.** Zapier/Make/n8n are the *convenience and
> long-tail* layer — great for no-code self-serve and the broad SaaS universe. The
> raw API + webhooks are the *high-volume production* path — used directly when
> per-task connector pricing or throttling would get in the way. The same backend
> serves both, so neither is privileged in the design.

The core shift, stated precisely: today the **browser is the assembler and
trigger**. The raw materials are *already* server-side —

- the **template** (`body_json` — elements, page configs, size) lives in `templates`,
- the **mapping** (`field_mapping`, `collection_mappings`,
  `table_collection_bindings`) lives in `template_bindings` (the "light save"),
- the **data** lives in `template_bindings.last_payload` after `/v1/ingest`.

What the browser still does is two narrow things: it **assembles** those pieces
into the single `genArgs` object the renderer expects, and it **decides when** to
press generate. This work adds a **second assembler** server-side so a caller that
cannot run the browser's — one that knows only a `templateId` and some `data` —
can produce the same output, and be *notified* when it is ready.

This does **not** move the browser's logic, deprecate the browser flow, or shift
everything server-side. The browser keeps assembling and triggering exactly as it
does now. `/v1/generate` is a *sibling* path that reuses the same renderer.

Nothing here replaces the existing flows. With the single exception of the job
registry (Step 2), every change is **additive** and reuses patterns already in
`backend/apiKeys.js`, `backend/routes/teamApi.js`, and `supabase/api_integration.sql`.

## The one missing primitive

`POST /v1/ingest` (`backend/routes/teamApi.js:248`) authenticates an API key,
parses incoming `data` into the Canonical IR, and **parks** it onto
`template_bindings.last_payload`. It never generates. The automated loop today is:

```
external system → data sits in a table → a human opens the app and clicks generate
```

Before webhooks or any connector are useful, there must be an API-key-authed path
that actually **generates**. That is Step 1, and it is the linchpin for everything
else.

> **Park and act stay separate, and both are opt-in.** Step 1 does **not** add
> generation *into* `/v1/ingest`; it adds a *different* endpoint, `/v1/generate`,
> next to it. `/v1/ingest` behavior is unchanged — byte-for-byte what it is today.
> A caller that only wants to push data and generate later in the app keeps calling
> `/v1/ingest` and nothing generates. The caller chooses behavior by **which URL it
> hits, on every request**. Nothing acts unless a caller explicitly asks it to.

## Architecture

### Target data flow

```
source event (e.g. "order placed")
  → [Connector Action] POST /v1/generate        (Step 1)
      → async job runs                           (Step 2: durable + team-stamped)
      → on completion: dispatchWebhook(...)       (Step 3)
          → signed POST to subscriber URL          (Step 4 subscription row)
              → [Connector Trigger] "Batch Completed"
                  → next step (email / Drive / Slack / …)
```

A user wires that entire chain with **zero code** through any bridge (Zapier, Make,
or n8n), and MapDoc builds no per-system integration. A high-volume caller can skip
the bridge entirely and call `/v1/generate` + subscribe a webhook directly.

---

## Step 1 — Add `POST /v1/generate` (a sibling to ingest; ingest stays as-is)

### Today
The browser assembles the pieces (template, mapping, data — all already
server-side) into one payload and sends it to `/generate-bulk-documents/async`
(`backend/index.js:457`):

```
genArgs: { ir, templateElements, fieldMapping, tableCollectionBindings,
           collectionMappings, pageConfigs, pageSize }
```

An external caller cannot run that assembly step — it has only `templateId` and
`data`.

### Change
A new `POST /v1/generate` (API-key auth + Business-plan gate, exactly like
`/v1/ingest`) that performs the **same assembly the browser does, server-side**.
It is a separate endpoint — `/v1/ingest` is untouched and still only parks data:

1. Parse `data` → IR via `parseDataSource` (reuse ingest's logic).
2. Load the template's `body_json` from `templates` → source of `templateElements`,
   `pageConfigs`, `pageSize`.
3. Load `template_bindings` for `(team, template)` → `field_mapping`,
   `collection_mappings`, `table_collection_bindings`.
4. Assemble the **same `genArgs` shape** the browser builds.
5. Hand it to the existing render path (`renderDocEntries` / the async job loop).

Single record → one document; an array → bulk, by detecting the driver collection
the same way `/generate-bulk-documents/async` does (`backend/index.js:470`).

### Why
This is exactly what `template_bindings` and the "light save" mapping blob were
built for — server-side memory of *how a template maps to data*. Step 1 reuses that
memory to do the browser's assembly step without a browser. It does not relocate
any logic out of the browser; the browser's own assembler keeps working unchanged.

### After
Two separate, opt-in endpoints: `/v1/ingest` is still "just park it," and
`/v1/generate` is "park it **and** produce output." The caller picks per request.
The system can now generate from a pure API call — but only when explicitly asked.

---

## Step 2 — Evolving the job registry  ✅ _built (S3-only, no-SDK, option A)_

> **Implemented.** Artifacts now go to **S3** and the `bulk.completed` webhook
> carries a presigned `downloadUrl` (option A). Details that differ from the
> original sketch below: storage is **S3-only with no local fallback**; S3 is
> reached **without the AWS SDK** (hand-rolled SigV4 in `storage/s3SigV4.js`,
> verified against AWS's known-answer vector) using **static env credentials**;
> the browser download endpoint **302-redirects** to a presigned URL (no CORS
> needed); and the upload is **idempotent + resilient** — on failure it HEAD-checks
> whether the object landed ("found ⇒ done") before retrying with backoff. Full
> configuration is in **`S3_SETUP.md`**.

### Today
Async jobs live in an **in-memory `Map`** (`backend/index.js:60`); the ZIP is
written to `os.tmpdir()`; there is a 30-minute TTL; and the file is **deleted on
first download** (`backend/index.js:593`). This is tuned for the browser: one user,
waiting, downloading exactly once.

Three of those assumptions break for the automated flow:

| Assumption (browser) | Reality (automation) |
|---|---|
| A human is waiting to click download | A webhook consumer fetches later, possibly more than once (connector/step retries) |
| The job belongs to "the current browser" | The dispatcher must know **which team** to notify — the job stores no `team_id` |
| In-memory is fine | A redeploy/restart (Lightsail) wipes the `Map` and any in-flight job, silently |

### Change
- **Stamp `team_id` and `source` onto the job** at creation:
  `jobs.set(jobId, { …, teamId, source: 'api' | 'browser' })`. Small change, but it
  is what makes Step 3's fire point work.
- **Stop deleting on first download.** Move the finished artifact to durable
  storage (**S3**) and put a *signed, time-limited URL* in the job record. The
  in-memory `Map` may remain as a fast status cache, but the artifact's source of
  truth becomes S3.
- The browser's existing download endpoint keeps working — it reads the durable
  artifact instead of a self-destructing temp file.

### Why
The browser flow optimized for "ephemeral, single-consumer." Automation needs
"durable, multi-consumer, survives restarts." This is the only step that revisits
an existing assumption — and it aligns with the planned S3/CloudFront deploy, so it
is not throwaway work.

### After
A finished generation is a durable, addressable artifact with a stable URL, owned
by a known team, regardless of who triggered it or how often it is fetched.

### Delivery: option A (built) vs option B (documented, later)
- **Option A — presigned URL in the payload (current).** `bulk.completed` carries
  `downloadUrl` (a private-bucket, TLS-only, least-privilege, short-TTL presigned
  GET). Convenient; the URL is a bearer link, bounded by `ARTIFACT_URL_TTL_SECONDS`.
- **Option B — jobId only + authenticated callback (future).** The webhook would
  carry just `jobId` (no URL); the consumer calls an authenticated
  `GET /v1/jobs/:jobId/download` with their API key, and the server mints a fresh
  presigned URL on the spot. No long-lived bearer link ever sits in a third
  party's logs. **Drop-in:** reuses `storage/s3Store.downloadTarget` and the
  existing API-key auth (`lib/apiAuth.requireApiTeam`); only the payload shape and
  one new route change. Recommended for teams handling sensitive documents.

---

## Step 3 — Outbound webhook dispatcher

### Today
Nothing outbound. The system only ever *responds* to requests. (`backend/delivery/`
emails an artifact, but that is user-initiated and synchronous — not an event
notification.)

### Change — data model
Two new tables in `supabase/api_integration.sql` (additive; browser-denied RLS, as
they hold secrets — mirror `team_api_keys`):

```sql
-- Many endpoints per team (unlike the 1:1 API key).
create table public.webhook_endpoints (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  url         text not null,
  secret      text not null,                  -- for HMAC signing
  events      text[] not null default '{}',   -- e.g. {'bulk.completed'}
  source      text not null default 'manual', -- 'manual' | 'connector'
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- The audit + reliability log.
create table public.webhook_deliveries (
  id              uuid primary key default gen_random_uuid(),
  endpoint_id     uuid not null references public.webhook_endpoints(id) on delete cascade,
  event           text not null,
  payload         jsonb not null,
  status          text not null default 'pending', -- pending|success|failed|dead
  attempts        int not null default 0,
  response_code   int,
  last_attempt_at timestamptz,
  created_at      timestamptz not null default now()
);
```

`webhook_deliveries` is the receipt an operator needs to trust automation: what was
sent, when, and whether it landed.

### Change — dispatcher
A new module `backend/webhooks/dispatch.js` exposing
`dispatchWebhook(teamId, event, payload)`:

1. Load the team's `active` endpoints subscribed to `event`.
2. Write a `pending` `webhook_deliveries` row per endpoint.
3. **Sign with replay protection** (`backend/webhooks/signature.js`): each delivery
   carries `X-MapDoc-Timestamp: <unix seconds>` and
   `X-MapDoc-Signature: sha256=<hmac(secret, "<timestamp>.<rawBody>")>` — the
   timestamp is *inside* the signed string, so a captured request can't be replayed
   later. Plus `X-MapDoc-Event` and a unique `X-MapDoc-Delivery` id (an
   **idempotency key** for dedupe).
4. POST. On non-2xx / timeout, **retry with exponential backoff** (e.g. 3 attempts);
   mark `dead` after the last failure.

#### Verifying a delivery (for receivers)
Recompute `sha256=HMAC(secret, "<X-MapDoc-Timestamp>.<rawBody>")`, compare in
constant time, **and** reject if `X-MapDoc-Timestamp` is outside a tolerance window
(default 5 min). The shipped `signature.verify(secret, timestamp, body, signature,
toleranceSec)` does exactly this; external consumers re-implement the same check.

### Change — wiring
One line at each existing completion site:

| Location | Event |
|---|---|
| `backend/index.js:555` (`job.status = 'done'`) | `bulk.completed` |
| `backend/index.js:558` (catch branch) | `bulk.failed` |
| end of `/generate-document` | `document.generated` |

Webhooks are **opt-in and silent by default**: the dispatcher loads the team's
`active` endpoints subscribed to the event, and an empty list is a no-op. A team
that never registers an endpoint never has anything sent — generation behaves
exactly as it does today.

Because the fire point is the *shared* completion code, browser-initiated exports
*can* also fire webhooks when the team has a matching endpoint — "someone ran a
batch in the UI" becomes a valid trigger. Whether browser-origin exports notify is
gated on having a subscribed endpoint (see Open decisions), so it is never a
surprise: no endpoint, no call.

### Payload shape
```json
{
  "event": "bulk.completed",
  "teamId": "…",
  "jobId": "…",
  "templateId": "…",
  "fileCount": 42,
  "downloadUrl": "…",
  "expiresAt": "…"
}
```

### After
The system can reliably tell the outside world "your documents are ready, here is
the URL" — signed, retried, and fully audited.

### Security — SSRF protection ✅ _built_

The dispatcher POSTs to URLs that *users register*, so without a guard a
subscriber could point MapDoc at internal targets (cloud metadata at
`169.254.169.254`, `localhost`, RFC-1918 ranges, link-local, …) and use the
server as a server-side request forgery proxy. `backend/webhooks/ssrfGuard.js`
defends in **two layers**:

1. **Registration time — `assertPublicUrl(url)`.** Wired into both
   `POST /v1/webhooks` (`parseEndpointInput`) and `POST /v1/hooks/subscribe`
   (`requireHttpUrl`). Rejects non-`http(s)` schemes and **literal** private /
   reserved IP hosts (IPv4 + IPv6: loopback, link-local, RFC-1918, CGNAT
   `100.64/10`, multicast, `169.254/16`, IPv4-mapped IPv6, etc.). Fast, friendly
   rejection — but a hostname can still *resolve* to a private IP later, so this
   is not sufficient alone.

2. **Delivery time — `guardedLookup` (the real protection).** The dispatcher's
   request uses a custom DNS `lookup` that resolves the host, drops any
   private/reserved addresses, and **connects only to a validated public IP**.
   Because the socket connects to the exact address that was checked, this closes
   the **DNS-rebinding / TOCTOU** window (a host that passed step 1 cannot be
   re-pointed at a private IP between check and connect). A blocked target fails
   the attempt and dead-letters; it never reaches a private address.

> **Dev bypass.** `WEBHOOK_ALLOW_PRIVATE_TARGETS=true` disables the guard so a
> developer can deliver to a `localhost` receiver. Off by default; set only in
> local/dev.

Note this guard is for the **webhook delivery** path (user-controlled URLs); the
S3 artifact upload/presign talks to AWS, not user input, so it is unaffected.

### Operability — delivery log & redelivery ✅ _built_

Every attempt is already recorded in `webhook_deliveries`; these endpoints make
that log usable without DB access (tenant-scoped via the team's endpoints):

- **`GET /v1/webhooks/deliveries`** — recent attempts, newest first, filterable by
  `?endpointId=…`, `?status=pending|success|failed|dead`, `?limit=…` (≤200). A team
  only ever sees its own deliveries (an `endpointId` it doesn't own returns `[]`).
- **`POST /v1/webhooks/deliveries/:id/redeliver`** — re-fire a past delivery (e.g. a
  dead-lettered one) to the same endpoint, recording a **fresh** attempt row
  (reuses the dispatcher's single-endpoint `deliverToEndpoint`, so signing, the
  SSRF guard and retries all apply).

This closes the delivery-visibility gap and gives a manual recovery path for
dead-lettered deliveries (a lightweight stand-in for a full durable-retry queue,
which remains future work).

### Endpoint lifecycle ✅ _built_

Management for a registered endpoint (API-key authed, tenant-scoped):

- **`POST /v1/webhooks/:id/ping`** — send a signed `webhook.test` event so a user
  can confirm a new endpoint works. Works even when paused; recorded in the
  delivery log like any other attempt.
- **`POST /v1/webhooks/:id/rotate-secret`** — mint a new signing secret (returned
  once); the old one stops working.
- **`PATCH /v1/webhooks/:id` `{ active }`** — pause/resume. A paused endpoint is
  skipped by the dispatcher (`loadSubscribers` only loads `active`) but can still
  be ping-tested.

---

## Step 4 — Connector-facing endpoints (REST Hooks)

Every bridge models a "trigger" as a webhook subscription managed automatically:
when a user turns an automation on, the platform calls *you* to subscribe; off, to
unsubscribe. Zapier, Make, and n8n all follow this same REST-hook pattern, so this
step is platform-agnostic and almost entirely **CRUD on the `webhook_endpoints`
table from Step 3**.

### Change
| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /v1/hooks/subscribe` `{ url, event }` | API key | Insert a `webhook_endpoints` row, `source='connector'`, scoped to the key's team; return its id |
| `POST /v1/hooks/unsubscribe` `{ id }` | API key | Delete that row |
| `GET /v1/me` | API key | Return team name/plan — the connection test every bridge runs |
| `GET /v1/events/sample?event=…` | API key | Return the most recent matching event so a bridge can show example data while building |

### Why so little
Step 3 did the hard part. A connector's triggers *are* the outbound webhooks; these
endpoints just let any bridge manage the subscription rows on the user's behalf.
They are the same endpoints a high-volume caller uses to subscribe a webhook
directly, with no bridge involved.

### After
The backend exposes everything any bridge needs: authenticate (`/v1/me`),
subscribe/unsubscribe to events, and act (`/v1/generate`) — and the same endpoints
serve direct API callers.

---

## Step 5 — The connector apps (and production hardening)

Each bridge's app lives in **its own developer platform, not the repo**, and all
three share the same definition shape:

- **Auth**: "API Key" type → sends `X-API-Key`, tested against `/v1/me`.
- **Triggers** ("Batch Completed", "Document Generated") → REST Hooks pointed at
  Step 4's subscribe/unsubscribe.
- **Actions** ("Generate Document" → `/v1/generate`; "Send Data to Template" →
  `/v1/ingest`).

Build one (Zapier first, since it has the widest reach), then **Make** and **n8n**
reuse the identical backend untouched — they share the trigger/action and REST-hook
model. n8n additionally serves the self-hosted / privacy-sensitive segment.

### The round-trip that makes it click
`/v1/generate` (action) starts a job → completion fires `bulk.completed` (Step 3) →
that webhook is the *trigger* for the next step. A no-code chain from a source event
to a delivered document, with no MapDoc-built per-system integrations.

---

## Sequencing

| Order | Step | Status | Notes |
|---|---|---|---|
| 1 | `/v1/generate` (Step 1) | ✅ built | Unblocks everything; shippable as raw API value on its own |
| 2 | Webhook tables + dispatcher (Step 3) | ✅ built | Dispatcher, signing, retries, `webhook_deliveries` audit |
| 3 | hooks / me endpoints (Step 4) | ✅ built | `/v1/me`, `/v1/hooks/*`, `/v1/events/sample` |
| 4 | S3 artifact durability (Step 2) | ✅ built | S3-only, no-SDK SigV4, option-A presigned URLs (`S3_SETUP.md`) |
| 5 | Connector apps (Step 5) | ⏳ external | Configuration in Zapier/Make/n8n over the endpoints above |

Step 2 was the only one to touch existing behavior (the job-registry assumptions);
Steps 1, 3, and 4 were purely additive.

## Open decisions

- **Artifact lifetime**: signed S3 URL TTL vs. the current 30-minute job TTL — pick
  a window that survives a connector's retry/delay behavior (and direct consumers
  that fetch late).
- **Webhook events to ship first**: `bulk.completed` alone covers the primary
  use-case; `document.generated` / `bulk.failed` / `ingest.received` can follow.
- **Whether browser exports notify webhooks**: recommended yes (consistent), but
  gate behind the team having endpoints so it is a no-op otherwise.
- **Delivery layer overlap**: an outbound webhook could eventually be modeled as a
  `delivery/` channel alongside email, but event-notification and artifact-delivery
  are conceptually distinct; keep the dispatcher separate for now.
