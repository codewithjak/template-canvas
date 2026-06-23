# Webhook & Connector — Flow Diagrams

Visual companion to `WEBHOOK_CONNECTOR_ARCHITECTURE.md`. Two views: the runtime
delivery flow, and the management API. Diagrams are Mermaid (renders on GitHub /
VS Code preview / any Mermaid viewer).

## 1. Runtime: trigger → generate → store → deliver → retry

```mermaid
flowchart TD
  subgraph TRIG["Triggers"]
    EXT["External system / connector"]
    BROWSER["Browser (editor)"]
  end

  EXT -->|"POST /v1/generate (API key)"| GEN
  EXT -->|"POST /v1/ingest (API key)"| INGEST["park data → template_bindings.last_payload"]
  BROWSER -->|"POST /generate-bulk-documents/async (JWT)"| BULK

  subgraph SYNC["/v1/generate — sync, single doc"]
    GEN["requireApiTeam → entitlement"] --> GLOAD["loadTemplate + loadBindings"]
    GLOAD --> GASM["parse data → assembleGenArgs"]
    GASM --> GREND["render PDF / ZPL / image"]
    GREND --> GRESP["return file in HTTP response"]
    GREND --> EVT1{{"fire document.generated"}}
  end

  subgraph ASYNC["async bulk job (team-stamped)"]
    BULK["entitlement; job stamped teamId"] --> BREND["render each row → zip"]
    BREND --> S3PUT["S3 put — retry + HEAD check"]
    S3PUT -->|ok| PRESIGN["presign downloadUrl + expiresAt"]
    PRESIGN --> EVT2{{"fire bulk.completed"}}
    BREND -.->|error| EVT3{{"fire bulk.failed"}}
  end

  EVT1 --> DISP
  EVT2 --> DISP
  EVT3 --> DISP

  subgraph DISPATCH["dispatchWebhook (fire-and-forget)"]
    DISP["loadSubscribers (active + subscribed)"] --> OPEN["openDelivery → pending row"]
    OPEN --> ATT{"attemptOnce: sign(ts.body) + SSRF guardedLookup → POST"}
    ATT -->|2xx| OK["status = success"]
    ATT -->|"fail, attempts < MAX"| FAIL["status = failed; next_attempt_at = now + backoff"]
    ATT -->|"fail, attempts ≥ MAX"| DEAD["status = dead"]
  end

  subgraph WORKER["durable retry worker (interval timer)"]
    TICK["runDueRetries"] --> DUE["fetch due: pending/failed, due, attempts < MAX"]
    DUE --> ATT
  end
  FAIL -.->|"recovered later"| DUE

  ATT -->|"signed POST"| RCV["Receiver (Zapier/Make/n8n or own server)"]
  RCV --> VERIFY["verify HMAC over ts.body + freshness"]
  VERIFY --> FETCH["GET downloadUrl → S3"]

  OPEN --> DELDB[("webhook_deliveries (audit + schedule)")]
  OK --> DELDB
  FAIL --> DELDB
  DEAD --> DELDB
  DISP --> EPDB[("webhook_endpoints")]
  S3PUT --> S3[("S3 bucket — private, lifecycle-expire")]
  FETCH --> S3
```

## 2. Management API (all API-key authed, tenant-scoped)

```mermaid
flowchart LR
  USER["Connector / developer (API key)"]

  USER --> ME["GET /v1/me — auth/connection test"]
  USER --> SAMPLE["GET /v1/events/sample"]

  subgraph SUBS["Subscriptions"]
    SUB["POST /v1/hooks/subscribe"]
    UNSUB["POST /v1/hooks/unsubscribe"]
    CRUD["POST / GET / DELETE /v1/webhooks"]
    PATCH["PATCH /v1/webhooks/:id (pause/resume)"]
    ROT["POST /v1/webhooks/:id/rotate-secret"]
    PING["POST /v1/webhooks/:id/ping"]
  end
  USER --> SUB --> EP[("webhook_endpoints")]
  USER --> UNSUB --> EP
  USER --> CRUD --> EP
  USER --> PATCH --> EP
  USER --> ROT --> EP
  USER --> PING --> DTE["deliverToEndpoint → webhook.test"]

  subgraph VIS["Delivery visibility"]
    LIST["GET /v1/webhooks/deliveries"]
    REDEL["POST /v1/webhooks/deliveries/:id/redeliver"]
  end
  USER --> LIST --> DEL[("webhook_deliveries")]
  USER --> REDEL --> DTE
  DTE --> DEL
```

## Legend / notes

- `{{ }}` = an event fired into the dispatcher; `( )` = a data store; `{ }` = the
  single-attempt decision point.
- The **same `attemptOnce`** is reached from both the inline dispatch and the
  retry worker — that's why retries are durable (state in `webhook_deliveries`,
  not memory).
- The SSRF guard sits inside `attemptOnce` (`guardedLookup`) and at
  subscribe/create time (`assertPublicUrl`).
- Step mapping: sync generate = Step 1; S3 store = Step 2; dispatcher + audit =
  Step 3; `/v1/me` + hooks + sample = Step 4. See
  `WEBHOOK_CONNECTOR_ARCHITECTURE.md` for detail.
