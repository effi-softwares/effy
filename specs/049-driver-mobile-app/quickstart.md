# Quickstart / Validation: Driver Delivery App (049)

How to prove the slice works end to end. Operator-run steps (cloud/DB/deploy) are marked ⚙ per the
platform's mode-of-work — Claude authors, the operator runs anything touching live AWS/DB. Region
`ap-southeast-2`, `AWS_PROFILE=ef`.

## Prerequisites

- 019/020 in dev: a paid order fans out to `shop_fulfillment`; a shop can advance a portion to
  `ready_for_pickup` (shop-web/shop-mobile, 020).
- 047 in dev: `delivery_settings` (hub lat/lng) seeded; ≥1 `delivery_collection_run`; served zones; at
  least one order with a **same-day** `order_package_delivery` row and one **standard**.
- ⚙ Migration applied: `make db-up ENV=dev` (the `driver_delivery` migration).
- ⚙ Infra applied: `driver_mobile` app client + gateway `extra_client_ids`; `edge-api/driver` deployed
  (`make edge-deploy SERVICE=driver ENV=dev`); `edge-api/admin` redeployed (adds `drivers/` + driver-pool
  IAM); the assignment worker's EventBridge schedule enabled.

## Setup

1. ⚙ **Provision a driver** (back-office API, since no console UI yet): `POST /admin/v1/drivers`
   `{ name, workEmail, zoneId }`. Confirm a driver-pool Cognito user + a `public.driver` row (active).
2. Build/run the app: `apps/driver-mobile` on an Android emulator (API 36) and an iOS simulator.
3. Seed assignable work: ensure ≥2 shops' portions for one served-zone order are `ready_for_pickup`, with a
   mix of same-day and standard packages (a second order for the same customer from another shop proves the
   one-drop grouping, SC-006).

## US1 — Collection run (P1)

1. **Sign in**: enter the work email → 6-digit code → home. Confirm **no** sign-up/password path anywhere
   (FR-001), and a disabled driver is refused even with a valid code (FR-002 / SC-008).
2. **Go on duty** (FR-005). Within ~30 s the assignment worker assigns a collection run; the phase-aware
   home shows **Collection run** active with the first shop stop (FR-021, SC-003).
3. Open a shop stop → verify the **package manifest** (ref, destination suburb, method) → swipe to
   **collect** (FR-014). Confirm the package's `shop_fulfillment` is now `collected`.
4. Report a **missing/short** package on one stop (FR-015); confirm the rest still collect.
5. Collect the remaining shops. When all are terminal, **hub check-in** shows the scanned total + the
   **same-day/standard split** (FR-016); confirm **standard packages are staged for the carrier** and leave
   active work (FR-017). Swipe to end the run.

## US2 — Same-day delivery run (P1)

6. Hub check-in unlocks the **same-day delivery run**; the home flips to phase 2 (FR-021). Confirm a
   customer with same-day packages from two shops appears as **one drop** (FR-018, SC-006).
7. Open a drop → address + instructions + packages (FR-020). Advance `out_for_delivery → en_route →
   arrived` (FR-019), each in one action (SC-001).
8. **Complete with proof** — run all four at least once across drops: photo (capture/review/retake),
   delivery code (valid + invalid), signature (draw/clear), contactless + note (FR-024/025). Confirm a drop
   **cannot** reach delivered without a proof (FR-026), the proof is stored privately, and the order/
   fulfilment reaches `delivered` — **replacing the 020 dev stub** (SC-011).
9. Success state + "Next" (FR-027). Mark one drop **undeliverable** with a reason (FR-028); confirm it
   leaves the active run in a failed state recorded for back-office.

## US3–US7 (P2/P3)

- **US4 map/contact**: per-run map (shops→hub, hub→drops), monochrome, external navigate hand-off (FR-029);
  masked contact returns a relay handle **or** `503` while the relay is unbuilt (R6) — confirm the client
  hides/disables it gracefully.
- **US5 history**: both record types (collection runs + same-day drops with proof), read-only (FR-033/034).
- **US6 notifications**: in-app activity feed populated by assignment/ready events (FR-032); push when the
  notifications path lands.
- **US7 account**: identity/zone/**hub**/vehicle as detail rows; appearance Light/Dark/Follow-System
  persists; sign out (FR-035/036/037).

## Cross-cutting

- **Offline** (FR-039/040): airplane-mode a collect/deliver action; confirm it queues and applies **exactly
  once** on reconnect (SC-007) — retried with the same `changeId`.
- **Isolation** (SC-008): a second driver cannot see/act on the first driver's run (uniform 403).
- **Design** (SC-009/010): every screen light+dark, AA contrast, no hue beyond the ramp + two semantic
  colours; every action/row ≥48dp.
- **No currency** anywhere (SC-012); no earnings/tips/offers surfaces.

## Machine verification (pre-operator)

- `pnpm -r typecheck` + `pnpm -r test` (edge-driver, edge-admin drivers domain, config-contract tests
  reading the real `serverless.yml`).
- Driver-mobile `:shared:testAndroidHostTest` + iOS simulator compile **and** test; `mobile-guard`;
  `cm-tokens-check`-equivalent for `compose-driver`.
- Go↔Kotlin **wire-contract** test for the driver DTOs (counts as integers, not floats).
- `terraform validate`/`fmt`; banned-address + source secret sweeps.
