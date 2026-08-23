# Sign-off: 049 — Driver Delivery App

**Status: CONCLUDED (PARTIAL BY DESIGN) — 2026-08-23. 54/61 tasks (7 deferred). DEPLOYED TO DEV; P1 loop WALKED LIVE.**

The platform's **sixth and final client surface** — the Effy Driver app (`apps/driver-mobile`, KMP
Android + iOS) — plus the cold-path service, the auto-assignment worker, and minimal back-office
provisioning it needs. Closes the **commerce → fulfilment → delivery loop** and **retires the 020
dev-only `collected`/`delivered` stubs**: the driver app is now the real writer of those transitions.

## The model (settled 2026-08-22; recorded in CLAUDE.md "Driver logistics model")

Effy drivers are **not per-delivery couriers**. Hub-and-spoke: **collection run** (auto-assigned packages,
ordered shop round) → **hub check-in** (the same-day/standard split, already known from checkout 047;
standard handed to an external carrier) → **same-day delivery run** (multi-drop, proof of delivery). Work
is **typed tasks** (`collection` / `same_day_delivery`), not driver roles. One central hub.

## Built & verified (all 7 user stories)

- **US1 collection run** (P1) — ✅ auto-assigned, verify+collect per shop, hub check-in split.
- **US2 same-day delivery run** (P1) — ✅ ordered drops, lifecycle, proof (code · contactless · signature ·
  photo-on-Android), success → order `delivered`.
- **US3 exceptions** — ✅ report missing/short; mark undeliverable; standard → carrier at check-in.
- **US4 map & navigation** — 🚧 external navigate hand-off ✅; masked contact affordance (relay deferred, R6);
  **in-app pinned map ⛔ blocked on geodata** (shops/orders carry no coordinates — research R13).
- **US5 history** — ✅ both record types, timeline + proof, read-only.
- **US6 notifications** — ✅ in-app activity feed; **push (FCM/APNs) is a deferred platform-wide slice** (R14).
- **US7 account** — ✅ identity/zone/hub/vehicle rows, appearance, sign out.
- **Cross-cutting** — ✅ offline write queue (exactly-once by `changeId`, FR-039/040); ✅ permission priming
  (T009); ✅ return-to-pool + off-duty-mid-run guard (FR-011); ✅ missed-cutoff flag (T061).

## Data / backend / infra

- Migrations: `20260822120000_driver_delivery.sql` (11 tables) + `20260822130000_delivery_task_address_nullable.sql`.
- Cold-path `apis/edge-api/driver` — 23 functions (identity/duty/today, collection, hub check-in, delivery,
  proof, history, activity, masked-contact stub) + the scheduled **assignment worker**.
- `apis/edge-api/admin/src/drivers` — provisioning (Cognito-first → record). ⚠ Needed
  **`versionFunctions: false`** on the admin service — the new routes tipped its CloudFormation stack past
  the 500-resource limit (zero runtime change; removes unused Lambda Versions).
- Terraform: `driver_mobile` Cognito client + gateway authorizer registration.
- Reuse over rebuild (research R3): hub = 047 `delivery_settings`; schedule = `delivery_collection_run`;
  package = `shop_fulfillment`; method = `order_package_delivery.method`.

## Verification (machine)

- `pnpm -r typecheck` 15/15 · edge-driver Vitest (9, incl. real-`serverless.yml` config-contract) ·
  edge-admin (199 + driver provisioning) · shared-types↔Kotlin driver contract drift-guard (counts as
  integers) · terraform validate/fmt.
- driver-mobile: **iOS main + test compile · Android main compile · `testAndroidHostTest` 24 tests, 0
  failures** (collection/delivery/history/activity ViewModels + offline queue) · `mobile-guard` clean.
- Banned-address + source-secret sweeps clean.

## Deployed & walked

Operator deployed to dev (`make db-up`, `make edge-deploy SERVICE=driver`+`SERVICE=admin`, Terraform apply,
worker schedule on) and **walked the P1 loop on device**: sign in → on duty → auto-assigned collection run
→ collect → hub check-in (split) → same-day run → deliver with proof → order `delivered`.

## Deferred (by design — NOT gaps to fix here)

- **In-app pinned map / MapLibre canvas** — blocked on geodata; add `shop.address` + geocode
  `order.delivery_address` to unblock (R13).
- **FCM/APNs push** — its own platform-wide notifications slice consuming the existing `driver_activity`
  rows; per constitution VII, never ad hoc per feature (R14).
- **iOS photo capture** — needs a Swift `UIImagePicker`/`PHPicker` bridge (signature/code/contactless work
  on iOS today).
- **Masked-contact relay** — a telephony/relay integration; the app never exposes a real number (R6).
- **Polish phase (T053–T059)** — loading skeletons/error/offline-banner states, telemetry (Crashlytics +
  the declared PostHog taxonomy — deferred like every prior mobile slice), and the full formal SC-table
  operator walk. Explicitly out of this conclusion at the operator's direction.

## Not committed

Per the operator's standing preference, nothing in this slice was committed by the assistant.
