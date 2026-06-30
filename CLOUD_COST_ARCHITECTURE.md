# Cost Estimation: pricing services per usage

> **Status:** Proposal / Design
> **Date:** 2026-06-30
> **Scope owner:** Junaid Khan
> **Part of:** `VISUAL_CLOUD_BUILDER_ARCHITECTURE.md` (the cloud pack)
> **Companion memory:** `canvas-run-anything-vision`

---

## 1. Goal

Show the user, **while they design on the canvas**, what their architecture will
cost. Cost should be **generated from the blueprint** the same way the Terraform,
the lint, the constraints, and the IAM policy are: each service declares a cost
model, a pure estimator sums it, and the canvas shows it live and recomputes as the
design changes.

> **Cost is another design-derived output.** Same pattern as the compiler and the
> constraint engine, so it composes with the catalog and scales as services are
> added.

---

## 2. The core challenge: two kinds of cost

There is no single honest number, because cloud cost splits in two:

| Kind | Examples | Knowable from the design? |
|---|---|---|
| **Provisioned** | EC2 hourly, RDS instance, ALB hourly, NAT gateway | Yes, compute it directly |
| **Usage-based** | data transfer (GB), S3 storage/requests, Lambda invocations | No, needs traffic assumptions |

So the headline the product shows is **"from $X per month, plus usage,"** not a
fake-precise single number. Usage-based services are marked and can take a few
optional assumptions for an estimate.

---

## 3. The model

### 3.1 A cost model per service

Declared on `CatalogEntry`, alongside `container` / `connections` / `invariants`:

```ts
interface CostEstimate {
  monthly: number;       // provisioned cost in USD/month
  usageBased?: boolean;  // true = also has usage cost not captured here
  note?: string;         // e.g. "+ data transfer", "+ requests"
}

interface CatalogEntry {
  // …type, label, group, create, fields, container, connections, invariants…
  cost?: (props: Record<string, unknown>, region: string) => CostEstimate;
}
```

Each service computes its provisioned monthly cost from its own props and the
region. A node with no `cost` contributes 0 (and is shown as "no cost model yet").

### 3.2 The estimator

A pure function, like the compiler:

```ts
estimateCost(pack, blueprint): {
  total: number;                       // sum of provisioned monthly cost
  perNode: Map<nodeId, CostEstimate>;  // for the badges + breakdown
  hasUsageBased: boolean;              // drives the "+ usage" caveat
}
```

It recomputes from the graph on every edit (same as the live linter), is
region-aware via `blueprint.meta.region`, and is snapshot-testable.

---

## 4. Data sources (sequenced)

### 4.1 Now: static catalog pricing (the MVP)

Each service's `cost` model reads a small **region-aware rate table** (the common
on-demand prices for the configurations we model). No external dependency, fast,
approximate. The cost is maintaining a small table and refreshing it periodically.

### 4.2 Later: Infracost (accuracy)

Because the blueprint already compiles to **Terraform**, run
[Infracost](https://www.infracost.io) on that HCL for an authoritative, maintained
cost breakdown, including usage-based estimates via a usage file. Exposed as a
"Detailed cost" action that calls a backend endpoint. No pricing database to
maintain in-house.

> **Recommendation:** ship the static estimate as the live in-canvas number, and
> add Infracost for the exact breakdown on demand. The static table gives instant
> feedback while drawing; Infracost gives the number you would quote.

---

## 5. Usage-based cost

For services whose cost depends on traffic (S3, data transfer, Lambda), provide a
small set of **assumption inputs** (per node or a global default), the same idea as
an Infracost usage file:

- defaults so a number always shows ("assuming 100 GB/mo transfer …"),
- the assumptions are explicit and editable,
- the result is labeled as resting on those assumptions.

This keeps usage-based services from showing "unknown" while staying honest.

---

## 6. UX

- **Per-node badge:** a small `~$8/mo` on each node, so the user sees where the
  money is.
- **Live total:** `Estimated ~$X/mo` in the top bar, next to the Run-target
  selector, recomputed as the design changes.
- **Breakdown panel:** per-service and per-node, on click.
- **Region-aware:** the estimate updates with the blueprint's region.
- **Free-tier toggle:** optionally subtract the 12-month free tier so small setups
  do not look more expensive than reality.
- **Honest labeling:** mark it an estimate, on-demand pricing, region-specific,
  excluding some line items (inter-service data transfer, NAT, snapshots, support).

---

## 7. Provider and region awareness

Cost is per-provider and per-region. AWS rate tables live in the AWS pack; Azure and
GCP declare their own against the same `cost` interface and estimator. The estimator
itself is provider-agnostic, it just sums what the services report.

---

## 8. Caveats (state them in the UI)

- Estimates never match the bill exactly; real invoices have many line items.
- Usage-based cost requires assumptions, so be explicit about them.
- Static prices drift; the Infracost path removes that maintenance.
- Free tier can distort small setups; hence the toggle.

---

## 9. Implementation mapping and phasing

**Phase 1 (MVP, build now):**
1. `spine/domainPack.ts`: add `cost?` and `CostEstimate` to `CatalogEntry`.
2. `spine/cost.ts`: the pure `estimateCost(pack, blueprint)`.
3. `packs/cloud/pricing.ts`: the AWS region-aware rate table.
4. `packs/cloud/catalog.ts`: a `cost` model per service (provisioned first).
5. `GraphCanvasBase.tsx`: per-node badge + a live total in the top bar.

**Phase 2 (accuracy):**
6. backend endpoint that runs Infracost on the compiled Terraform.
7. a "Detailed cost" panel showing the Infracost breakdown.

**Phase 3 (usage):**
8. per-node usage assumptions + a usage-file emit for Infracost.

> The design experience does not change. The user draws the same blueprint and sees
> a live cost appear next to it, the same way the lint and the plan already do.
