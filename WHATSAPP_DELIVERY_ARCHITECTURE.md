# WhatsApp Export Delivery — Architecture & Phases

> **What this is.** After an export is generated, let the user **send it to a
> WhatsApp number** as a third delivery channel, alongside download and email.
> The export travels as a WhatsApp media message (a document/image), so the
> receiver gets the finished file directly in their chat.
>
> **Date:** 2026-07-15 · **Branch context:** TC-0211 (delivery lineage: TC-0072)
> **Status:** P1 done (media store, per A1). P2 done (provider seam + Twilio).
> P3 done (WhatsApp channel + route wiring, session-window send). P4–P6 pending.
> **Provider (v1):** Twilio WhatsApp API (concrete), behind a provider-agnostic
> channel interface so Meta Cloud API can be swapped in later without touching
> the orchestrator or the route.
> **Companion doc:** `EMAIL_DELIVERY_ARCHITECTURE.md` — this feature is the
> realisation of that doc's **§7 "WhatsApp — deferred"** note. Read §2 of that
> doc first; we reuse its orchestrator, gating, and artifact pipeline verbatim.

---

## 0. Guiding principles (read first)

1. **Reuse the existing delivery architecture. Do not reinvent it.** Delivery is
   already a pluggable channel design: `backend/delivery/index.js` exposes a thin
   `deliver()` orchestrator that validates a `DeliverySpec` and dispatches to a
   channel module (`emailDelivery.js`). WhatsApp is **one more channel module**
   plugged into the same orchestrator — not a parallel path.
2. **No types on the backend.** The backend is plain JavaScript — keep it that
   way. On the TypeScript frontend, never use `any`; extend the existing
   exported `DeliverySpec` shapes in `src/services/dataSourceService.ts`.
3. **Small functions, low cognitive complexity.** One function does one thing.
   No function mixes validation + I/O + formatting. Target: each function fits on
   a screen, ≤ 2 levels of nesting. Mirror the shape of `emailDelivery.js`
   (shape the message → shape the media → send).
4. **Server-side delivery.** The export buffer already exists on the server
   during a render (`buildExportArtifact` in `backend/index.js`). Send from there.
   Never round-trip the file through the browser.
5. **Depend on abstractions, not vendors (SOLID: DSP + OCP).** The orchestrator
   depends on a `WhatsAppSender` *interface* (`send(message)`), not on Twilio.
   Twilio is one implementation injected at the edge (`fromEnv()`). Adding Meta
   later is a new file, zero orchestrator changes.
6. **Degrade gracefully.** Missing Twilio config → `503` (exactly like email's
   `isEmailConfigured()` → `503`). A misconfigured server never crashes an export;
   the download path is always unaffected.
7. **Don't over-engineer.** v1 is single-document, session-window sending. No
   inbound webhook handling, no conversation state machine, no bulk WhatsApp in
   v1 — each is a later, documented phase.

---

## 1. What this achieves (goals & non-goals)

### Goals
- A user who just generated an export can choose **"Send via WhatsApp"** and have
  the finished document delivered to a phone number as a WhatsApp media message.
- The channel is **gated by the same paid `delivery` capability** already used for
  email — no new plan flag in v1.
- The implementation is **provider-swappable** (Twilio now, Meta possible later).

### Non-goals (v1)
- **No two-way chat.** We send; we do not build an inbox or handle replies.
- **No cold-outreach templates in v1.** v1 sends within the recipient's open
  24-hour session window (see §3). Approved-template sending is **Phase 4**.
- **No bulk WhatsApp fan-out** (the async ZIP). Documented as **Phase 5**.
- **No new storage engine** beyond the small signed-URL helper WhatsApp requires
  (see §2, gap #1). We do not build the full hybrid-storage system here.

---

## 2. The two hard constraints (why this is not "just another email")

WhatsApp differs from email in two ways that shape the whole design. Both are
documented here so no phase is surprised by them.

### Gap #1 — WhatsApp needs a **public media URL**, not an attachment
Email attaches the raw buffer (`emailDelivery.js → toAttachment`). WhatsApp cannot
take a buffer: the provider's servers **fetch the media from a URL you host**
(Twilio's `MediaUrl`, Meta's media handle). So the export buffer must first be
uploaded somewhere web-reachable, producing a **short-lived signed URL**.

- **Current state.** The only storage today is `backend/storage/s3Store.js`, and it
  is **hardcoded to bulk `.zip` jobs** (`keyFor(jobId)` appends `.zip`,
  `downloadTarget` sets a zip content-disposition). It cannot store a single
  PDF/PNG artifact as-is.
- **What we build.** A small, focused `backend/delivery/mediaStore.js` that puts
  one artifact and returns `{ url, expiresAt }`. It **reuses the existing
  S3 SigV4 signer** (`backend/storage/s3SigV4.js`, already consumed by
  `s3Store.js`) — we do not add a new AWS dependency. This is the realisation of
  the email doc's deferred **P2 "delivery/storage.js"**, scoped down to exactly
  what WhatsApp needs (single artifact in, signed URL out).
- **SOLID note (SRP).** `s3Store.js` stays untouched and zip-focused. `mediaStore.js`
  is a separate, single-responsibility module. We do **not** bolt single-file logic
  onto the zip store (rule g: don't layer code onto the wrong module).

### Gap #2 — WhatsApp's **24-hour session window** is a product rule, not plumbing
Meta only allows free-form media messages to a recipient who messaged your
business number **within the last 24 hours** (the "session window"). Outside that
window you must send a **pre-approved template message**.

- **v1 decision.** Ship **session-window sending** first (Phase 3). The UI states
  the rule plainly; the send simply attempts and surfaces the provider's error if
  the window is closed. This is honest, small, and needs **no Meta template
  approval** to ship.
- **Later.** **Phase 4** adds approved-template sending (a template with a media
  header) so cold recipients can be reached. This requires a one-time Meta
  template approval and a `ContentSid`/template-name config value. It is additive.

> **Provider reality (informs, does not change the design).** Twilio offers both a
> **sandbox** (shared number, tester opt-in via join code, dev only) and **production**
> (your own WhatsApp Sender via Meta business verification). The 24h-window rule is
> Meta's and applies in **both**. Our code is identical for sandbox and production —
> only env values differ.

---

## 3. What already exists (reuse, don't rebuild)

| Capability | Where | How we reuse it |
|---|---|---|
| Delivery orchestrator | `backend/delivery/index.js` (`deliver`, `validateDelivery`) | Add a `whatsapp` branch to both; email path untouched. |
| Channel module pattern | `backend/delivery/emailDelivery.js` | `whatsappDelivery.js` mirrors it: shape → send. |
| Rendered artifact | `buildExportArtifact` (`backend/lib/exportArtifact.js`), called in `backend/index.js:259` | Same `{ buffer, fileName, contentType }` — upload it, don't attach it. |
| Route wiring + gate | `backend/index.js:244-274`, `checkExportAllowed({ delivery })` (`backend/usage.js:150`) | Same `delivery` capability gate; extend `wantsDelivery` to include WhatsApp. |
| Rate limiter | `deliveryRateLimited` (`backend/index.js:37`) | Same limiter guards WhatsApp sends. |
| S3 SigV4 signer | `backend/storage/s3SigV4.js` | Reused by the new `mediaStore.js` — no new signing code. |
| Send-doc UI | `src/components/TemplateCanvas/SendDocumentModal.tsx` | Add a channel toggle (Email / WhatsApp); reuse the modal shell. |
| Delivery types | `DeliverySpec` in `src/services/dataSourceService.ts` | Add an optional `whatsapp` block beside `email`. |
| Plan capability | `delivery` in `src/config/plans.ts` + `backend/usage.js` | Reused as-is. No new plan flag in v1. |

> **Config note.** New env keys are additive and only read at the edge (`fromEnv()`):
> `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, plus the media
> store's `S3_MEDIA_BUCKET`/`S3_MEDIA_PREFIX` (or reuse the existing artifact bucket
> with a distinct prefix). **`.env` files are never edited by code** (Safety Rules).

---

## 4. Module layout (all new backend files are plain JS, small functions)

```
backend/delivery/
  index.js              (EXISTING) + whatsapp branch in validate/deliver
  emailDelivery.js      (EXISTING, untouched)
  whatsappDelivery.js   (NEW)  the WhatsApp channel: shape media msg → send
  mediaStore.js         (NEW)  put one artifact → { url, expiresAt } (SigV4 reuse)
  providers/
    whatsappSender.js   (NEW)  interface + selector: fromEnv() → concrete sender
    twilioWhatsApp.js   (NEW)  Twilio implementation of send(message)
```

**Dependency direction (SOLID).**
`index.js` → `whatsappDelivery.js` → (`mediaStore.js`, `whatsappSender` interface).
`twilioWhatsApp.js` implements the interface and is only known to `fromEnv()`.
Nothing above the provider file imports Twilio.

**Each function, one job (illustrative signatures — no `any`, JS on backend):**
- `mediaStore.putArtifact(artifact, { expiresInMs }) -> { url, expiresAt }`
- `mediaStore.fromEnv() -> mediaStore` (throws if bucket unconfigured)
- `whatsappSender.send({ to, body, mediaUrl }) -> { sid }` (interface)
- `twilioWhatsApp.create(cfg).send(...)` + `twilioWhatsApp.fromEnv()`
- `whatsappDelivery.deliverByWhatsApp({ artifact, whatsapp, sender, mediaStore })`
- `whatsappDelivery.buildBody({ message })` — the caption text
- `index.validateWhatsApp(whatsapp)` — E.164 number check, message length
- `index.isWhatsAppConfigured()` — mirror of `isEmailConfigured()`

---

## 5. Request / response contract (additive — old behavior unchanged)

Today `DeliverySpec` is `{ email, calendar? }`. We add an **optional** sibling:

```ts
// src/services/dataSourceService.ts  (frontend types)
export interface WhatsAppDelivery {
  to:       string;   // E.164, e.g. "+14155550123"
  message?: string;   // optional caption (max ~1024 chars)
}

export interface DeliverySpec {
  email?:    EmailDelivery;      // becomes optional (was required)
  whatsapp?: WhatsAppDelivery;   // NEW
  calendar?: CalendarReminder;   // unchanged (email-only in v1)
}
```

- **Back-compat.** Existing email callers keep sending `{ email }`; nothing breaks.
- **Route.** `backend/index.js` computes `wantsDelivery = Boolean(delivery.email || delivery.whatsapp)` and routes to the matching channel. The single-render →
  gate → rate-limit → deliver flow is **unchanged in shape**.
- **Response.** Reuse `SendDocumentResult` (`{ ok, viaLink, withReminder? }`);
  WhatsApp returns `{ ok: true, viaLink: true }` (media is always link-hosted).

---

## 6. Safety, gating, abuse

- **Gate:** same paid `delivery` capability (`checkExportAllowed({ delivery: true })`).
- **Rate limit:** same `deliveryRateLimited(clientIp)` limiter.
- **Number validation:** strict **E.164** check before any send; reject otherwise.
- **Media URL TTL:** short-lived signed URL (default ~15 min) — long enough for the
  provider to fetch, short enough to not be a durable public link.
- **No PII in logs:** log the provider message SID, never the recipient number/body.
- **Config-absent:** `!isWhatsAppConfigured()` → `503` before any work.

---

## 7. Phases (build order)

Each phase is independently shippable and checked against this doc on completion
(rule j). Phase 1 completion updates **this** doc's status (rule f); the original
text is only amended, never rewritten (rule k).

### P1 — Media store (store key + on-demand signed URL) — *prerequisite* ✅ done
Build `backend/delivery/mediaStore.js`: `putArtifact` (returns a **key**),
`signedUrlFor` (mints a short-lived GET on demand, per A1), and `fromEnv`, reusing
`s3SigV4.js`. Unit-test with an injected transport (same pattern as
`s3Store.test.js`). No WhatsApp yet.
**Delivered:** `backend/delivery/mediaStore.js` + `backend/test/media-store.test.js`
(7 tests). Buffer in → opaque key stored; key → short-lived (~5 min) signed GET
minted only on demand, proven by test. Independent of `s3Store.js` and the
cloud-builder presign path.

### P2 — Provider seam + Twilio sender ✅ done
`providers/whatsappSender.js` (interface + `fromEnv` selector) and
`providers/twilioWhatsApp.js` (`send({to,body,mediaUrl})` via Twilio REST).
Injectable HTTP transport for tests; no live calls in CI.
**Delivered:** `backend/delivery/providers/whatsappSender.js` (seam: `fromEnv`,
`isConfigured`, `providerName`; Twilio is the only entry in `PROVIDERS`) +
`backend/delivery/providers/twilioWhatsApp.js` (form-encoded Basic-auth POST to
the Messages resource, sends the export as `MediaUrl`) + `backend/test/
whatsapp-provider.test.js` (8 tests). A mock transport proves the exact request
shape (URL, auth header, `To`/`From`/`Body`/`MediaUrl`) and the vendor stays
behind the interface. `isConfigured` here feeds P3's `isWhatsAppConfigured`.

### P3 — WhatsApp channel + route wiring (session-window send) — *v1 ship* ✅ done
`whatsappDelivery.js` orchestrates `putArtifact` → `sender.send`. Add the
`whatsapp` branch to `delivery/index.js` (`validateWhatsApp`, dispatch) and the
`isWhatsAppConfigured`/`wantsDelivery` extension in `backend/index.js`.
**Delivered:**
- `backend/delivery/whatsappDelivery.js` — `deliverByWhatsApp({artifact,whatsapp,
  sender,mediaStore})`: store key → mint short-lived URL → send; `sender`/`mediaStore`
  injected (testable without S3/Twilio).
- `backend/delivery/index.js` — `validateWhatsApp` (E.164 + message bound),
  `validateDelivery` now accepts email **or** whatsapp, `isWhatsAppConfigured`
  (sender **and** media store configured), and `deliver()` dispatches to a
  per-channel helper (`deliverViaEmail` / `deliverViaWhatsApp`). Email path
  behaviour unchanged — the old body was refactored into `deliverViaEmail`, not
  duplicated (rule g).
- `backend/index.js` — `wantsDelivery` and the delivery block now cover WhatsApp,
  with a per-channel `503` config check; email path untouched.
- Added `mediaStore.isConfigured()` (feeds `isWhatsAppConfigured`).
- `backend/test/whatsapp-delivery.test.js` (7 tests): channel flow (sends the
  minted URL, not a buffer) + validation.
**Note:** the actual live send requires a warm recipient (open 24h window) and
configured Twilio + `S3_MEDIA_BUCKET`; unit tests use injected fakes, so no live
call in CI. Frontend UI is P4; no frontend changes here.

### P4 — Frontend "Send via WhatsApp"
Add a channel toggle to `SendDocumentModal.tsx` (Email | WhatsApp). WhatsApp shows
a phone-number field + caption + a one-line note about the 24h window. Reuse the
existing submit/status flow. **Deliverable:** users send from the editor UI.

### P5 — Approved-template sending (cold recipients)
Add optional template config (`ContentSid`/template name + media header) so sends
outside the 24h window use a pre-approved template. Requires one-time Meta
approval. Additive: `whatsappDelivery` chooses free-form vs template by config.

### P6 — Bulk WhatsApp (defer)
Emailing/sending the async ZIP result. Same `delivery` block on the bulk
endpoints, link-based. Lands only after single-doc WhatsApp is solid.

---

## 8. Future caveats (know these before building)

1. **Session window closes silently.** A send outside 24h fails at the provider,
   not at our validation. v1 surfaces the provider error verbatim; P5 removes the
   limitation via templates. Don't try to "detect" the window client-side.
2. **Media URL must outlive the send but not linger.** Too short → provider fetch
   fails; too long → durable public link. Keep the TTL tunable in one place.
3. **Provider onboarding is out-of-band.** Twilio Sender + Meta business
   verification are manual, one-time, and not code. The code ships behind config
   and stays dormant (`503`) until env is set.
4. **Rate/cost.** WhatsApp charges per conversation; our `deliveryRateLimited`
   limiter caps abuse but cost monitoring is a product concern, not code here.
5. **Do not entangle with `s3Store.js`.** It is zip/bulk-scoped. WhatsApp media is
   a separate module (rule g). Fixing one must never mean layering the other.
6. **Meta swap-in.** When/if Meta Cloud API replaces Twilio, only
   `providers/twilioWhatsApp.js` + `fromEnv()` change. If the orchestrator needs
   edits to swap providers, the seam (§0.5) was drawn wrong — treat that as a bug.

---

## 10. Amendments

> Per rule (k), the sections above are frozen. Refinements are recorded here as
> additive points that supersede the referenced original point.

### A1 (amends §2 gap #1, §4, §7 P1) — store a **key**, mint the URL on demand
**Date:** 2026-07-15 · **Reason:** a stored/returned signed media URL would be a
fetchable link that lives for its whole TTL. To keep the media unexposed during
the recipient's 24-hour session window, the store must persist only an **opaque
object key**; the public signed URL is minted **lazily, at send time, with a very
short TTL**, and never persisted.

- **Supersedes** the §2/§4 signature `putArtifact(artifact) -> { url, expiresAt }`.
  New split (single responsibility each):
  - `putArtifact(artifact) -> { key, contentType }` — uploads the buffer, returns
    an opaque key. **No URL.** Content-Type is set on the PUT so the later GET
    returns it (WhatsApp fetches the correct type without us re-specifying it).
  - `signedUrlFor(key, { expiresInMs }) -> { url, expiresAt }` — mints a
    short-lived presigned **GET** only when the provider is about to fetch.
- **Default TTL** for `signedUrlFor` is short (≈5 min), long enough for the
  provider fetch, far shorter than the 24h window. Tunable in one place.
- **Do NOT reuse the cloud-builder presign path** (`backend/cloud/runner.js`,
  `backend/cloud/deploy.js`). Those presign against the *customer's* bucket using
  assumed-role Connect credentials — a different trust context. `mediaStore.js`
  is independent and shares only the pure signer `backend/storage/s3SigV4.js`.

---

## 9. Definition of done (v1 = P1–P4)

- `mediaStore` unit-tested (injected transport), no live AWS in CI.
- Twilio sender unit-tested (injected HTTP), no live send in CI.
- `/generate-document` with `delivery.whatsapp` delivers to a warm recipient.
- Email path byte-for-byte unchanged; download path unaffected.
- Missing config → `503`, never a crash.
- This doc's status line updated to reflect the shipped phases (rule f).
