# Quickstart: Delivery Zones & Shipping-Fee Engine (047)

A validation/run guide — how to prove the feature end to end. Implementation detail lives in
[data-model.md](data-model.md) and [contracts/](contracts/); this file is the runbook and the Success-
Criteria proof list. ⚠ Operator-run steps (migrations, deploys, live AWS) are the operator's, per the
platform's mode of work.

## Prerequisites

- `make db-up ENV=dev` will have applied the committed migration `<ts>_delivery_shipping_engine.sql`
  (003 commit-guard: commit the migration first).
- The place record is loaded: `make load-localities ENV=dev` (idempotent; re-runnable).
- `core-api` runs (`make core-run`, or the dev Fargate service from 040) and the two edge domains are
  deployed: `make edge-deploy SERVICE=admin ENV=dev` and `SERVICE=shop ENV=dev`.
- At least two shops and a seeded catalogue exist (from 019/020 dev seed).

## §1 — Load & sanity-check the place record (US1a)

1. `make load-localities ENV=dev`, then re-run it — the second run reports **0 inserted, N updated**
   (idempotence, 030). Row count ≈ 15k; VIC subset is what launch zones draw from.
2. `SELECT count(*) FROM public.locality WHERE latitude IS NULL;` — expect a small minority (localities
   with no G-NAF point); these simply do not contribute to ring suggestion.

## §2 — Compose zones and prove the one refusal (US1a → SC-001/002/015)

1. In back-office → Delivery → Zones, create `MEL-INNER` by searching **"Richmond"** and adding it —
   **without typing a postcode** (SC-015). Confirm the console shows the **other places 3121 also serves**
   before commit (FR-008).
2. Add **"Ballarat"** to a `REGIONAL` zone the same way; note 3350 also adds ~20 localities (the console
   states the count).
3. `GET /v1/storefront/serviceability?postcode=3121` → `{"serviced":true}`; `?postcode=3999` (in no zone)
   → `{"serviced":false}`; `?postcode=abc` → `400 invalid_postcode` (**never** `serviced:false`). **One
   reason, two outcomes** (SC-001).
4. Try adding **3001** (PO-box, no locality) — accepted only after confirming the `unknown_postcode`
   warning (FR-010). Try adding 3121 to a second zone — refused, naming the zone that holds it (FR-009).

## §3 — Rings, a fee plan, and the standard quote (US1b → SC-003/004/005/006/016/017)

1. Delivery → Rings: create `INNER/MIDDLE/OUTER/EXTENDED` with ascending `suggest_upper_km` (EXTENDED
   open-ended). Set `delivery_settings` hub to Effy's Melbourne hub coordinates + a prep buffer.
2. On each zone press **Suggest ring**; confirm `MEL-INNER`→INNER, `REGIONAL`→OUTER/EXTENDED with a
   `hub_distance_km` shown (internal only). Override one and confirm `ring_is_overridden` records it.
3. Delivery → Plans: create **"Launch"** — `step 0.50`, `floor 4.00`, `cap 40.00`, `standard_factor 1.0`,
   `same_day_factor 1.8`, a `ring_price` per ring, and weight bands (see the
   [fee-engine contract](contracts/fee-engine.contract.md) fixtures). Try to activate with `OUTER`
   unpriced → refused `plan_incomplete missing_rings:[OUTER]` (SC-016). Fill it, activate.
4. Quote a basket to 3121 (INNER) and the same basket to a REGIONAL postcode → the **farther pays more**
   (SC-003). Quote a light vs a heavy basket to the same zone → the **heavier pays more, in slabs**
   (SC-004). Every fee ends `.00`/`.50`, ≥ floor, ≤ cap — **including a capped heavy+far basket** (SC-005).
5. Confirm the shown fee is **GST-inclusive** and the checkout total shows it **before payment**, and the
   captured order is charged **exactly** that (SC-006, no drip).
6. Quote the same basket fulfilled by shop A vs shop B → **same fee** (SC-017, destination-ring based).

## §4 — Same-day eligibility & the collection schedule (US2 → SC-010/012)

1. Delivery → Collection runs: add **one** run at 14:00 with a 120-min buffer → derived cutoff 12:00.
   Mark `MEL-INNER` `sameday_eligible`.
2. Quote to 3121 at 11:30 (Australia/Melbourne) → same-day **offered** (`sameDayAvailableUntil` = 12:00);
   at 12:30 → **standard only**, no refusal (SC-010, SC-012 — losing same-day never costs standard).
3. Add a **second** run at 17:00 → the cutoff extends (now a later quote can still make same-day) — the
   hybrid (R6). ⚠ Prove the wall-clock: the cutoff is judged in Australia/Melbourne, not UTC (FR-041).
4. Quote to the REGIONAL zone (not `sameday_eligible`) → same-day never offered; standard is (SC-012).

## §5 — Per-shop same-day exceptions (US3 → SC-011)

1. Delivery → Same-day exceptions: set shop A **off** in `MEL-INNER`.
2. A two-shop basket to 3121 where shop A and shop B both fulfil → same-day appears on **shop B's package
   only** (SC-011). Set shop A **on** for a non-eligible zone and confirm it flips just for shop A.
3. ⚠ Confirm the **shop** service exposes **no** route to eligibility or exceptions (SC-009) — attempt it
   directly, not only via the UI. Confirm every exception names the admin who set it.

## §6 — Multiple plans & quoted-fee immutability (US4 → SC-013)

1. Create a second plan "Peak" with higher `ring_price`s. Quote a basket under "Launch" and note the fee.
2. Activate "Peak"; a **new** quote costs more; the **already-quoted** order is finalised at its original
   fee (SC-013). Confirm zones and same-day eligibility are **unchanged** by the switch (FR-050).

## §7 — Product weight (US5 → SC-014)

1. `SELECT count(*) FILTER (WHERE weight_is_assumed) FROM public.product;` after migration — ⚠ **not 0 and
   not all**; the measured count matches products with a real `net_weight` attribute (R10). Stop and fix if
   the backfill count is degenerate.
2. In shop-web, record a real weight on an assumed product → it becomes `weight_is_assumed=false` and the
   quote reflects the new slab (SC-014).

## §8 — Guards, tests & no-leak sweep

- `go test ./...` (engine table test + container-backed serviceability/quote, `-short` skips DB) ·
  `pnpm -r typecheck` · `pnpm -r test` (both edge domains + config-contract tests) · the **Go↔Kotlin
  wire-contract** test · mobile `commonTest` (Android + iOS) · customer-web bundle within **174 KB**.
- ⚠ **No-PII sweep**: grep logs/metrics/telemetry for a postcode, suburb or coordinate — **none** may
  appear (SC-007; 025/030 R13). Grep any customer-facing DTO for a distance, ring name or shop id — none.
- ⚠ The **invariant alarm** (a served zone that fails to price) must be wired and must **not** fire in
  any §3–§6 quote.

## Sign-off

- All SC-001…SC-017 demonstrated live (the §-mapped proofs above), the no-leak sweep clean, the wire
  contract green, and the migration's weight backfill count asserted.
- ⚠ Carry-forwards recorded, not hidden: PostHog not yet initialised on customer-web (039) so web
  delivery events are wired but no-op; mobile telemetry deferred; working-day/holiday handling of the
  standard window is advisory copy, not a hard SLA (R6).
