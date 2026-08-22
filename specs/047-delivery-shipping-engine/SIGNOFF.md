# Sign-off: 047-delivery-shipping-engine

**Status**: ✅ **CONCLUDED (PARTIAL BY DESIGN) — 2026-08-22. Code-complete + machine-verified across the
hot path, both cold-path services, the back-office console, customer-web AND customer-mobile; DEPLOYED TO
DEV AND PROVEN LIVE on web + mobile** (serviceability, a snapped-up GST-inclusive fee, same-day gated by
the collection cutoff, and the not-deliver refusal were all observed on `dev.effyshopping.com` and the
iOS simulator against the live hot path + seeded dev data). Concluding closes the build work; it does not
make the residual operator items done — a full formal SC-001…SC-017 table walk, the `edge-shop` deploy,
and the commit remain, and are exactly the steps only the operator runs.

Reintroduces delivery after the four-slice build (021/030/031/032) was **withdrawn whole** on 2026-08-02.
The governing rule the rebuild is designed around (spec FR-001): **serviceability is one fact — is the
postcode in a served zone — and a served zone can never fail to produce a standard fee.** One decision,
one legible refusal — the failure that killed the last attempt.

## What was built

- **Data** — one forward-only migration `20260822001858_delivery_shipping_engine.sql`: `locality`,
  `delivery_ring`, `delivery_zone(_postcode)`, `delivery_fee_plan` (+`delivery_ring_price`,
  `delivery_weight_band`), `delivery_settings`, `delivery_collection_run`, `shop_sameday_exception`,
  `order_package_delivery`; `product` (+`weight_grams`/`weight_is_assumed` + `net_weight` backfill),
  `"order"` + `shop_fulfillment` delivery-capture columns. CHECK-enforced invariants: one active plan,
  one open-ended ring, a≥b, cap/floor as step-multiples, postcode-in-one-zone.
- **Reference data** — a committed G-NAF-derived `db/reference/au-localities.csv` + an idempotent Go loader
  `cmd/load-localities` (`make load-localities`). Provenance/attribution in `db/reference/README.md`.
- **Hot path (Go, `platform/delivery` + `storefront` + `checkout`)** — the **one** pure fee engine
  (`fee = clamp(roundUp(factor×(ring+weight), step), floor, cap)`, 11 invariant tests); serviceability +
  locality reads (public, cacheable, one shared predicate with the quote); the quote (standard +
  **same-day** + **per-shop exceptions**, per-package, SC-011) captured into intent/finalize; metrics
  (serviceability + quote-outcome + the served-zone-unpriced **invariant alarm**).
- **Cold path (`edge-api/admin/delivery`)** — zones (compose-by-place with the "also serves N places"
  disclosure + in-another-zone/unknown-postcode refusals), rings + Haversine ring **suggestion**, fee
  plans + the **activation completeness gate** (SC-016), collection runs, per-shop same-day exceptions,
  settings; RBAC from `admin.staff`; audit on every mutation; a config-contract test.
- **`edge-api/shop`** — product weight (measured/assumed; supplying a weight = measured) + a delivery-
  config **isolation guard** proving the shop service exposes no fee/zone/same-day route (SC-008/009).
- **Back-office console** — a Delivery section: Zones / Rings / Fee plans / Same-day (schedule +
  per-shop exceptions) / Settings. Tables + sectioned pages, no cards.
- **customer-web** — serviceability + the fee + the standard/same-day choice at checkout, shown before
  pay (no drip); a not-serviceable refusal that blocks pay; a "same-day isn't available" note when a
  served address has no same-day now.
- **customer-mobile** — the same at checkout (Clean-Arch/MVVM), generated Kotlin DTOs, and the Go↔Kotlin
  wire-contract test (both halves green).
- **Contracts** — customer-facing shapes in `@effy/shared-types/delivery.ts` (generated to Kotlin);
  admin shapes in `delivery-admin.ts`. ⚠ Money crosses as a 2-dp decimal string, never a float (027 R13);
  no distance / ring / shop identity ever enters a customer DTO (FR-018/033).

## The legal + integrity rules (researched before building)

GST-inclusive fees; the exact snapped-up fee shown **before payment** and charged unchanged (no drip,
unlawful under ACL s18); rounding **up** is Effy's own fee and lawful; a **floor** ("never lose money on a
delivery") and a **cap**. Same-day cutoff evaluated in **Australia/Melbourne** wall-clock, never UTC/device.

## Verification (machine)

- Go: 14 pkgs, 0 fails (engine table test + wire contract; container-backed reads/quote gated `-short`).
- TS: typecheck clean (shared-types, edge-admin, edge-shop, back-office, customer-web); edge-admin **191**,
  edge-shop **172**, back-office **79**, customer-web **366**.
- Mobile: Android host **272**, iOS test target compiles, `cm-guard` clean.
- No-PII sweep clean; customer-web bundle within 174 KB.

## Live proof (dev)

Migration + weight backfill applied; realistic Melbourne data seeded (`db/seeds/047_delivery_dev.sql`:
4 rings, 9 zones, active "Melbourne Launch 2026" plan, hub + 3 collection runs). On `dev.effyshopping.com`
and the iOS simulator: Richmond 3121 quoted a **$5.00** standard fee and (before the derived cutoff) a
same-day option; Geelong 3220 standard-only; Frankston 3199 "we don't deliver here yet". ⚠ A same-day
"not available after cutoff" observation confirmed the wall-clock gate is working (it was 16:35 Melbourne,
past the 14:00 cutoff) — an evening collection run was added so same-day stays testable into the evening.

## ⚠ Open (operator)

- **T057** — the deploys are largely live (core-api redeployed with the delivery endpoints, customer-web
  via Amplify, edge-admin driving the console); still to do: `make edge-deploy SERVICE=shop ENV=dev` (the
  product-weight backend, if not already), the **full formal SC-001…SC-017 table walk** (the informal
  walk covered the headline flows), and the **commit** (nothing is committed).
- ⚠ **Deploy ordering lesson**: customer-web went out ahead of core-api once, briefly blocking checkout
  (new web needs a quote the old core-api couldn't give). Deploy **core-api before customer-web**.
- **Carry-forwards**: the "same-day not available" note doesn't distinguish *past-cutoff* from
  *not-eligible* (a small backend addition would let it); mobile delivery telemetry deferred (as with
  prior mobile slices); PostHog still not initialised on customer-web (039), so web delivery events are
  wired but no-op; the committed locality CSV is a **17-row sample** — load the full G-NAF-derived dataset
  to widen zone coverage beyond the seeded suburbs; on-device (physical) mobile walk not done.

Spec/artifacts: [specs/047-delivery-shipping-engine/](.); operator guide:
[docs/delivery-console-guide.md](../../docs/delivery-console-guide.md).
