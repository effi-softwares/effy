---

description: "Task list for 050-observability-push-foundation"
---

# Tasks: Platform Observability & Push Notification Foundation

**Input**: Design documents from `/specs/050-observability-push-foundation/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included **selectively** — only the checks the design names as its enforcement mechanism
(taxonomy drift, no-PII sweep, config-contract, FCM wire contract, idempotency/prune). Not full TDD.

**Organization**: By user story (priority order from spec.md): **US1** P1 → **US2** P2 → **US4** P2 →
**US3** P3. Each story is an independently deliverable increment.

**Conventions**:
- Mobile package roots: `apps/{customer,shop,driver}-mobile/shared/src/{commonMain,androidMain,iosMain}/kotlin/com/effyshopping/{customer,shop,driver}/mobile/`. The three apps are **independent Gradle builds** — per-app tasks are `[P]` (different files).
- No account exists yet: everything degrades to a **safe no-op** until the operator supplies credentials (quickstart §A). Claude authors Terraform/migration/serverless; the **operator** runs `apply`/`db-up`/`edge-deploy` (CLAUDE.md mode of work).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Shared contracts, config plumbing, and infra scaffolding used across stories.

- [X] T001 [P] Add device-registration DTOs + `platform`/`audience` enums to `packages/shared-types/src/device.ts` and export from `packages/shared-types/src/index.ts` ([contracts/device-registration](contracts/device-registration.contract.md))
- [X] T002 [P] Add `docs/telemetry/driver-events.md` and extend the taxonomy SSOT with shared `screen_viewed` + push events (`push_permission_*`, `notification_opened`) per [contracts/telemetry-taxonomy](contracts/telemetry-taxonomy.contract.md)
- [X] T003 [P] Author `infra/envs/dev/telemetry.tf` — SSM params `/effy/dev/telemetry/{posthog_host,posthog_project_key,enabled}` ([contracts/config](contracts/config.contract.md)); **pin `posthog_host` to the region matching the platform's jurisdiction** (AU / `ap-southeast-2`) and record it as a verified value (FR-029); operator applies (quickstart §A2/A3)
- [X] T004 [P] Author `infra/envs/dev/notifications.tf` — Secrets Manager ref `/effy/dev/notifications/fcm_service_account`, SSM `/effy/dev/notifications/fcm_project_id`, notifications-worker IAM (secrets read, DB, no wildcards); operator applies
- [X] T005 [P] Add `google-services.json` and `GoogleService-Info.plist` to `.gitignore` for all three apps (git-ignored build inputs, FR-031)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build/config plumbing every client-side story needs. **⚠️ No user story work begins until this is done.**

- [X] T006 Add Firebase **Android** plumbing to each `apps/{customer,shop,driver}-mobile/androidApp/build.gradle.kts`: Google Services + Crashlytics Gradle plugins + `firebase-messaging`/`firebase-crashlytics` deps, with a **loud build failure** if `google-services.json` is missing (research R3, FR-031)
- [ ] T007 Add Firebase **iOS** plumbing to each `apps/{customer,shop,driver}-mobile/iosApp` project: Firebase Messaging + Crashlytics pods/SPM, and a **dSYM upload Run-Script build phase** that copies the shared KMP framework dSYM out of its symlink first (research R3 — else iOS traces are unreadable)
- [X] T008 [P] Web telemetry config: read PostHog key/host/enabled in `apps/customer-web/lib/config.ts` (`posthogConfig()` already referenced), `apps/shop-web/src/lib/env.ts`, `apps/back-office/src/lib/env.ts` ([contracts/config](contracts/config.contract.md))
- [X] T009 [P] Kill-switch reader: gate telemetry init on `telemetry/enabled` **before any SDK loads** at bootstrap on all six surfaces (mobile `AppConfig`, web config) — analytics-only scope (FR-026, clarification Q3)
- [X] T010 [P] Extend each app's `core/config/AppConfig.kt` with telemetry (posthog key/host/enabled) + push (fcm project) config fields, wired from the platform config source

**Checkpoint**: Firebase + PostHog config plumbing ready; stories can begin.

---

## Phase 3: User Story 1 — Crash & error visibility (Priority: P1) 🎯 MVP

**Goal**: Every mobile app reports fatal crashes + non-fatal errors (Crashlytics); every web surface captures runtime errors (PostHog) — attributed, symbolicated, PII-free.

**Independent Test**: Force a crash in each mobile app and an error on each web surface → each appears in its dashboard within 5 min with a readable trace and no PII (SC-001, SC-004).

- [X] T011 [P] [US1] `CrashReporter` expect interface (`init()`, `logNonFatal(t, keys)`, `setSubject(sub?)`) + Android (Firebase Crashlytics) + iOS actuals in `apps/customer-mobile/.../core/observability/`
- [X] T012 [P] [US1] Same `CrashReporter` (common + android + ios) in `apps/shop-mobile/.../core/observability/`
- [X] T013 [P] [US1] Same `CrashReporter` (common + android + ios) in `apps/driver-mobile/.../core/observability/`
- [X] T014 [US1] Wire `CrashReporter` into each app's `AppContainer.kt`; init off-main-thread after first frame; call `setSubject(sub)` on session change and clear on sign-out (depends on T011–T013)
- [ ] T015 [P] [US1] Debug-only "force crash" + "log non-fatal" affordance in each app's Account/settings (validation of SC-001; excluded from release builds)
- [X] T016 [US1] Web error tracking: ensure `apps/customer-web/lib/telemetry.ts` `reportError`/`$exception` path is reachable (wire the `(shop)/error.tsx` + a top-level error boundary to it) and initialised for error capture independent of analytics consent (clarification Q1)
- [X] T017 [P] [US1] Consoles: call `telemetry.init()` + route runtime errors to `reportError` in `apps/shop-web/src/main.tsx` and `apps/back-office/src/main.tsx` (`@effy/web-kit createTelemetry`, `surface` stamped)
- [ ] T018 [P] [US1] Host test: crash keys/breadcrumbs carry only `sub` + technical fields — **no PII** (FR-003/022); one per app under `commonTest`
- [ ] T019 [US1] Verify symbolication wiring: Android mapping upload on release build + iOS dSYM upload phase produce readable traces (SC-001/FR-004) — documented check in quickstart §B. **Also verify fail-open (FR-005/SC-007): a misconfigured/unreachable crash driver leaves the app fully functional** (host test or documented walk)

**Checkpoint**: Crash/error visibility live on all six surfaces — MVP shippable.

---

## Phase 4: User Story 2 — Product analytics across surfaces (Priority: P2)

**Goal**: All six clients emit the typed shared taxonomy to PostHog; web+mobile events for one audience align in a funnel.

**Independent Test**: Run a known action sequence per surface → taxonomy-named events arrive with correct `surface` + `sub` + non-PII props; build a customer funnel spanning web+mobile (SC-002); an ad-hoc event name is rejected (SC-010).

- [X] T020 [P] [US2] `AnalyticsDriver` expect (`init`, `screen`, `capture(event)`, `identify(sub)`, `reset`, `optOut`) + PostHog Android/iOS actuals (autocapture off, screenViews off, identified_only, **session replay OFF**) in `apps/customer-mobile/.../core/observability/`
- [X] T021 [P] [US2] Same `AnalyticsDriver` (common + android + ios) in `apps/shop-mobile/.../core/observability/`
- [X] T022 [P] [US2] Same `AnalyticsDriver` (common + android + ios) in `apps/driver-mobile/.../core/observability/`
- [X] T023 [P] [US2] `sealed class AnalyticsEvent` mirroring the documented taxonomy in each app's `core/observability/AnalyticsEvent.kt` (customer: commerce funnel; shop: fulfilment; driver: workflow — [contracts/telemetry-taxonomy](contracts/telemetry-taxonomy.contract.md))
- [X] T024 [P] [US2] Taxonomy **drift-check** host test per app: emitted event names ⊆ documented set (research R8; fails and names the offender)
- [ ] T025 [US2] Wire `AnalyticsDriver` into each `AppContainer`; `identify(sub)` on sign-in / `reset()` on sign-out; emit `screen_viewed` on each screen + the app's key funnel events (depends on T020–T023)
- [X] T026 [US2] customer-web: wire the consent affordance to call the existing `initAnalytics()` (never called today) + add pageview/screen + `notification_opened`; keep the **dynamic import** (protects the 174 KB gate, research R9). **Assert client-side navigation produces exactly one view event per route change — no missed/duplicated views (FR-011)**, mirrored in the mobile `screen_viewed` host test (T024/T025)
- [X] T027 [P] [US2] Consoles: emit their existing fulfilment/admin taxonomy through `telemetry.track` now that `init()` is called (T017); analytics **on by default** (internal, clarification Q4)
- [X] T028 [US2] Reverse proxy: add a first-party PostHog ingest rewrite under a non-obvious path in `apps/customer-web/next.config.ts` (FR-028, research R9); decide/console proxy in the same task
- [X] T029 [US2] Config-contract test: each surface reads the PostHog key/host from config (not a literal) and no-ops when absent (SC-007) — mirrors the platform's existing config-contract test pattern

**Checkpoint**: Analytics live on all six surfaces with one taxonomy.

---

## Phase 5: User Story 4 — Privacy & performance guardrails (Priority: P2)

**Goal**: No PII beyond `sub`; consent honored (customer); measurable no performance regression; kill switch works without a release.

**Independent Test**: PII audit finds zero leaks; cold-start delta ≤50 ms and bundle gate unchanged; decline-consent stops customer analytics; kill switch stops analytics live (SC-004/005/006).

- [ ] T030 [US4] Mobile consent state: a device-pref `ConsentStore` (customer app) gating `AnalyticsDriver.init`; crash reporting stays independent (clarification Q1); internal apps on-by-default, no opt-out UI (Q4)
- [ ] T031 [US4] customer-web + customer-mobile consent affordance (accept/decline) that on decline never loads the analytics SDK, and a customer opt-out control (FR-023)
- [X] T032 [P] [US4] No-PII source sweep: a `scripts/` check (+ CI wire) asserting no analytics/crash/notification payload references email/name/phone/address/postcode/total/query/token fields (FR-022, SC-004)
- [ ] T033 [US4] Performance: confirm all mobile drivers init off-main-thread + async/batched flush; capture cold-start delta (telemetry on vs off) → ≤50 ms (SC-005)
- [X] T034 [P] [US4] Re-run the customer-web bundle gate; confirm `/` and guest routes stay ≤174 KB with analytics initialised (SC-005, research R9/R11)
- [X] T035 [P] [US4] Assert **session replay OFF** on all mobile + web PostHog configs (research R11) — a config test
- [ ] T036 [US4] Kill-switch end-to-end: flipping `telemetry/enabled=false` stops analytics init on next client start on all six surfaces, leaving crash + push on (FR-026, clarification Q3)

**Checkpoint**: Privacy + performance constraints proven; analytics/crash foundation complete and safe.

---

## Phase 6: User Story 3 — Push notifications (Priority: P3)

**Goal**: Device tokens registered per audience; a cold-path worker sends the starter notification set idempotently via FCM; dead tokens self-prune; taps deep-link.

**Independent Test**: Register on each app; cause each starter event → correct recipient notified within 30 s; re-delivery never duplicates; dead token pruned; tap deep-links (SC-003/008/009).

### Data & registration

- [X] T037 [US3] Migration `db/migrations/<ts>_observability_push.sql` — `device_token` + `notification_request` per [data-model.md](data-model.md); operator commits + `make db-up`
- [X] T038 [P] [US3] Device slice in `apis/edge-api/customer/src/devices/` — `POST /customer/v1/devices` + `DELETE .../{token}`, handler→service→repository, raw SQL upsert on `fcm_token`, `sub` from JWT ([contracts/device-registration](contracts/device-registration.contract.md))
- [X] T039 [P] [US3] Device slice in `apis/edge-api/shop/src/devices/` — `/shop/v1/devices` (shop authorizer)
- [X] T040 [P] [US3] Device slice in `apis/edge-api/driver/src/devices/` — `/driver/v1/devices` (driver authorizer)
- [X] T041 [P] [US3] Device-endpoint tests (upsert/rotation no-dup, cross-pool 401, delete-only-own, no-PII) — per service (SC-008/009, FR-020)

### Mobile push client

- [X] T042 [P] [US3] `PushTokenProvider` expect + Android (`FirebaseMessaging` + a `FirebaseMessagingService`) + iOS (APNs→FCM) actuals in `apps/customer-mobile/.../core/push/`
- [X] T043 [P] [US3] Same `PushTokenProvider` (common + android + ios + service) in `apps/shop-mobile/.../core/push/`
- [X] T044 [P] [US3] Same `PushTokenProvider` (common + android + ios + service) in `apps/driver-mobile/.../core/push/`
- [X] T045 [US3] `RegisterDeviceToken` use case per app + wire into `AppContainer`; register on sign-in/permission-grant + on token refresh; `DELETE` on sign-out (shared-device safety, FR-020)
- [ ] T046 [US3] Permission priming + OS prompt per app; emit `push_permission_prompted/_granted/_denied`; **no push attempted without permission/token** (FR-019). OS-level only — no preferences table (clarification Q2)
- [ ] T047 [US3] Notification-tap deep-link handling per app: resolve `data.deepLink`/`entityId` → route to order / pick queue / assigned run; emit `notification_opened { type }` (FR-017)

### Backend sending

- [X] T048 [US3] New cold-path service `apis/edge-api/notifications/serverless.yml` — attaches to shared HTTP API, `schedule: rate(1 minute)` worker, `firebase-admin` dep, service-account secret + DB env (research R1/R6)
- [X] T049 [US3] FCM sender `apis/edge-api/notifications/src/fcm/` — `firebase-admin sendEach`, builds payload per [contracts/fcm-payload](contracts/fcm-payload.contract.md), maps `token-not-registered`→prune, 429/5xx→retry
- [X] T050 [US3] Worker `apis/edge-api/notifications/src/worker/` + `repository/` — claim `pending` (`FOR UPDATE SKIP LOCKED`), resolve tokens, send, set `sent`/`skipped`/`failed`, prune dead tokens, idempotent ([contracts/notification-request](contracts/notification-request.contract.md))
- [X] T051 [P] [US3] Worker tests: idempotency via `dedupe_key`, no-token→`skipped` (not failed), dead-token prune, attempt-cap→`failed` (SC-003/009, FR-016/018)

### Producers (append notification intents, in-transaction)

- [X] T052 [US3] core-api (hot): `apis/core-api/internal/features/notifications/` producer helper + one `INSERT` into `notification_request` on the order→`paid` transition in `apis/core-api/internal/features/checkout/store.go` (`order_paid`)
- [X] T053 [P] [US3] edge-shop producers: append `shop_new_order` (fulfilment created) + `order_ready` (→`ready_for_pickup`) in `apis/edge-api/shop/src/fulfillments/`
- [X] T054 [P] [US3] edge-driver producers: append `run_assigned` + `order_out_for_delivery` + `order_delivered` in `apis/edge-api/driver/src/{delivery,assignment}/`
- [X] T055 [P] [US3] Go↔worker **wire-contract test** for the FCM `data` payload keys (`type`/`deepLink`/`entityId`) — byte-pinned so producers and worker cannot drift (research R6, 028 precedent)
- [X] T056 [US3] Worker metrics + alert: `notification_send_{succeeded,failed}`, `device_token_pruned`; alert on sustained send-failure via the existing CloudWatch→alerts SNS (Principle VII)

**Checkpoint**: Full push loop live for the starter set; commerce→fulfilment→delivery notifications reach the right audiences.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T057 [P] Update parity registers: `docs/audiences/{customer,shop,driver}-capabilities.md` §050 (crash/analytics/push rows)
- [X] T058 [P] Update CLAUDE.md § Current status / Active feature for 050 (closes the "PostHog never initialised" + "mobile telemetry deferred" carry-forwards)
- [X] T059 Run the full machine-gate sweep: `pnpm -r typecheck/test`, Go `build/vet/test`, KMP `:shared:testAndroidHostTest` + iOS compile + `mobile-guard` + taxonomy drift, `terraform validate/fmt`, bundle gate, banned-address + no-PII sweeps
- [ ] T060 Operator runbook hand-off: finalise [quickstart.md](quickstart.md) §A with the exact value/secret/param names and file drop locations (FR-032); walk US1–US4 (quickstart §B) once credentials exist

---

## Dependencies & Execution Order

### Phase dependencies
- **Setup (P1)** → no deps.
- **Foundational (P2)** → after Setup; **blocks all stories** (Firebase/PostHog plumbing).
- **US1 (P1)** → after Foundational. **MVP.**
- **US2 (P2)** → after Foundational; independent of US1 (shares the `core/observability` folder + web init, so light coordination).
- **US4 (P2)** → after US2 (guards the analytics/consent it introduces); the PII sweep (T032) can start earlier.
- **US3 (P3)** → after Foundational; independent of US1/US2/US4 (its own tables, service, drivers). Migration (T037) gates T038–T054.
- **Polish (P7)** → after the desired stories.

### Story independence
- **US1** stands alone (crash/error only) → shippable MVP.
- **US3** is fully independent of US1/US2 (separate data, service, drivers) — could even precede US2 if push is prioritised.
- **US4** depends on US2 existing (it guards analytics/consent).

### Parallel opportunities
- Setup: T001–T005 all `[P]`.
- Foundational: T008/T009/T010 `[P]` (T006/T007 touch per-app Gradle/Xcode, still parallel across apps).
- US1: T011/T012/T013 `[P]` (three apps); T017/T018 `[P]`.
- US2: T020/T021/T022 `[P]`; T023/T024 `[P]`; T027 `[P]`.
- US3: device slices T038–T041 `[P]`; push clients T042–T044 `[P]`; producers T053–T055 `[P]`.

---

## Parallel Example: User Story 1 (MVP)

```bash
# The three mobile CrashReporters (independent Gradle builds → different files):
Task: T011 CrashReporter in apps/customer-mobile/.../core/observability/
Task: T012 CrashReporter in apps/shop-mobile/.../core/observability/
Task: T013 CrashReporter in apps/driver-mobile/.../core/observability/
# Web in parallel:
Task: T017 Console error tracking init (shop-web + back-office)
Task: T018 No-PII crash-key host tests (per app)
```

---

## Implementation Strategy

### MVP first (US1 only)
1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1 → **STOP & validate** crash/error visibility on all six surfaces → deploy/demo.

### Incremental delivery
Foundation → **US1** (crash/error, MVP) → **US2** (analytics) → **US4** (privacy/perf guardrails on the analytics just added) → **US3** (push). Each is an independently testable, valuable increment. US3 may be pulled earlier if push is the priority (it shares nothing with US1/US2).

### Notes
- `[P]` = different files, no incomplete-task dependency.
- Everything no-ops without credentials — safe to build/merge before the operator creates accounts (quickstart §A).
- Operator (not Claude) runs `make apply` / `db-up` / `edge-deploy` and the live SC walk (T060).
- Two ARCHITECTURE.md refinements (per-audience cold-path registration; polled-outbox worker) are recorded in plan Complexity Tracking — no constitution amendment.
