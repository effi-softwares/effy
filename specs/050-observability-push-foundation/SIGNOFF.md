# Sign-off: 050-observability-push-foundation

**Status: CONCLUDED (PARTIAL BY DESIGN) — 2026-08-23.** Crash reporting (Crashlytics) and product
analytics (PostHog) are **built, deployed, and confirmed working**; push (FCM) is **built and deployed**
but **not yet confirmed delivering** and is carried forward to debug alongside the order-flow slice
(which produces the `order_paid` event push depends on). iOS push is deferred by design (Apple account).

## What this feature delivered
Turned on the platform's three long-deferred client-observability + messaging capabilities (constitution
Principle VII), within the locked technology standards, across all six surfaces:

- **Crash & error reporting** — Firebase Crashlytics on the mobile apps; PostHog error tracking on web.
- **Product analytics** — PostHog on all six clients through the typed, shared taxonomy (closes the
  long-standing "PostHog never initialised" carry-forward from 033/039).
- **Push notifications** — FCM: per-audience device-token registration → `device_token`; a
  transactional-outbox (`notification_request`) drained by a new cold-path notifications worker →
  FCM HTTP v1, idempotent + self-pruning dead tokens.

## Confirmed working (operator, live)
- ✅ **Crashlytics** — customer-mobile Android: fatal crash + non-fatal both reported to Firebase.
- ✅ **PostHog analytics** — customer-mobile Android (consent-gated) + web consoles (on-by-default):
  events flowing, `surface` distinguishes them, no PII.

## Machine-verified
- **Mobile compiles (all 3 apps)**: `:shared:compileAndroidMain` for customer/shop/driver;
  customer-mobile full `:androidApp:assembleDebug` (google-services + FCM manifest merge) +
  `:shared:testAndroidHostTest` (incl. the taxonomy drift check) + `:shared:compileKotlinIosSimulatorArm64`.
- **Web + backend**: `pnpm -r typecheck` 16/16 · edge-shared **61** (incl. 12 device tests) ·
  edge-notifications **9** · web-kit **51** (kill-switch + session-replay-off + error routing) ·
  edge-customer/shop/driver suites · Go build/vet/test · `terraform validate`/`fmt` ·
  customer-web bundle gate green (≤174 KB) · `scripts/check-no-telemetry-pii.sh` (proven by injecting a
  leak) · mobile-guard.

## Deployed to dev (operator)
- Infra applied: `telemetry.tf`, `notifications.tf` (FCM secret container + project id + send-failure
  alarm), Amplify PostHog env on all 3 web apps, SSM telemetry params (Terraform-owned).
- Migration `20260823120000_observability_push.sql` (`device_token` + `notification_request`) via `db-up`.
- Edge services deployed: customer/shop/driver (device endpoints + producers) + the notifications worker.
- core-api redeployed (order_paid + shop_new_order producers).
- FCM service-account secret seeded (GCP org policy `iam.managed.disableServiceAccountKeyCreation` was
  lifted for `effy-dev-bbd5a` to allow key creation; can be re-enforced now).

## Clarifications (recorded in spec)
Q1 crash independent of analytics consent · Q2 OS-level push only (no prefs table) · Q3 kill switch =
analytics only (crash/push stay on) · Q4 no internal opt-out UI (shop/driver on-by-default).
Analyze F1 relaxed SC-003 to ≤90 s p95 (interim polled-outbox worker; sub-30 s comes with SNS/SQS).

## Carry-forwards (open by design)
- ⚠ **Push delivery not confirmed** — the full chain (order paid → `order_paid` → worker → FCM →
  device) is wired + deployed but a live push has not been observed. To be debugged with the order-flow
  slice, which exercises the producing event. Fastest triage: `SELECT type,status,last_error FROM
  public.notification_request ORDER BY created_at DESC` (no row = order didn't reach paid; `skipped` =
  no device token; `failed` = FCM/credential; `sent` = delivered). Worker logs in CloudWatch.
- ⛔ **iOS push** — blocked on the Apple Developer account (APNs key) + the unwritten `SwiftPushBridge`.
  Full runbook: `docs/observability-apple-blockers.md`. iOS crash + analytics bridges ARE written;
  iOS uses `NoOpPushTokenProvider` until then (fail-open).
- **iOS builds (all 3)** — need the SPM packages added in Xcode (firebase-ios-sdk + posthog-ios) + the
  Crashlytics dSYM run-script (`docs/observability-apple-blockers.md`); iOS Kotlin compiles here.
- **shop/driver device walks** — Android wiring identical to customer (which is confirmed); their live
  crash/analytics/push walks are unrun.
- **T047 notification-tap deep-link** — the `data.deepLink` is sent; the mobile tap→route handling is
  polish, best done once push delivery is confirmed.
- **T060 full SC-001…SC-010 walk** — partially done (Crashlytics/PostHog); the push SCs + perf (SC-005
  cold-start delta) + kill-switch live walk (SC-006) remain.
- Session replay is OFF by design; PostHog feature flags/experiments/surveys out of scope.

## Tasks
53/61 built (the debug test panel T015 landed for verification). Remaining are the carry-forwards above:
T007 (iOS push), T018 (a host test), T019/T033/T036 (symbolication/perf/kill-switch walks), T047
(deep-link), T060 (SC walk), + shop/driver device walks.

Spec/artifacts: [specs/050-observability-push-foundation/](.).
