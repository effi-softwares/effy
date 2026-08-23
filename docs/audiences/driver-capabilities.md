# Driver capabilities (parity register)

The single register of what the **driver** audience can do, binding `apps/driver-mobile` (the only driver
surface — there is no driver web). Each capability lists the surface and the slice that delivered it.

Legend: ✅ built & verified · 🚧 partial (noted) · ⛔ deferred (blocked/own-slice) · — n/a

## §049 — Driver Delivery App (hub-and-spoke)

The platform's 6th and final client surface. Model: **collection run** (shops → hub) → **hub check-in**
(same-day/standard split; standard → external carrier) → **same-day delivery run** (hub → customers) with
proof. Backend: cold-path `apis/edge-api/driver` + a scheduled auto-assignment worker + minimal
back-office provisioning (`apis/edge-api/admin/src/drivers`). Closes the commerce→fulfilment→delivery loop;
retires the 020 dev-only `collected`/`delivered` stubs.

| Capability | Mobile | Status | Notes |
|---|---|---|---|
| Passwordless sign-in (work email + 6-digit code), no sign-up | ✅ | ✅ | driver pool + dedicated `driver_mobile` client; single access-token bearer |
| Permission priming (location / notifications / camera) | ✅ | ✅ | one-time rationale + OS request; Android real, iOS contextual (T009/FR-004) |
| Go on/off duty; phase-aware "Today" home | ✅ | ✅ | duty gates assignment; counts-only, no currency (FR-005/006/021) |
| Auto-assignment (no dispatcher, no accept/decline) | — | ✅ | scheduled sweep worker; zone-scoped; `FOR UPDATE SKIP LOCKED` (FR-007–010) |
| Return-to-pool on ineligibility; off-duty-mid-run guard | — | ✅ | FR-011 / T060 |
| Collection run: ordered shop stops, package manifest, collect | ✅ | ✅ | advances `shop_fulfillment`→`collected` (FR-013/014) |
| Report missing/short package | ✅ | ✅ | non-blocking (FR-015) |
| Hub check-in: same-day/standard split; ends run | ✅ | ✅ | standard staged for external carrier (FR-016/017) |
| Same-day delivery run: ordered drops, one-per-order | ✅ | ✅ | multi-shop → one drop (FR-018, SC-006) |
| Drop lifecycle (out-for-delivery → en route → arrived → delivered) | ✅ | ✅ | one primary action per step (FR-019) |
| Proof of delivery — delivery code | ✅ | ✅ | server-verified (FR-024/026) |
| Proof of delivery — contactless + note | ✅ | ✅ | FR-024 |
| Proof of delivery — signature | ✅ | ✅ | Compose canvas → PNG → private S3 (both platforms) |
| Proof of delivery — photo | 🚧 | 🚧 | **Android** camera (ActivityResult); **iOS deferred** (needs Swift picker bridge) |
| Mark undeliverable with reason | ✅ | ✅ | recorded for back-office (FR-028) |
| External navigate hand-off (customer address) | ✅ | ✅ | device maps; `expect/actual` (FR-022) |
| Masked customer contact | 🚧 | 🚧 | affordance disabled; **relay is a platform dependency** (FR-023/R6) |
| In-app route map (pins/canvas) | ⛔ | ⛔ | **blocked on geodata** — shops/orders have no coords (research R13) |
| History (runs + drops by day; timeline + proof, read-only) | ✅ | ✅ | FR-033/034 |
| In-app activity feed | ✅ | ✅ | populated by the worker (FR-032) |
| Push notifications (FCM/APNs) | ⛔ | ⛔ | **own platform-wide slice**; events already recorded (FR-031/R14) |
| Missed-collection-cutoff flag | — | ✅ | worker flags same-day packages past cutoff (T061) |
| Account (identity/zone/hub/vehicle rows); appearance; sign out | ✅ | ✅ | detail rows, no cards; Light/Dark/Follow-System (FR-035–037) |
| Offline write queue (exactly-once on reconnect) | ✅ | ✅ | persisted, idempotent by `changeId` (FR-039/040, SC-007) |
| Monochrome design, dark mode, 48dp targets, no currency | ✅ | ✅ | shared `compose-driver` theme (FR-041–045) |

**Provisioning** (back-office, `apis/edge-api/admin/src/drivers`): create/list/update/disable a driver —
Cognito-first → `public.driver` record; RBAC read=any active staff, mutate=admin/manager.

## §050 — Observability & Push Notification Foundation

Adds the platform's crash reporting (Crashlytics), product analytics (PostHog), and push (FCM) to the
driver app. Status:
- **Contract + wiring**: the `core/observability` (CrashReporter, AnalyticsDriver, typed AnalyticsEvent
  taxonomy) and `core/push` (PushTokenProvider, DeviceRepository) boundaries exist in `commonMain`
  with fail-open NoOp defaults; a `commonTest` drift check pins the taxonomy to `docs/telemetry`.
- **Backend**: device registration (`POST/DELETE /driver/v1/devices`) and the cold-path notifications
  worker (drains `notification_request` → FCM, idempotent, prunes dead tokens) are built and verified.
- **⚠ Native SDK wiring is Firebase-account-gated**: the Android Firebase/PostHog actuals, the iOS
  Swift bridges, and the Gradle plugins land once the operator creates the Firebase project and drops
  in `google-services.json`/`GoogleService-Info.plist` (quickstart §A1). Until then the drivers are
  NoOp — analytics/crash/push are silent, the app fully functional (FR-005/FR-027).
- **No PII** beyond the auth subject id; analytics consent-gated (driver); push OS-permission only.
