# How to use `POST /v1/generate/bulk`

Generate many documents from **one template** in a single request: you push a
collection of records, MapDoc renders one document per record and returns them as
a single zip. This is the headless, API-key version of the app's "bulk export".

It is **asynchronous** — the call returns a `jobId` right away, and the finished
zip is delivered by the `bulk.completed` webhook (or fetched by polling). This
suits large batches that take longer than one HTTP request should.

> **One template, many records** (this endpoint). For **many records → many
> *different* templates**, don't look for an API flag — loop the single-document
> [`POST /v1/generate`](./CONNECT_N8N.md#b-n8n-triggers-mapdoc-generation-action)
> once per record, each with its own `templateId`. That is a workflow, not a
> request shape.

---

## Prerequisites

- A **Business-plan** team (API access requires it).
- An **API key** (`tc_live_…`), created in the app.
- A **template** you own (its `templateId`), with its field/table mapping saved
  in the app ("light save") — the server reuses that saved mapping to render.
- Your backend base URL, referred to below as `API_BASE`
  (e.g. `https://api.map-doc.com`).
- To receive the result via webhook: a registered endpoint subscribed to
  `bulk.completed` (see [CONNECT_N8N.md](./CONNECT_N8N.md), section A). Otherwise
  poll the status/download endpoints below.

---

## Request

```
POST {{API_BASE}}/v1/generate/bulk
X-API-Key: tc_live_xxx           (or  Authorization: Bearer tc_live_xxx)
Content-Type: application/json
```

### Body

| Field | Required | Default | Notes |
|---|---|---|---|
| `templateId` | ✅ | — | The template to render each record with. |
| `data` | ✅ | — | The records. A JSON **array** of objects, or an **object containing a collection** (an array under a key). Same shape `/v1/ingest` accepts. |
| `driverCollectionKey` | — | auto | Which collection to fan out over. Auto-detected when unambiguous (see below); required when `data` holds several collections. |
| `format` | — | `pdf` | `pdf` \| `zpl` \| `png` \| `jpeg`. |
| `fileNameTemplate` | — | `document-{{__index}}.<ext>` | Per-file name inside the zip. Supports `{{__index}}` (1-based) and `{{field}}` tokens from each record. |
| `zipFileName` | — | `documents.zip` | Name of the returned archive. |
| `relatedCollections` | — | `{}` | Extra collections to expose to every record (e.g. shared line-items keyed by the driver row). |
| `dpi` | — | renderer default | Image formats only. |
| `jpegQuality` | — | renderer default | `jpeg` only. |

### How the driver collection is chosen

The "driver collection" is the array whose rows become documents (N rows → N
docs). Resolution:

1. If you send `driverCollectionKey`, that collection is used (400 if it isn't
   present).
2. Otherwise, if the parsed data has **exactly one** collection, it is used.
3. Otherwise, if a bare JSON **array** was sent, it becomes the `items`
   collection and is used.
4. Otherwise (several collections, none named) → **400**, asking you to specify
   `driverCollectionKey`.

### Driver vs. related collections (master-detail)

`driverCollectionKey` names the **fan-out axis**: each of its rows becomes one
document, and that row's columns fill the template's `{{placeholders}}`. Every
*other* collection in `data` is, by default, left **whole in every document** —
only the driver is scoped per row.

That matters when your template has a **table** bound to a second collection
(e.g. an invoice with line items). Without help, every invoice would show *all*
line items. Use **`relatedCollections`** to narrow that table to the current
row via a join:

```json
"relatedCollections": {
  "<collectionKey>": {
    "driverRowField": "<field on the driver row>",
    "filterColumn":   "<column on the related collection to match it against>"
  }
}
```

For each generated document, that keeps only the related rows whose
`filterColumn` equals the driver row's `driverRowField` (compared as strings,
case-insensitive).

#### Full payload — invoices with per-invoice line items

```json
{
  "templateId": "6b2e…",
  "format": "pdf",
  "fileNameTemplate": "invoice-{{invoiceNo}}.pdf",
  "zipFileName": "june-invoices.zip",
  "driverCollectionKey": "invoices",
  "relatedCollections": {
    "lineItems": { "driverRowField": "invoiceNo", "filterColumn": "invoiceNo" }
  },
  "data": {
    "invoices": [
      { "invoiceNo": "1001", "customer": "Acme",   "total": "99.00" },
      { "invoiceNo": "1002", "customer": "Globex", "total": "12.00" }
    ],
    "lineItems": [
      { "invoiceNo": "1001", "sku": "A-1", "qty": 2, "price": "40.00" },
      { "invoiceNo": "1001", "sku": "A-2", "qty": 1, "price": "19.00" },
      { "invoiceNo": "1002", "sku": "B-9", "qty": 3, "price": "4.00"  }
    ]
  }
}
```

What this produces:

- `invoices` is the driver → **2 documents** (`invoice-1001.pdf`,
  `invoice-1002.pdf`).
- Each invoice's `{{invoiceNo}}`, `{{customer}}`, `{{total}}` come from its
  driver row.
- The line-items **table** in `invoice-1001.pdf` shows only SKUs `A-1` and
  `A-2`; `invoice-1002.pdf` shows only `B-9` — because `relatedCollections`
  filtered `lineItems` on `invoiceNo`.
- Omit the `relatedCollections` block and every invoice would instead list all
  three line items.

> The template must already bind its table to the `lineItems` collection (done
> in the app's "light save"). `relatedCollections` only *scopes* that binding
> per row; it does not create it.

---

## Response

`202 Accepted`:

```json
{ "jobId": "b1f0…", "rows": 250 }
```

`rows` is how many documents will be generated. The job now runs in the
background; nothing else comes back on this connection.

---

## How the webhook links to the bulk job

There is **no callback URL in the request** — delivery is driven entirely by what
your team has already registered. The API key and the webhook are two separate
registrations, joined only by the **team**:

1. `tc_live_…` **authenticates the bulk call**. `POST /v1/generate/bulk` resolves
   the key to a `teamId`, and the job is stamped with it.
2. The same key (or the signed-in user) **registers a webhook once**, via
   `POST /v1/webhooks` — inserting a `webhook_endpoints` row
   `{ team_id, url, secret, events }` for the **same team**. You do this a single
   time, not on every bulk call.

When a job finishes, the engine calls `dispatchWebhook(teamId, 'bulk.completed', …)`,
which loads **every active endpoint of that team subscribed to the event** and
POSTs the signed payload to each. So your n8n node fires *because it belongs to
the same team as the key that started the job* — that is the whole linkage.

```
                        ── ONE-TIME SETUP ──
n8n Webhook node ──(its Production URL)──► POST $API_BASE/v1/webhooks
  (subscribed to bulk.completed)              X-API-Key: tc_live_…
                                           ← { id, secret: whsec_… }   ← save this

                        ── EACH BATCH ──
n8n HTTP Request ─► POST /v1/generate/bulk   (X-API-Key: tc_live_…)
                    ← 202 { jobId, rows }
                         │  job runs, stamped with the key's teamId
                         ▼
                    dispatchWebhook(teamId, 'bulk.completed', { jobId, downloadUrl, … })
                         │  fan-out to every active endpoint of that team subscribed to the event
                         ▼
n8n Webhook node ◄── signed POST  (X-MapDoc-Signature, X-MapDoc-Timestamp)
                         ▼
n8n HTTP Request ─► GET {{$json.downloadUrl}}  → the zip → email / Drive / Slack
```

Three consequences of this team-scoped model:

- **Two different secrets — don't confuse them.** `tc_live_…` authenticates
  *your calls out*. `whsec_…` (returned once at registration) is what you use
  *inside n8n* to verify the incoming signature —
  `sha256=HMAC(whsec, "<timestamp>.<rawBody>")`. Enable the Webhook node's "Raw
  Body" option to verify (optional but recommended). See
  [CONNECT_N8N.md](./CONNECT_N8N.md) §A.5 for the verification snippet.
- **It's fan-out, so correlate on `jobId`.** Every bulk completion for the team
  hits *every* subscribed endpoint — one call does not mean one webhook in
  flight. Read `{{$json.jobId}}` (and/or `templateId`) from the payload to tell
  which batch this is; if you register two endpoints, both receive every event.
- **No endpoint registered = silent no-op.** The job still completes and the zip
  still lands in S3 — you just aren't notified. Fall back to polling with the
  `jobId` from the 202 (Option B below).

---

## Getting the result

### Option A — webhook (recommended)

When the job finishes, MapDoc fires **`bulk.completed`** to your subscribed
endpoint:

```json
{
  "event": "bulk.completed",
  "teamId": "…",
  "jobId": "b1f0…",
  "rows": 250,
  "generated": 250,
  "downloadUrl": "https://…s3…?X-Amz-Signature=…",
  "expiresAt": "2026-07-06T12:34:56.000Z",
  "createdAt": "2026-07-06T11:34:56.000Z"
}
```

`GET` the `downloadUrl` to receive the zip. **Fetch promptly** — it is a
short-lived presigned S3 link (default ~1 h, `ARTIFACT_URL_TTL_SECONDS`). If you
need it longer, re-host after fetching. If the whole job fails, you get
**`bulk.failed`** instead (`{ event, teamId, jobId, rows, error, createdAt }`).

### Option B — polling

```bash
# Status: running | done | error
curl $API_BASE/bulk-jobs/<jobId>/status
# → { "status": "running", "current": 42, "total": 250 }

# Download (only when status = done): 302-redirects to a fresh presigned zip URL
curl -L $API_BASE/bulk-jobs/<jobId>/download --output documents.zip
```

`current` advances as rows render, so `current/total` is a live progress bar.
The download endpoint returns **409** until the job is `done` and **404** for an
unknown/expired job (jobs are retained ~30 min in memory; the artifact lives in
S3).

---

## Examples

### 1. Simplest — a bare array (auto-detected as `items`)

```bash
curl -X POST $API_BASE/v1/generate/bulk \
  -H "X-API-Key: tc_live_xxx" -H "Content-Type: application/json" \
  -d '{
        "templateId": "6b2e…",
        "data": [
          { "name": "Acme",   "total": "99.00" },
          { "name": "Globex", "total": "12.00" }
        ]
      }'
# → 202 { "jobId": "…", "rows": 2 }
```

### 2. Named collection + custom file names

```bash
curl -X POST $API_BASE/v1/generate/bulk \
  -H "X-API-Key: tc_live_xxx" -H "Content-Type: application/json" \
  -d '{
        "templateId": "6b2e…",
        "format": "pdf",
        "fileNameTemplate": "invoice-{{invoiceNo}}.pdf",
        "zipFileName": "june-invoices.zip",
        "data": {
          "invoices": [
            { "invoiceNo": "1001", "name": "Acme",   "total": "99.00" },
            { "invoiceNo": "1002", "name": "Globex", "total": "12.00" }
          ]
        }
      }'
```

Here `invoices` is the only collection, so it is auto-detected. Each file is
named from its record (`invoice-1001.pdf`, `invoice-1002.pdf`); duplicate names
are de-duplicated automatically.

### 3. Multiple collections — you must name the driver

```bash
curl -X POST $API_BASE/v1/generate/bulk \
  -H "X-API-Key: tc_live_xxx" -H "Content-Type: application/json" \
  -d '{
        "templateId": "6b2e…",
        "driverCollectionKey": "customers",
        "data": {
          "customers": [ { "id": 1, "name": "Acme" }, { "id": 2, "name": "Globex" } ],
          "regions":   [ { "code": "EU" }, { "code": "US" } ]
        }
      }'
```

Without `driverCollectionKey` this returns 400 (two collections, ambiguous).

### 4. n8n

- **HTTP Request** node → `POST {{API_BASE}}/v1/generate/bulk`, header
  `X-API-Key`, JSON body as above. Response is the small `{ jobId, rows }` JSON.
- A separate **Webhook** node (subscribed to `bulk.completed`) receives the
  result → **HTTP Request** `GET {{$json.downloadUrl}}` → email/upload the zip.

The full loop: *new orders in n8n* → `POST /v1/generate/bulk` →
MapDoc fires `bulk.completed` → n8n Webhook node → `GET downloadUrl` → deliver.

---

## Errors

| Status | Meaning |
|---|---|
| **400** | Missing `templateId`/`data`; driver collection ambiguous, not found, or empty. |
| **401** | No API key. |
| **402** | Monthly export cap reached for the plan. |
| **403** | Invalid/revoked key; team not on Business; bulk not allowed; or the batch exceeds your per-job row ceiling. |
| **404** | Template not found for this team. |
| **422** | `data` could not be parsed. |

**Partial failures within a job are best-effort:** a record that fails to render
is logged and skipped, and the zip still contains the successes. Compare
`generated` vs `rows` in the `bulk.completed` payload to detect skips. Only a
whole-job failure produces `bulk.failed`.

---

## Notes & limits

- **Plan gates apply per job:** the bulk capability, your per-job row ceiling,
  and the monthly export cap are all enforced before the job starts.
- **Formats:** `zpl` requires a plan that allows it; free-tier PDFs are
  watermarked (same rules as the in-app export).
- **Idempotency:** none built in — a repeated POST starts a new job. De-dupe on
  your side if retries are possible.
- **`/v1/ingest` vs this:** `/v1/ingest` only *parks* data for later generation
  in the app and never renders; `/v1/generate/bulk` renders now and returns a
  zip. Pick by which URL you call.
