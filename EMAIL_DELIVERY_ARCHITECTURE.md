# Export Delivery (Email + Calendar Reminder) — Architecture & Phases

> **What this is.** After an export is generated, let the user **send it to an email
> address** instead of (or as well as) downloading it, and optionally attach a
> **calendar reminder** carrying a "respond by" deadline so the receiver acts within
> a given time frame.
>
> **Date:** 2026-06-19 · **Branch context:** TC-0072
> **Status:** planned · **Channel for v1:** email only (WhatsApp deferred — see §7)

---

## 0. Guiding principles (read first)

1. **Reuse the existing email architecture. Do not reinvent it.** Email already works:
   `backend/routes/contact.js` sends via SendGrid (`sgMail.setApiKey` + `sgMail.send`)
   using the verified sender `CONTACT_FROM` (`noreply@map-doc.com`). We reuse the same
   API key, the same sender, the same validation regex, and the same per-IP throttle.
2. **No types.** The backend is plain JavaScript — keep it that way. On the TypeScript
   frontend, never use `any`; reuse the existing exported shapes.
3. **Small functions, low cognitive complexity.** One function does one thing. No
   function should mix validation + I/O + formatting. Prefer many short named helpers
   over one long handler. Target: each function fits on a screen, ≤ 2 levels of nesting.
4. **Server-side delivery.** The export buffer already exists on the server during a
   render — send it from there. Never round-trip the file through the browser to email it.
5. **Degrade gracefully.** Missing `SENDGRID_API_KEY` → `503` (same as contact). Missing
   Supabase Storage config → fall back to direct attachment only. A misconfigured server
   never crashes an export.

---

## 1. Decisions locked

| Decision | Choice |
|---|---|
| Channels (v1) | **Email only.** WhatsApp deferred (§7). |
| Calendar reminder | **Optional per-send**, default off. Implemented as a `text/calendar` (`.ics`) deadline event + reminder alarm (`METHOD:PUBLISH`). |
| Response time frame | **Sender's choice:** relative ("respond within N days/hours") **or** absolute date/time. Normalized server-side to one absolute deadline. |
| File delivery | **Hybrid:** attach directly under the threshold (~25 MB); above it, upload to Supabase Storage and email a short-lived signed link. |
| Sender identity | `From` = `CONTACT_FROM` (verified domain). `Reply-To` = the signed-in user's email (`userEmail` from `resolveTeamFromJwt`) so "responding" replies to the real sender. |

---

## 2. What already exists (reuse, don't rebuild)

| Capability | Where | How we reuse it |
|---|---|---|
| SendGrid send | `backend/routes/contact.js` | Same `sgMail` pattern + `SENDGRID_API_KEY` + `CONTACT_FROM`. |
| Email validation | `CONTACT_EMAIL_RE` in `contact.js` | Same regex, promoted to a shared helper. |
| Per-IP rate limit | `contactRateLimited` in `contact.js` | Same idea, promoted to a shared helper. |
| HTML escaping | `escapeHtml` in `contact.js` | Same helper, promoted to shared. |
| Export buffer | `/generate-document` in `index.js` (`generatePdfBuffer` → `stampWatermark` → `rasterizePdfBuffer`) | Hand the produced buffer to the delivery module. |
| Auth → sender | `resolveTeamFromJwt` in `apiKeys.js` (returns `userEmail`) | Source of `Reply-To`. |
| Entitlement gate | `checkExportAllowed` in `usage.js` | Add a `delivery` capability check alongside it. |
| Env keys | `SENDGRID_API_KEY`, `CONTACT_FROM`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Already present; add only `DELIVERY_BUCKET` + `DELIVERY_ATTACH_MAX_BYTES`. |

> **Shared helper note.** `contact.js` currently inlines `escapeHtml`, the email regex,
> and the throttle. Phase 1 lifts these into `backend/lib/email.js` and has **both**
> `contact.js` and the new delivery code import them — one implementation, two callers.
> `contact.js` behavior is unchanged.

---

## 3. Module layout (all new files are plain JS, small functions)

```
backend/
  lib/
    email.js          # reused primitives: isValidEmail, escapeHtml, makeRateLimiter, sendMail
    icsBuilder.js     # buildDeadlineIcs({ title, deadline, alarmLead }) -> string
    deadline.js       # resolveDeadline({ mode, value }) -> Date   (relative|absolute -> absolute)
  delivery/
    storage.js        # uploadAndSign(buffer, name, contentType) -> { url } | null
    emailDelivery.js  # deliverByEmail({ artifact, recipient, message, calendar, replyTo })
    index.js          # deliver(...) orchestrator: pick attach-vs-link, build ics, send
```

Each file exports a few **named, single-purpose** functions. Example contracts (shapes
described in prose — no TypeScript on the backend):

- `isValidEmail(str)` → boolean.
- `sendMail({ to, from, replyTo, subject, text, html, attachments })` → Promise. Thin
  wrapper over `sgMail.send`; sets the API key once; throws on misconfig.
- `resolveDeadline({ mode, value })` → `Date`. `mode: 'relative'` adds `value` (e.g.
  `{ days, hours }`) to now; `mode: 'absolute'` parses an ISO string. One small switch.
- `buildDeadlineIcs({ title, description, deadline, alarmLead })` → `.ics` string. Pure,
  no I/O. Builds VEVENT + VALARM with `METHOD:PUBLISH`.
- `uploadAndSign(buffer, name, contentType)` → `{ url }` or `null` (null = not
  configured; caller falls back to attachment).
- `deliverByEmail(opts)` → Promise. Composes the helpers; contains **no** rendering logic.

---

## 4. Request/response contract (additive — old behavior unchanged)

`POST /generate-document` gains an **optional** `delivery` block. When absent, the
endpoint streams the file exactly as today.

```jsonc
{
  "...existing export params...": "...",
  "delivery": {
    "email": {
      "to": "recipient@example.com",
      "subject": "Your document",
      "message": "Plain-text body from the sender."
    },
    "calendar": {                      // OPTIONAL — omit to send with no reminder
      "title": "Respond to <document>",
      "deadline": { "mode": "relative", "value": { "days": 3 } }
      // or:       { "mode": "absolute", "value": "2026-06-25T17:00:00Z" }
    }
  }
}
```

- **Delivery present** → server renders, delivers, returns `202 { ok: true, viaLink: bool }`.
- **Delivery absent** → server streams the file (current behavior, untouched).
- Delivery runs **after** the gate and usage log, so it counts as an export and respects
  plan limits. Sending itself is fire-and-forget relative to the HTTP response only if we
  choose async; v1 may send inline and await for a simple, observable result.

---

## 5. Sender / recipient identity & the calendar event

- **From:** `CONTACT_FROM` (verified SendGrid domain sender). Required for deliverability.
- **Reply-To:** the signed-in user's `userEmail`. "Responding" = replying to this person.
- **`.ics` event:** `SUMMARY` = title, `DTSTART/DTEND` = the resolved absolute deadline,
  `VALARM` = a reminder lead before it (default 1 day, clamped to ≤ deadline), `ORGANIZER`
  = `CONTACT_FROM`, `ATTENDEE` = recipient. `METHOD:PUBLISH` (a deadline reminder, not an
  RSVP invite — no inbound Accept/Decline handling needed).
- Attach the `.ics` with content type `text/calendar; method=PUBLISH`. Gmail/Outlook/Apple
  render an "Add to calendar" action.

---

## 6. Safety, gating, abuse

- **Auth required** to send (bearer token; reuse `resolveTeamFromJwt`).
- **`delivery` capability** added to `plans.js` (server, enforcing) + `plans.ts` (client,
  UI hint only). Decide which plans get it before Phase 3.
- **Validate recipient** with the shared email helper; reject > 254 chars.
- **Rate limit** per user/IP via the shared `makeRateLimiter` (same window as contact).
- **Egress awareness:** this sends a user's document to a third party — only on explicit
  user action, never implicitly.
- **Signed links** are short-lived (24–72 h TTL) on a **private** bucket.

---

## 7. Out of scope for v1 (documented for later)

- **WhatsApp** — deferred. When added, it reuses `delivery/storage.js`: WhatsApp media must
  be a public/signed URL (Twilio `mediaUrl`), so the hybrid storage path already built in
  Phase 2 is the foundation. Also subject to the 24-hour session window / template rules.
- **Bulk delivery** — emailing the async ZIP. Same `delivery` block on the bulk endpoints,
  link-based given size. Lands after single-doc delivery is solid.
- **Component bundle** — treated as just another artifact (a zip) flowing through the same
  `deliver(...)` orchestrator.

---

## 8. Phases (build order)

> **Effort** sized S/M/L. **Exit criteria** are the objective "done when" gate. Don't start
> a phase until its dependency's exit criteria are met. Keep every function small (§0.3).

### P0 — Shared email primitives (refactor, no new behavior) ✅ done
**Effort:** S · **Depends on:** none

Lift the reusable bits out of `contact.js` into `backend/lib/email.js` so there is one
email implementation.

- `isValidEmail`, `escapeHtml`, `makeRateLimiter(max, windowMs)`, `sendMail(...)`.
- Refactor `contact.js` to import these. No change to the contact endpoint's behavior.

**Files:** `backend/lib/email.js` (new), `backend/routes/contact.js` (touched).
**Exit:** contact form still sends; `sendMail` is the single SendGrid call site.

---

### P1 — Email an export (attachment only, no calendar) ✅ done
**Effort:** M · **Depends on:** P0

Add `delivery/emailDelivery.js` + `delivery/index.js`. Wire the optional `delivery.email`
block into `/generate-document`: when present, render → attach the buffer → `sendMail` →
return `202`. `From` = `CONTACT_FROM`, `Reply-To` = `userEmail`.

**Files:** `backend/delivery/emailDelivery.js`, `backend/delivery/index.js` (new),
`backend/index.js` (touched).
**Exit:** A signed-in user can email a single PDF/image to themselves and receive it as an
attachment; download path with no `delivery` block is byte-for-byte unchanged.

---

### P2 — Hybrid storage (attach small, link large)
**Effort:** M · **Depends on:** P1

Add `delivery/storage.js` (`uploadAndSign`). In the orchestrator, choose attach vs link by
`DELIVERY_ATTACH_MAX_BYTES`. If storage isn't configured, always attach (graceful fallback).

**Files:** `backend/delivery/storage.js` (new), `backend/delivery/index.js` (touched),
`backend/.env.example` (add `DELIVERY_BUCKET`, `DELIVERY_ATTACH_MAX_BYTES`).
**Setup:** create a **private** Supabase Storage bucket + access policy (SQL provided at
implementation time; run by the maintainer).
**Exit:** a > 25 MB artifact arrives as a working short-lived link; a small one still
attaches.

---

### P3 — Calendar reminder (optional per-send)
**Effort:** M · **Depends on:** P1

Add `backend/lib/deadline.js` (`resolveDeadline`) + `backend/lib/icsBuilder.js`
(`buildDeadlineIcs`). When `delivery.calendar` is present, resolve the deadline (relative or
absolute), build the `.ics`, and attach it as `text/calendar`.

**Files:** `backend/lib/deadline.js`, `backend/lib/icsBuilder.js` (new),
`backend/delivery/index.js` (touched).
**Exit:** the email includes an `.ics` that adds a deadline event + reminder in Gmail;
relative and absolute modes both produce the correct absolute time.

---

### P4 — Frontend "Send via email" UI
**Effort:** M · **Depends on:** P1 (P2/P3 enhance it)

A small panel in the export flow (`TemplateCanvas.tsx`, beside the format selector):
recipient, subject, message, and an "Add response deadline" toggle revealing
relative/absolute pickers. Submit calls `/generate-document` with `delivery` set, via the
existing `API_BASE` + `authHeaders()`. Reuse existing TS shapes; **no `any`**.

**Files:** new send-panel component under `src/components/TemplateCanvas/`,
`src/services/dataSourceService.ts` (add a `sendDocument` call), `TemplateCanvas.tsx` (touched).
**Exit:** user fills the panel, sends, sees success/error inline; download path still works.

---

### P5 — Gating + rate limiting + polish
**Effort:** S · **Depends on:** P1–P4

Add the `delivery` capability to `plans.js`/`plans.ts`, enforce it in the route, apply the
shared rate limiter, finalize copy/error states, and document env in `EMAIL_SETUP.md`.

**Exit:** sending is gated to the chosen plan(s), throttled, and validated end-to-end.

---

## 9. Milestones

| Milestone | Phases | Demo |
|---|---|---|
| **M1 — Email it** | P0–P1 | Export → email a PDF attachment to an address |
| **M2 — Big files** | P2 | Large export arrives as a signed link |
| **M3 — Respond by** | P3–P4 | Email carries a deadline reminder; sent from the editor UI |
| **M4 — Shippable** | P5 | Gated, throttled, documented |
