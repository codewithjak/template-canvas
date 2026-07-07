# Connect n8n to MapDoc

n8n connects with its generic **HTTP Request** and **Webhook** nodes — no custom
node required. The MapDoc API is built for this (see
`WEBHOOK_CONNECTOR_ARCHITECTURE.md`).

## Prerequisites
- A **Business-plan** team and an **API key** (`tc_live_…`), issued in the app.
- Your backend base URL — referred to below as `API_BASE` (e.g. `https://api.map-doc.com`).
- Events you can subscribe to: `document.generated`, `bulk.completed`, `bulk.failed`.

---

## A. n8n receives MapDoc events  ("when a bulk export finishes → do X")

**1. Create the receiving URL**
Add a **Webhook** node (method `POST`). The node shows two URLs — a **Test URL**
(`/webhook-test/…`, live only while you click *Listen for test event*) and a
**Production URL** (`/webhook/…`, live when the workflow is *Active*). Register the
**Production URL** with MapDoc; use the Test URL only while building.

It must be a public `https://` URL — the SSRF guard refuses private/localhost
targets. The exact form depends on where n8n runs:

| Where n8n runs | Webhook (Production) URL form | Notes |
|---|---|---|
| **n8n Cloud** | `https://<workspace>.app.n8n.cloud/webhook/<path>` | Public + HTTPS out of the box — nothing extra. |
| **Self-hosted (own domain)** | `https://n8n.yourdomain.com/webhook/<path>` | Put it behind HTTPS (Caddy/nginx/Traefik) and set n8n's `WEBHOOK_URL=https://n8n.yourdomain.com/` so it advertises the right URL. |
| **Self-hosted, local + built-in tunnel** | `https://<random>.hooks.n8n.cloud/webhook/<path>` | Start n8n with `n8n start --tunnel`. **Dev only.** |
| **Local + ngrok / cloudflared** | `https://<id>.ngrok-free.app/webhook/<path>` | Point the tunnel at n8n's port (default `5678`). Dev only. |

`<path>` is the Webhook node's *path* field (a UUID by default; you can set a
friendly value like `mapdoc`). Example to register:
`https://acme.app.n8n.cloud/webhook/mapdoc`.

**2. Register the URL with MapDoc** (use `/v1/webhooks` so you also receive the
signing secret):
```bash
curl -X POST $API_BASE/v1/webhooks \
  -H "X-API-Key: tc_live_xxx" -H "Content-Type: application/json" \
  -d '{"url":"https://<your-n8n>/webhook/mapdoc","events":["bulk.completed","document.generated"]}'
# → { "id": "...", "secret": "whsec_...", "events": [...], "active": true }
```
Save `secret` (returned once) if you want to verify signatures.

**3. Test immediately** — sends a signed `webhook.test` to your node:
```bash
curl -X POST $API_BASE/v1/webhooks/<id>/ping -H "X-API-Key: tc_live_xxx"
```

**4. Use the payload.** `bulk.completed` looks like:
```json
{ "event":"bulk.completed", "teamId":"…", "jobId":"…",
  "downloadUrl":"https://…s3…?X-Amz-Signature=…", "expiresAt":"…" }
```
Add an **HTTP Request** node → `GET {{$json.downloadUrl}}` (response = the zip) →
then email/upload it. **Fetch promptly** — `downloadUrl` expires (default 1 h).

**5. (Optional) verify the signature.** Enable **"Raw Body"** on the Webhook node
(you must HMAC the raw bytes), then a **Code** node:
```js
const crypto = require('crypto');
const h = $input.first().headers;
const raw = $input.first().body;                 // raw string
const expected = 'sha256=' + crypto.createHmac('sha256', 'whsec_...')
  .update(`${h['x-mapdoc-timestamp']}.${raw}`).digest('hex');
if (h['x-mapdoc-signature'] !== expected) throw new Error('bad signature');
if (Math.abs(Date.now()/1000 - Number(h['x-mapdoc-timestamp'])) > 300) throw new Error('stale');
return $input.all();
```

---

## B. n8n triggers MapDoc generation (action)

Add an **HTTP Request** node:
- `POST {{API_BASE}}/v1/generate`
- Header `X-API-Key: tc_live_xxx`
- JSON body `{ "templateId": "<uuid>", "data": { … }, "format": "pdf" }`
- Response format **File / Binary** (the endpoint returns the rendered document).

```bash
curl -X POST $API_BASE/v1/generate \
  -H "X-API-Key: tc_live_xxx" -H "Content-Type: application/json" \
  -d '{"templateId":"<uuid>","data":{"name":"Acme","total":"99.00"},"format":"pdf"}' \
  --output invoice.pdf
```
Use `/v1/ingest` instead to only *park* data for later generation in the app.

### Bulk: one template, many records → one zip

`POST /v1/generate/bulk` fans a driver collection out into one document per row
(Mode A, "500 records → 1 template"). It is **async**: it returns a `jobId`
immediately and delivers the zip via the `bulk.completed` webhook (section A).

- `POST {{API_BASE}}/v1/generate/bulk`, header `X-API-Key: tc_live_xxx`
- JSON body `{ "templateId": "<uuid>", "data": <array or object with a collection>, "format": "pdf" }`
- `driverCollectionKey` is auto-detected when the data has exactly one collection
  (a bare JSON array becomes the `items` collection); send it explicitly when the
  data has several.

```bash
curl -X POST $API_BASE/v1/generate/bulk \
  -H "X-API-Key: tc_live_xxx" -H "Content-Type: application/json" \
  -d '{"templateId":"<uuid>","format":"pdf",
       "data":{"invoices":[{"name":"Acme","total":"99.00"},{"name":"Globex","total":"12.00"}]}}'
# → 202 { "jobId": "…", "rows": 2 }   (zip arrives via the bulk.completed webhook)
```
Optional: `fileNameTemplate` (per-file name, supports `{{__index}}` and field
tokens), `zipFileName`, `relatedCollections`, and `dpi`/`jpegQuality` for image
formats. Bulk requires the **Business** plan and is subject to your per-job row
ceiling + monthly export cap.

> **10 records → 10 different templates?** That is an n8n workflow, not an API
> shape: loop your records and call the single-document `POST /v1/generate` once
> per record, each with its own `templateId`. `/v1/generate/bulk` is deliberately
> one-template fan-out.

A full loop chains B → A: *new orders in n8n* → `POST /v1/generate/bulk`
→ MapDoc fires `bulk.completed` → n8n Webhook node → `GET {{downloadUrl}}` → email
the zip.

---

## Manage & troubleshoot
- Pause / resume:  `PATCH $API_BASE/v1/webhooks/<id>  {"active": false }`
- Rotate secret:   `POST  $API_BASE/v1/webhooks/<id>/rotate-secret`
- Inspect attempts: `GET  $API_BASE/v1/webhooks/deliveries?status=failed`
- Re-fire a dead one: `POST $API_BASE/v1/webhooks/deliveries/<id>/redeliver`

## Gotchas
- **Public URL required** — private/loopback targets are refused. For local
  self-hosted n8n, use a tunnel (or set `WEBHOOK_ALLOW_PRIVATE_TARGETS=true` on a
  **dev** backend only).
- **`/v1/hooks/subscribe`** also registers a URL but returns only `{ id }` (no
  secret); prefer **`/v1/webhooks`** for n8n so you can verify signatures.
- **Business plan + valid key**, or requests return `403`.
- The download URL is a short-lived presigned S3 link — don't store it; fetch then
  re-host if you need it longer.
