# Connect Zapier to MapDoc

Until a published MapDoc Zapier app exists, connect with **Webhooks by Zapier**
(a premium Zapier feature) in both directions. The MapDoc API is built for this
(see `WEBHOOK_CONNECTOR_ARCHITECTURE.md`).

## Prerequisites
- A **Business-plan** team and an **API key** (`tc_live_…`), issued in the app.
- Your backend base URL — referred to below as `API_BASE` (e.g. `https://api.map-doc.com`).
- Events you can subscribe to: `document.generated`, `bulk.completed`, `bulk.failed`.

---

## A. Zapier receives MapDoc events  ("when a bulk export finishes → do X")

**1. Create the catch URL**
New Zap → Trigger **Webhooks by Zapier** → **Catch Hook** (use **Catch Raw Hook**
if you plan to verify signatures). Zapier shows a **custom webhook URL** of the form:

```
https://hooks.zapier.com/hooks/catch/<account-id>/<hook-id>/
```

Copy it exactly (trailing slash included). It's public + HTTPS, which the SSRF
guard requires — no tunnel or extra config needed, since the URL is hosted by
Zapier, not your machine.

**2. Register it with MapDoc** (use `/v1/webhooks` so you also get the secret):
```bash
curl -X POST $API_BASE/v1/webhooks \
  -H "X-API-Key: tc_live_xxx" -H "Content-Type: application/json" \
  -d '{"url":"https://hooks.zapier.com/hooks/catch/...","events":["bulk.completed","document.generated"]}'
# → { "id": "...", "secret": "whsec_...", "events": [...], "active": true }
```

**3. Test immediately** — sends a signed `webhook.test` so Zapier can capture a
sample to build the rest of the Zap:
```bash
curl -X POST $API_BASE/v1/webhooks/<id>/ping -H "X-API-Key: tc_live_xxx"
```
Click **Test trigger** in Zapier to pull it in.

**4. Use the payload.** For `bulk.completed` you get `downloadUrl` + `expiresAt`.
Add a **Webhooks by Zapier → GET** action on `{{downloadUrl}}` to fetch the zip,
then your delivery action (Gmail attachment, Drive upload, Slack, …). **Fetch
promptly** — the link expires (default 1 h).

**5. (Optional) verify the signature** with a **Code by Zapier (JavaScript)** step
(needs the **Catch Raw Hook** trigger so you have the raw body):
```js
const crypto = require('crypto');
const ts  = inputData.timestamp;   // map from header X-MapDoc-Timestamp
const sig = inputData.signature;   // map from header X-MapDoc-Signature
const raw = inputData.raw;         // raw request body
const expected = 'sha256=' + crypto.createHmac('sha256', 'whsec_...').update(`${ts}.${raw}`).digest('hex');
if (sig !== expected) throw new Error('bad signature');
if (Math.abs(Date.now()/1000 - Number(ts)) > 300) throw new Error('stale');
return { ok: true };
```

---

## B. Zapier triggers MapDoc generation (action)

Add a **Webhooks by Zapier → POST** action:
- URL `{{API_BASE}}/v1/generate`
- Header `X-API-Key: tc_live_xxx`
- Payload type **JSON**, data: `templateId`, `data`, `format` (e.g. `pdf`)

The response is the rendered file. To then email/store it, either have MapDoc
deliver via a `bulk.completed` webhook (Pattern A) or use a bulk run; a single
synchronous file response is easiest to chain when the next step accepts the
binary directly.

```bash
curl -X POST $API_BASE/v1/generate \
  -H "X-API-Key: tc_live_xxx" -H "Content-Type: application/json" \
  -d '{"templateId":"<uuid>","data":{"name":"Acme","total":"99.00"},"format":"pdf"}' \
  --output invoice.pdf
```
Use `/v1/ingest` to only *park* data for later generation in the app.

A full loop chains B → A: *new order (Shopify/Sheets/…)* → POST `/v1/generate` or a
bulk run → MapDoc fires `bulk.completed` → Zapier Catch Hook → email the PDF.

---

## Manage & troubleshoot
- Pause / resume:  `PATCH $API_BASE/v1/webhooks/<id>  {"active": false }`
- Rotate secret:   `POST  $API_BASE/v1/webhooks/<id>/rotate-secret`
- Inspect attempts: `GET  $API_BASE/v1/webhooks/deliveries?status=failed`
- Re-fire a dead one: `POST $API_BASE/v1/webhooks/deliveries/<id>/redeliver`

## Gotchas
- **Webhooks by Zapier is a premium feature** — needed for both the Catch Hook
  trigger and the POST action.
- **`/v1/hooks/subscribe`** returns only `{ id }` (no secret); prefer
  **`/v1/webhooks`** so you can verify signatures.
- **Business plan + valid key**, or requests return `403`.
- The download URL is a short-lived presigned S3 link — fetch it during the Zap
  run; don't store it for later.
