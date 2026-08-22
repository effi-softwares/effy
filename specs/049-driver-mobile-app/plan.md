# Implementation Plan: Driver Delivery App

**Branch**: `049-driver-mobile-app` | **Date**: 2026-08-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/049-driver-mobile-app/spec.md`

## Summary

Build the platform's **sixth and final client surface** — `apps/driver-mobile` (KMP + Compose, Clean
Architecture + MVVM) — and the backend it needs, so salaried Effy drivers run the **hub-and-spoke**
operation: a **collection run** (auto-assigned packages, ordered shop round, verify + collect) →
**hub check-in** (the same-day/standard split, standard staged for the external carrier) → a **same-day
delivery run** (multi-drop, proof of delivery). This closes the commerce → fulfilment → delivery loop and
retires the 020 dev-only `collected`/`delivered` stubs.

**Technical approach (the load-bearing decisions):**
- **Cold path for the entire driver backend** (Principle III). The driver is an internal, low-frequency,
  workflow audience — the exact profile 020 (shop fulfillment) and 009 (back-office provisioning) put on
  the cold path. A new `apis/edge-api/driver` service (driver-pool authorizer, `/driver/v1/*`) serves
  driver reads/writes; it writes `public.shop_fulfillment` transitions the 020 way.
- **Auto-assignment = a scheduled sweep worker**, not an event consumer — because the **SNS/SQS event
  backbone does not exist yet** (only an `event_outbox` table). An EventBridge-scheduled Lambda sweeps for
  assignable work (`ready_for_pickup` portions; checked-in same-day packages) and assigns to eligible
  on-duty drivers. This is Principle III's "async worker on the cold path" and meets SC-003 (≤30 s) with a
  ~30 s cadence; it becomes event-driven for free when the bus lands.
- **Reuse 047 and 020, don't rebuild.** The **hub** is 047's `delivery_settings` singleton (hub lat/lng);
  **collection runs** are 047's `delivery_collection_run`; a **package** is a `shop_fulfillment` row and
  **its method** is `order_package_delivery.method` for the same `(order_id, shop_id)`; a **drop** groups an
  order's same-day packages by the order's customer address.
- **Reuse the mobile spine.** `apps/driver-mobile` mirrors `customer-mobile`/`shop-mobile` (KMP structure,
  `packages/mobile-kit` nav shell, `design-system` `compose-driver` theme already wired by 017), and a
  `commonMain` `AuthDriver` shaped like shop's — **strictly passwordless 6-digit EMAIL_OTP, single access
  token** to `/driver/v1/*`. A dedicated `driver_mobile` Cognito app client is added (mirroring
  `shop_mobile`).
- **New capabilities, scoped to later priorities**: the in-app **map** (US4/P2) and **masked contact**
  (US4/P2) are net-new to the platform; **push** (US6/P3) needs the notifications path. P1 (US1 collection
  run + US2 same-day delivery run) ships without any of them — text addresses + external-maps hand-off.

## Technical Context

**Language/Version**: Kotlin 2.4.0 (KMP) + Compose Multiplatform 1.11.1 (mobile); Node 22 + TypeScript
(cold-path Lambdas, Serverless Framework, arm64); SQL for PostgreSQL 16 (Goose, forward-only).

**Primary Dependencies**: Compose Multiplatform, Ktor client, AWS Amplify (Cognito, driver pool),
`@effy/design-system` (compose-driver theme), `packages/mobile-kit` (nav shell), `@effy/edge-shared`
(cold-path lib: authorizer wiring, pg, media presign); `@effy/shared-types` (DTO SSOT → generated Kotlin).
New mobile capability: a map view (MapLibre — see research) behind an `expect/actual` driver.

**Storage**: PostgreSQL 16, `public` schema, raw SQL, repository pattern, **no ORM**. New driver tables;
reuses `shop_fulfillment`, `order`, `customer_address`, `order_package_delivery`, `delivery_settings`,
`delivery_collection_run`, `delivery_zone`. Proof media in the existing private S3 media bucket (presigned).

**Testing**: KMP `commonTest` (Android host + iOS simulator compile+run); Vitest (edge-driver +
edge-admin drivers domain, config-contract tests reading real `serverless.yml`); Go untouched;
`terraform validate`/`fmt`; a Go↔Kotlin wire-contract test for the driver DTOs (028/035 precedent).

**Target Platform**: Android (minSdk 24 / target 36) + iOS; phone-first, portrait. No web.

**Project Type**: Mobile app + cold-path backend service + a scheduled worker + Terraform.

**Performance Goals**: assignment visible ≤30 s of eligibility (SC-003, sweep cadence); step-advance is
one action (SC-001); offline queue applies exactly once (SC-007).

**Constraints**: monochrome design system, WCAG AA both modes, 48dp targets (Principle V); auth isolation
(Principle IV, driver pool only); no currency shown anywhere; no-PII telemetry.

**Scale/Scope**: a small driver fleet (tens, not thousands) in dev; 46 designed screens; P1 is the MVP.

## Constitution Check

*GATE: evaluated pre-Phase 0 and re-checked post-design. Constitution v1.13.0.*

- **I. Spec-Driven** — ✅ spec + clarifications committed; this plan cites the constitution; a downstream
  gap (the driver operating model) was already fixed at the root (CLAUDE.md + spec), not patched in code.
- **II. Monorepo + Shared Contracts** — ✅ driver DTOs added to `@effy/shared-types`, generated to Kotlin;
  cold-path service reuses `@effy/edge-shared` (authorizer, pg, media presign — no copy-paste); the
  S3-presign helper already lives in edge-shared (promoted in 028). No cross-cutting duplication.
- **III. Dual-Path Discipline** — ✅ **cold path**, justified: internal low-frequency workflow audience;
  precedent 020/009. The assignment worker is an async cold-path worker. **No hot-path change** — keeping
  the customer-scoped hot path free of a driver authorizer preserves isolation. (Recorded, no exception
  needed.)
- **IV. Auth Isolation** — ✅ driver pool only; per-pool JWT authorizer already provisioned by the gateway;
  a new `driver_mobile` app client added and registered in the driver authorizer's `extra_client_ids`. The
  platform **`driver` record is authoritative** for the access decision (status/zone/hub); a valid token
  never overrides a disabled driver. Passwordless 6-digit EMAIL_OTP via the 035 custom challenge (the
  driver pool already has it). Single access-token bearer (shop-mobile D2s pattern).
- **V. Native-Feel Design** — ✅ monochrome via `design-system` `compose-driver` (no new hue; the two
  semantic colours only); General Sans; dark mode + Light/Dark/Follow-System; 48dp targets;
  micro-animations (swipe-to-confirm, success). **No card layouts** — lists/detail rows/sectioned pages
  and the one justified exception the design already uses (the single active-run sheet over a map, US4).
  The v2 handoff is monochrome and matches the model.
- **VI. Layered Architecture** — ✅ three-layer slices both sides (edge handler → service/use-case →
  repository, raw SQL); mobile MVVM (ViewModel → UseCase → Repository/Driver), immutable observable state;
  explicit wiring, no DI framework; **idempotent** writes (per-action `changeId`) for the offline queue and
  the reassignment race. One event language: n/a until the bus lands; the worker is idempotent regardless.
- **VII. Observability & Telemetry** — ⚠ **partial, consistent with precedent.** Backend: structured logs
  + metrics (assignment latency, unassigned-work gauge, proof-upload failures) + an alert on stale
  unassigned work; Crashlytics on mobile via `core/platform`. **Mobile PostHog product events are declared
  but emission is deferred** — every prior mobile slice (013/014/028/033/046/047) deferred mobile
  telemetry, and PostHog is still not initialised on any mobile surface. Recorded as a carry-forward, not a
  silent gap. Push (US6) routes through the platform notifications path when built.

**Gate result: PASS.** No violations requiring Complexity Tracking. The one nuance (VII partial) matches
standing platform precedent and is explicitly recorded.

## Project Structure

### Documentation (this feature)

```text
specs/049-driver-mobile-app/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions (path, assignment, map, masked contact, proof, auth)
├── data-model.md        # Phase 1 — driver/duty/run/task/proof/notification tables + reuse map
├── quickstart.md        # Phase 1 — end-to-end validation walk (collection → hub → delivery → proof)
├── contracts/
│   ├── driver-api.contract.md        # /driver/v1/* (mobile-facing)
│   └── admin-drivers.contract.md     # minimal back-office driver provisioning (/admin/v1/drivers)
├── spec.md
└── checklists/requirements.md
```

### Source Code (repository root)

```text
apps/driver-mobile/                      # 6th surface — build out from base template
└── shared/src/commonMain/kotlin/com/effyshopping/driver/mobile/
    ├── core/{auth,http,session,nav,theme,platform,storage,config,error,presentation}
    ├── app/                             # container (explicit wiring), root nav
    └── features/
        ├── auth/          # passwordless EMAIL_OTP (AuthDriver), permission priming
        ├── duty/          # on/off duty, phase-aware "Today" home
        ├── collection/    # collection run overview, shop stop verify+collect, report problem
        ├── hubcheckin/    # the pivot: split + end-run
        ├── delivery/      # same-day run, drop detail, en-route/arrived, proof, failed
        ├── map/           # per-run map (US4, P2) — expect/actual map driver
        ├── history/       # runs + drops by day, detail
        ├── notifications/ # in-app activity feed (US6)
        └── account/       # identity/zone/hub/vehicle, appearance, help, sign out

apis/edge-api/driver/                    # NEW cold-path service (driver authorizer, /driver/v1/*)
├── src/{me,duty,collection,hubcheckin,delivery,proof,history,activity}/
├── src/assignment/                      # the scheduled sweep worker (EventBridge)
├── src/lib/                             # service-local wiring (reuses @effy/edge-shared)
└── serverless.yml

apis/edge-api/admin/src/drivers/         # NEW: minimal driver provisioning (Cognito + record), like shops/

packages/shared-types/src/driver.ts      # DTO SSOT (WireInt for counts; → generated Kotlin)

db/migrations/<ts>_driver_delivery.sql    # forward-only: driver, duty, run, task, drop, proof, events, activity

infra/envs/dev/
├── auth-driver.tf                        # + aws_cognito_user_pool_client.driver_mobile (+ SSM)
├── edge-gateway.tf                       # driver authorizer extra_client_ids += driver_mobile
└── edge-driver.tf (or reuse deploy)      # EventBridge schedule for the assignment worker; IAM (SES/S3/Cognito as needed)
```

**Structure Decision**: Mobile + cold-path API + scheduled worker + Terraform. The mobile app mirrors the
two existing KMP apps exactly; the backend is a new cold-path edge service plus a minimal `drivers/` domain
in the existing `edge-api/admin` for provisioning. No hot-path (`core-api`) change.

## Key design decisions (detail in research.md)

1. **Path = cold** (Principle III), with the assignment worker as a scheduled Lambda (no event bus yet).
2. **Reuse 047 hub + collection runs; a package = `shop_fulfillment`; method from `order_package_delivery`.**
3. **Runs & typed tasks**: `driver_run` (type collection|same_day_delivery) groups `collection_task` /
   `delivery_task`; a `delivery_task` (drop) aggregates an order's same-day packages via a join.
4. **Idempotency everywhere**: per-action `changeId` on every write (offline queue + reassignment race);
   the worker assigns under `FOR UPDATE SKIP LOCKED` so a package is never double-assigned.
5. **Map (US4/P2) = MapLibre** behind `expect/actual`, custom monochrome style; external hand-off for
   turn-by-turn. **Masked contact (US4/P2)** affordance built; the masking relay is a recorded dependency
   (likely a provider integration or a follow-on) — v1 may ship the affordance disabled/limited.
6. **Proof media**: private S3 via presigned PUT (reuse edge-shared media presign); photo + signature (as
   image) + code (verified) + contactless; a drop cannot reach `delivered` without a stored proof.
7. **Provisioning**: minimal `admin/drivers` (Cognito-first → record, 006/009 pattern; RBAC admin/manager).

## Complexity Tracking

No constitution violations require justification. (The single active-run sheet over the map is the one
permitted card exception under Principle V, recorded in US4.)
