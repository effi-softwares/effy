# Implementation Plan: Platform Observability & Push Notification Foundation

**Branch**: `050-observability-push-foundation` | **Date**: 2026-08-23 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/050-observability-push-foundation/spec.md`

## Summary

Turn on the platform's three long-deferred client-observability and messaging capabilities as one
coherent foundation, entirely **within the locked Technology Standards** (constitution Principle VII +
Technology Standards; ARCHITECTURE.md §"Observability, Telemetry & Notifications"):

- **Crash & error reporting** — Firebase **Crashlytics** on the three KMP mobile apps (via `expect`/
  `actual` native drivers, exactly like `AuthDriver`/`PaymentDriver`); **PostHog** error tracking on the
  three web surfaces (the wrapper already exists; it is finally initialised).
- **Product analytics** — **PostHog** on all six clients through the already-typed shared taxonomy,
  finally initialised. Mobile emits the **same event names** the web taxonomy already defines.
- **Push notifications** — **FCM (+ APNs)** to customer/shop/driver devices: a device-token driver +
  per-audience cold-path registration endpoint → a shared `device_token` table; a new cold-path
  **notifications worker** drains a `notification_request` outbox and sends via the FCM HTTP v1 API,
  idempotently, self-cleaning dead tokens.

The hard constraints — **no PII beyond the auth subject id**, **no performance regression**,
**consent-respecting**, **fail-open no-ops when unconfigured** — are designed in, not bolted on. No
accounts exist yet, so the feature ends with an operator runbook ([quickstart.md](quickstart.md)).

**This is the interim-mechanism reality**: the SNS/SQS event backbone does **not** exist yet (CLAUDE.md
"still ahead"; the 049 driver worker polls on a schedule for the same reason). This slice therefore
sends push from a **polled outbox worker** — the established in-repo precedent — and is written so it
drops onto SNS/SQS later with no producer or contract change (research R6).

## Technical Context

**Language/Version**: Kotlin 2.4.0 / Compose Multiplatform 1.11.1 (mobile); TypeScript on Node 22
(cold-path Lambdas, Serverless v3); Go 1.25 (hot path, one producer INSERT only); React 19 + TS (web).

**Primary Dependencies**:
- Mobile: Firebase Android SDK (`firebase-messaging`, `firebase-crashlytics`) + Google Services /
  Crashlytics Gradle plugins; Firebase iOS SDK (`FirebaseMessaging`, `FirebaseCrashlytics`) via
  CocoaPods/SPM; PostHog native SDKs (`posthog-android`, `posthog-ios`). All behind `expect`/`actual`.
- Web: `posthog-js` (already a dependency in `@effy/web-kit` and `apps/customer-web`).
- Cold path: `firebase-admin` (Node) in the notifications worker only.

**Storage**: PostgreSQL 16 (Goose, forward-only) — two new tables (`device_token`,
`notification_request`). No schema change to existing tables.

**Testing**: Vitest (edge services + web-kit); Go `testing` (the one producer + payload map); KMP
`commonTest` host tests (drivers behind fakes, taxonomy drift) + Android/iOS compile; Playwright
(web consent + no-PII); the standard machine gates (`pnpm -r typecheck/test`, mobile guards, bundle
gate, `terraform validate`).

**Target Platform**: Android (minSdk 24) + iOS (via KMP); three web surfaces; AWS `ap-southeast-2`.

**Project Type**: Cross-cutting foundation spanning mobile + web + both backends + infra + DB.

**Performance Goals** (SC-005): mobile cold-start delta ≤ **50 ms** with telemetry on vs off; **no**
regression in the customer-web guest bundle gate (**174 KB**) or Core Web Vitals; telemetry never on
the UI thread or the request/response path; the notifications worker is off every user path.

**Constraints**: no PII beyond the auth `sub`; consent-gated for the customer audience; a platform-wide
kill switch that needs no app release; every capability degrades to a **safe no-op** when its
credential/config is absent (local dev, preview, tests emit/send nothing real).

**Scale/Scope**: 6 client surfaces (analytics/error) + 3 mobile (crash/push) + 2 backends + 1 worker +
1 migration + Terraform. Starter notification set = 6 message types; taxonomy = the existing web union
plus screen-view + driver/fulfilment names.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Verdict |
|---|---|---|
| **I. Spec-Driven** | spec has zero tech; plan chooses tech within locked standards | ✅ spec is capability-only; providers named here are already locked in the constitution. |
| **II. Monorepo & shared contracts** | cross-cutting logic is shared, not copy-pasted; DTOs are SSOT | ✅ Web telemetry stays in `@effy/web-kit`; device-registration DTOs + the **event-name taxonomy** are the shared contract (`@effy/shared-types` + `docs/telemetry/*`). ⚠ The three KMP apps are **independent Gradle builds** and already duplicate per-app drivers (`AuthDriver`); the shared contract is the *names/shapes*, kept aligned by a drift check (research R8) — this matches the existing web↔mobile taxonomy-parity mechanism, not a new violation. |
| **III. Dual-path discipline** | each path justified; no latency-sensitive traffic on cold path, no low-freq CRUD on hot path | ✅ Device registration + the notifications worker are **cold path** (low-frequency CRUD + async work). The **only** hot-path touch is one `INSERT` into `notification_request` inside core-api's existing paid-order finalizer (that transition already runs on the hot path). ⚠ Refines ARCHITECTURE.md's "hot-path endpoint" for token registration → **per-audience cold-path** endpoints, justified in research R5 (two of three audiences have no hot path; registration is not latency-sensitive). |
| **IV. Auth isolation** | per-pool validation; no cross-pool token reuse; record authoritative | ✅ Each audience registers its token via **its own pool's** authorizer (customer→edge-customer, shop→edge-shop, driver→edge-driver); the subject `sub` is the token owner; sign-out clears the association (FR-020). No cross-pool brokering. |
| **V. Design system** | monochrome, no new hue, native feel, no cards | ✅ No new UI colours; a consent affordance + a notification-settings toggle use existing tokens/components. Notifications render with OS-native styling. No chart/hue added. |
| **VI. Layered architecture & wiring** | thin edge → service → repo; raw SQL; explicit DI; idempotent consumers | ✅ Edge services keep handler→service→repository; raw SQL; drivers wired by hand into `AppContainer`; the worker is **idempotent** (dedupe key). ARCHITECTURE.md refinements (R5, R6) are recorded here per Principle VI. |
| **VII. Observability & telemetry** | crash (mobile) + error (web) + analytics (all clients) + no PII + consent + push via the notifications path | ✅ This feature *is* that principle, realised. PII forbidden (FR-022, mechanically checked). Push goes through one notifications path (FR-014), never ad hoc. Telemetry declaration below. |
| **Real-World Identifiers** | operator-supplied, fail loud when unknown | ✅ Firebase project ids, service-account, APNs key, PostHog keys/host are **all operator-supplied** (quickstart); missing → loud failure or no-op, never a guess. No banned address anywhere. |

**Result: PASS** (two ARCHITECTURE.md refinements recorded, both within the principles — see Complexity
Tracking). No locked technology is swapped; no constitution amendment required.

### Dual-path declaration (Principle III)

- **Cold path (new `edge-api/notifications`)** — the scheduled notifications worker (drain outbox →
  resolve tokens → FCM send → mark sent / prune dead tokens). Async, low-frequency, off every user path.
- **Cold path (existing edge services)** — `POST/DELETE /{audience}/v1/devices` on edge-customer,
  edge-shop, edge-driver. Low-frequency CRUD, per-pool authorizer.
- **Hot path (existing core-api)** — a single `INSERT` into `notification_request` in the paid-order
  finalizer (the transition is already here). No new hot-path route.

### Telemetry declaration (Principle VII)

- **Product events**: the existing typed taxonomy (`StorefrontEvent` union + `docs/telemetry/*`),
  extended with **screen/page-view** on every surface and **driver** workflow names; mobile adopts the
  identical names. New this slice: `push_permission_prompted`, `push_permission_granted`/`_denied`,
  `notification_opened { type }` (no PII).
- **Metrics/alerts** (backend): worker counters `notification_send_succeeded/_failed{type,audience}`,
  `device_token_pruned`, and an **alert** on sustained FCM send-failure rate (surfaced via the existing
  CloudWatch→Grafana path and the alerts SNS). Client SDK health is observed in PostHog itself.

## Project Structure

### Documentation (this feature)

```text
specs/050-observability-push-foundation/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions R1..R12
├── data-model.md        # Phase 1 — device_token, notification_request, event/crash contracts
├── quickstart.md        # Phase 1 — operator account setup + validation walks
├── contracts/           # Phase 1 — device API, producer contract, FCM payload, taxonomy, config
│   ├── device-registration.contract.md
│   ├── notification-request.contract.md
│   ├── fcm-payload.contract.md
│   ├── telemetry-taxonomy.contract.md
│   └── config.contract.md
└── checklists/requirements.md
```

### Source Code (repository root)

```text
# ── Mobile: one set per app (independent builds), behind expect/actual — customer shown; shop/driver mirror ──
apps/customer-mobile/shared/src/
├── commonMain/.../core/observability/
│   ├── CrashReporter.kt          # expect: init(), logNonFatal(t, keys), setSubject(sub?)
│   ├── AnalyticsDriver.kt        # expect: init(cfg), screen(name), capture(event), identify(sub), reset(), optOut(b)
│   └── AnalyticsEvent.kt         # sealed taxonomy (mirrors docs/telemetry SSOT; drift-checked)
├── commonMain/.../core/push/
│   └── PushTokenProvider.kt      # expect: currentToken(), onTokenRefresh {}, permission state
├── androidMain/.../core/observability/   # Firebase Crashlytics + PostHog Android actuals
├── androidMain/.../core/push/            # FirebaseMessaging actual + FirebaseMessagingService
├── iosMain/.../core/observability/       # Firebase Crashlytics + PostHog iOS actuals (cinterop)
├── iosMain/.../core/push/                # APNs↔FCM actual
└── (AppContainer.kt wires the three drivers; RegisterDeviceToken use case posts to edge)
apps/{shop,driver}-mobile/shared/src/...  # same shape, per-app package roots

# ── Web: initialise what already exists ──
packages/web-kit/src/runtime/telemetry.ts        # createTelemetry — add screen/pageview + init call sites
apps/customer-web/lib/telemetry.ts               # consent-gated (exists) — wire the consent UI + init
apps/customer-web/next.config.ts                 # reverse-proxy rewrite for PostHog ingest (first-party)
apps/{shop-web,back-office}/src/main.tsx         # call telemetry.init() at bootstrap (internal, on)

# ── Backend: cold path ──
apis/edge-api/notifications/                      # NEW cold-path service: scheduled worker + token prune
│   ├── serverless.yml                            # attaches to shared HTTP API; schedule rate(1 min); firebase-admin
│   └── src/{worker,fcm,repository,functions}/
apis/edge-api/{customer,shop,driver}/src/devices/ # NEW device register/unregister slice per service
apis/core-api/internal/features/checkout/store.go # +1 INSERT into notification_request on paid transition
apis/core-api/internal/features/notifications/    # tiny producer helper (append intent) — hot path

# ── Data + Infra ──
db/migrations/<ts>_observability_push.sql         # device_token + notification_request
infra/envs/dev/notifications.tf                   # FCM service-account secret, worker IAM, SSM params
infra/envs/dev/telemetry.tf                        # PostHog host/keys + telemetry.enabled SSM params
```

**Structure Decision**: Mobile + web + dual backend. Client capabilities plug in via the existing
`core/*` **native-driver** pattern (per-app, `expect`/`actual`), wired by hand into `AppContainer`
(no DI framework). Backend follows the cold-path service pattern (attach to the shared HTTP API; SSM/
Secrets config; Parameters-and-Secrets layer). A **new** `edge-api/notifications` service owns the
cross-audience worker so no existing service grows a second responsibility.

## Complexity Tracking

> Two refinements to ARCHITECTURE.md (the binding elaboration of Principle VI). Both stay within the
> principles; recorded here per Principle I ("fixed by returning to the earliest affected artifact").

| Refinement | Why needed | Simpler alternative rejected because |
|---|---|---|
| Token registration is **per-audience cold-path**, not a single "hot-path endpoint" | Shop and driver have **no hot path at all** (cold-path pools); registration is a low-frequency write, not latency-sensitive → Principle III puts it on the cold path | A single hot-path endpoint cannot serve shop/driver without breaking auth isolation (their tokens are rejected by core-api's customer-scoped authorizer); duplicating auth would violate Principle IV. |
| Push is sent by a **polled outbox worker**, not an SNS/SQS consumer | The event backbone **does not exist yet** (CLAUDE.md; the 049 driver worker sets the exact precedent) | Building SNS/SQS now is a separate, larger slice; the outbox + worker is idempotent and swaps onto SNS later with no producer/contract change (R6). |

Everything else uses an existing pattern (native drivers, cold-path services, Goose migration, SSM/
Secrets contract, the typed telemetry taxonomy) — no new architectural surface.
