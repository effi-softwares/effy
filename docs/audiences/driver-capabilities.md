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

**Provisioning** — ⚠ **SUPERSEDED BY §056.** 049 shipped five routes in `apis/edge-api/admin/src/drivers`
as a minimal adjunct so the driver app had accounts to sign in as, and recorded in its own spec that
"a full driver-management console is out of scope for this slice unless folded in during planning."
That console is 056; those five routes have MOVED to `apis/edge-api/fleet` and the admin copy is deleted.

## §056 — Back-Office Driver Management (the console 049 deferred)

The driver audience gains **no new capability** here — `apps/driver-mobile` is untouched, and drivers do
not edit their own profile. What changes is that everything the driver app RECORDS finally has a reader,
and everything back-office decides about a driver finally has a screen. New cold-path service
`apis/edge-api/fleet` (18 routes, back-office authorizer); one migration altering three tables and
creating none.

| Capability | Driver app | Back-office | Notes |
|---|---|---|---|
| Driver record exists, is provisioned, has a zone | ✅ (reads it) | ✅ | 049 created the record; 056 gives it a register, search, filters and paging |
| Full profile of record | — | ✅ | phone, start date, emergency contact, licence + expiry, registration expiry, notes (FR-006/007/008) |
| A profile field can be **cleared** | — | ✅ | ⚠ Was impossible: `COALESCE($n, col)` could not tell "leave alone" from "clear", so a zone once set could never be un-set (FR-010) |
| Duplicate work email is **refused** | — | ✅ | ⚠ Was the opposite: create silently ADOPTED the existing driver's record and RE-ENABLED a stood-down sign-in, reporting success (FR-014) |
| Employment lifecycle | ✅ (refused when not active) | ✅ | `active \| suspended \| offboarded` — 049's two-value `active \| disabled` could not express "back next week" |
| ⚠ Access gate tests the **positive** state | ✅ | — | `requireDriver` read `=== "disabled"`; widening the enum would have let a **suspended** driver keep working. Now `!== "active"` |
| Held-work warning before standing a driver down | — | ✅ | itemised, names the affected orders, requires explicit confirmation (FR-020) |
| **Stranded work** visible and releasable | — | ✅ | ⚠ Derived, never stored. The sweep deliberately never yanks picked-up work; nothing told a human, and a UNIQUE constraint kept those packages claimed forever (FR-021) |
| **Failed deliveries** readable | ✅ (writes them) | ✅ | ⚠ `public.delivery_failure` had **no reader anywhere** since 049 despite "recorded for back-office follow-up" (FR-027) |
| **Missing/short at a shop** readable | ✅ (writes them) | ✅ | ⚠ Same — `public.collection_task_issue` had no reader (FR-028) |
| Exception → order in one step, resolvable with a note | — | ✅ | one-way, never deleted, who + when recorded (FR-030/031) |
| Duty visibility · overdue session · end a shift | ✅ (goes on duty) | ✅ | back-office can END a session, never START one (FR-034/037) |
| "Nobody is on duty and N packages are waiting" | — | ✅ | uses the assignment sweep's **own** candidate predicate, pinned by a parity test (FR-036) |
| Manual dispatch to a named driver | — | ⛔ **Deliberately absent** | 049's no-dispatcher model stands; release-to-pool is the sanctioned intervention, asserted over the whole route table (FR-038) |
| Work history · run timeline · proof of delivery | ✅ (own history) | ✅ | proof media is time-limited presigned and issuing it is audited (FR-039–042) |
| Period activity counts | — | ✅ | ⚠ Counts only. Not a timesheet, and carries no currency (FR-043/049) |
| Readiness: no-zone / expired licence / uncovered zone | — | ✅ | ⚠ A zone-less driver is inert for assignment TODAY and nothing said so (FR-044–046, SC-009) |
| Every privileged action audited | — | ✅ | ⚠ Driver management was the **only** privileged back-office domain writing no `admin.audit_log` row (FR-024) |
| Driver contact details in logs/telemetry | — | ⛔ never | audit detail records a PII field as *changed*, never its value (FR-050) |

**RBAC**: read = any active back-office staff **including csa** (FR-022); mutate = admin/manager (FR-023),
decided from the `admin.staff` record, never the token claim.

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
