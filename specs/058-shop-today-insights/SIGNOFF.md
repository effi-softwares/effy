# Sign-off: 058-shop-today-insights — Shop Console: Today & Insights

**Date**: 2026-09-14 · **Status**: 🚧 **CODE-COMPLETE + MACHINE-VERIFIED. NOT DEPLOYED, NOT COMMITTED,
NOT WALKED BY A PERSON.**

Spec: [spec.md](spec.md) · Plan: [plan.md](plan.md) · Research: [research.md](research.md) ·
Architecture deliverable: [docs/insights-architecture.md](../../docs/insights-architecture.md) ·
Walks: [quickstart.md](quickstart.md) · Baseline: [BASELINE.md](BASELINE.md)

---

## What was built

**82 of 82 tasks.** Today replaces 057's dashboard as the console's landing screen; Insights is a new
destination. Both are shop-web only (shop-mobile parity is recorded as outstanding).

| Layer | What landed |
|---|---|
| Database | `20260914165403_shop_insights.sql` — `shop.timezone`, `shop_local_hour()`, four tables (`shop_sales_hour`, `shop_product_sales_day`, `insights_dirty`, `insights_state`), **six triggers**, and a backfill that seeds the queue from existing history |
| Cold path (`edge-shop`) | 4 routes (`today`, `insights`, `team-activity`, `pick-lists`) + 2 scheduled jobs (rollup every minute, reconcile nightly). 40 → 44 functions; **CloudFormation resources well inside the 500 ceiling** |
| Hot path (`core-api`) | `internal/features/shoplive` — `GET /v1/shop/live`, one `LISTEN` connection per task, a per-shop hub, 3 metrics |
| Shared packages | `@effy/shared-types/shop-insights`, `@effy/web-kit` SSE reader, `@effy/edge-shared` refund-proposal + low-stock rules (both **promoted**, not copied) |
| Console | `features/today/` (screen, two cards, glance, two sheets, live hook, render clock) and `features/insights/` (screen, two strips, twin charts, top products, CSV) |
| Infra | 3 alarms in `infra/envs/dev/insights.tf` → the existing alerts SNS topic |

---

## Verification

Against [BASELINE.md](BASELINE.md), recorded at HEAD before any file was written.

| Sweep | Baseline | Now |
|---|---|---|
| `pnpm -r typecheck` | 19/19, exit 0 | **19/19, exit 0** |
| `pnpm -r test` | 18 packages, **2,123** | **18 packages, 2,221** |
| `apis/edge-api/shop` | 273 | **315** |
| `apps/shop-web` | 290 | **335** (37 files) |
| `packages/web-kit` | 51 | **63** |
| **`apis/edge-api/orders`** | **16** | **16 — UNMODIFIED** (the proof the refund-proposal promotion changed nothing) |
| `apis/edge-api/inventory` | 59 | **59** (expectations unmodified; only its module mock became partial) |
| `apps/back-office` · `apps/customer-web` | 190 · 458 | **190 · 458 — UNMODIFIED** |
| Go | all `ok` | **all `ok`**, + **12 new** (`shoplive`) · build/vet/gofmt clean |
| Design guards | — | `check-tokens` · `check-shop-theme` · `check-component-shape` · `check-no-emerald` · `check-no-jade` all **OK** |
| `tokens:check` | 10 files | **10 files, UNCHANGED** — the mechanical proof this slice added no token and reached no mobile theme |
| `terraform validate` / `fmt` | — | **clean** |

### Seven negative proofs — each executed by breaking the thing, then reverting

| # | Proof | Broken how | Result |
|---|---|---|---|
| 1 | Trigger allow-list | added `UPDATE public.shop` to a trigger body | fails **naming the function** |
| 2 | FR-006 one value | made the nav badge compute its own count | agreement test fails |
| 3 | FR-029 stream cleanup | removed `stop()` from the unmount path | cleanup test fails |
| 4 | FR-026 rollups only | joined `order_item` into the insights repository | guard fails **naming the file** |
| 5 | FR-011 refused controls | injected `✉Message a customer` — **no delimiter**, the exact shape that defeated 057's first guard | fails naming the file |
| 6 | DST bucket keys | restored the ambiguous wall-clock reconstruction | the two 02:00 hours collapse; test fails |
| 7 | Stream carries no data | put an order number in the SSE payload | Go test fails |

---

## ⚠ What is NOT proven

- **Docker was down for the entire session.** Every container test — 4 files, ~48 assertions in
  edge-shop plus 3 Go listener tests — is **written and compiling but UNEXECUTED**. They cover the
  things nothing else can: that a trigger fires only on commit, that a rolled-back refund leaves no
  work behind, that the refund attribution arithmetic is right, that recomputation is idempotent, and
  that `shop_local_hour` produces 25 buckets on a 25-hour day. 052 lost a session's proofs exactly
  this way. **Run them before trusting any of it** (quickstart §1).
- **Nobody has looked at any screen.** 039 shipped four live defects with a fully green suite —
  layout, contrast and hierarchy are not properties a DOM assertion can see. One such defect was
  caught here by reading the source back (dangling cell rules on wrapped grids, now drawn as a grid
  gap); the ones that need eyes are still unfound.
- **No live order has ever appeared on Today**, because nothing is deployed. The whole live path —
  trigger → NOTIFY → listener → SSE → refetch — has never run end to end against real infrastructure.
- **SC-002 / SC-004 are unmeasured.** The freshness targets are structural, not observed.

## Decisions a reviewer should know about

- **The spec was amended during planning** (FR-032): refunds are dated when **issued**, not when the
  order was paid — Shopify's own sales-report practice, and what keeps a reported past day stable.
- **Three recorded constitutional exceptions**, all in plan.md § Complexity Tracking: a shop-pool route
  on the hot path (a stream cannot live on Lambda — 30 s integration cap), the platform's first
  database triggers (six writers on two backends; a forgotten call is silent), and a `NOTIFY` channel
  that is explicitly **not** the event backbone.
- **A live-only defect was found by reading config rather than tests**: the service's 30 s
  `WriteTimeout` would have killed every stream while `httptest` passed. Cleared per request.
- **Two real bugs in the calendar arithmetic** were caught by the DST tests, in code that had already
  been reviewed once.

## Open — all operator, in this order

1. **The commit.**
2. `make db-up ENV=dev` — the migration. Then watch `insights_dirty` drain to 0 and `insights_state`
   gain a row per shop with sales (a few minutes; the backfill builds history through the job).
3. `make edge-deploy SERVICE=shop ENV=dev` (4 routes + 2 schedules), then `SERVICE=orders` (the
   promoted rule) and `SERVICE=inventory` (the promoted low-stock predicate).
4. `make core-image-push && make core-deploy ENV=dev` — the live stream.
5. `make apply ENV=dev` — three alarms. **Abort if anything other than the alarms would change.**
6. Push shop-web to `dev` (Amplify builds it).
7. **`CONTAINER_TESTS=1 pnpm --filter @effy/edge-shop test` and `make core-test FULL=1` with Docker
   up** — before the walks, not after.
8. The walks: [quickstart.md](quickstart.md) §3, W1–W13. ⚠ **W3 (a real order appearing live) and W8
   (a late refund landing in today's figures) are the two that cannot be inferred from anything above.**
