# Tasks: Reaching the Right Place (116)

**Input**: `specs/116-links-badges-urgency/` - plan.md, spec.md, research.md (R1–R10), data-model.md, contracts/links.md,
contracts/push.md, quickstart.md

**Tests**: included. The spec's success criteria are tests (fixtures, sender payloads, container tests), and the repo's guards
require them.

**Rules carried in every task**:
- Claude never runs migrations, `terraform apply` or deploys.
- No real-world identifier is guessed: the fingerprint and the team id are variables with "off" defaults.
- Do not git commit.

## Phase 1: Setup

- [X] T001 Migration `db/migrations/20261113120000_badge_corrections.sql`:
  - table `public.notification_badge_correction (recipient_sub text, audience text CHECK customer|driver, requested_at
    timestamptz DEFAULT now())`, PK (recipient_sub, audience), index on `requested_at`;
  - table `public.notification_badge_sweep (id smallint PK CHECK (id = 1), swept_to timestamptz NOT NULL)`, seeded with
    one row at `now()` (the expiry sweep's watermark);
  - partial index `notification_expiring_unseen_idx` on `notification (expires_at) WHERE seen_at IS NULL AND archived_at IS
    NULL AND expires_at IS NOT NULL`;
  - `REVOKE ALL … FROM effy_shopper` on both new tables;
  - a full Down.

  Goose up / down-to `20261113090000` / up on the local Postgres (data-model.md).
- [X] T002 [P] Terraform, no apply:
  - `infra/envs/dev/variables.tf`: `android_app_cert_sha256` (list(string), **no default**, validation: each looks like
    `AA:BB:…` 32 pairs), `apple_team_id` (string, **no default**, validation: empty or 10 upper-case alphanumerics) and
    `apple_customer_bundle_id` (default `com.effyshopping.customer.mobile`: our own code's id, not an outward identifier).
    Constitution, Real-World Identifiers: an unset value fails `plan` loudly (analysis C1);
  - `infra/envs/dev/dev.tfvars`: `android_app_cert_sha256 = []` and `apple_team_id = ""`, each with the comment "off until
    the operator supplies it - asked for, never inferred". Tell the user they must keep or change these on purpose;
  - `infra/envs/dev/amplify-customer-web.tf`: `APP_LINK_ANDROID_SHA256` (comma-joined) and `APP_LINK_APPLE_APP_ID`
    (`<team>.<bundle>` or `""`);
  - an SSM parameter `/effy/<env>/apple/team_id`, value the team id or the placeholder `off` (SSM refuses an empty string).
    Readers treat it as a team id only when it matches `^[A-Z0-9]{10}$` (analysis I3).

  `terraform validate` and `fmt`.
- [X] T003 [P] `apis/edge-api/notifications/serverless.yml`: env `APPLE_TEAM_ID: ${ssm:/effy/${sls:stage}/apple/team_id, ''}`.

## Phase 2: Foundational (blocks every story)

- [X] T004 shared-types `packages/shared-types/src/notification-destinations.ts`:
  - `parseWebLink(pathAndQuery) → { destination: CustomerDestination | null; messageId: string | null }` and
    `customerDestinationForWebPath` (contracts/links.md table; unknown query keys ignored; an unclaimed path → null);
  - `APP_LINK_PATHS` (the claimed paths, used by the website's association file and the manifest test);
  - `interruptionLevelFor(importance, category, timeSensitiveOn) → "active" | "passive" | "time-sensitive"` (R8; importance
    wins over category);
  - `isAppleTeamId(v)` (`^[A-Z0-9]{10}$`), used by the website and the notifications service.

  Export from `index.ts`.
- [X] T005 [P] `packages/shared-types/src/web-links.fixtures.json`: every destination kind with tricky values (spaces and `&`
  in search words, an encoded order id, `utm_*` and `m` params), plus the never-claimed paths (`/email/unsubscribe`, `/help`,
  `/legal/privacy`, `/account`, `/cart`, `/checkout`). Add `web-links.test.ts`:
  - both directions;
  - the round trip of every `customerWebPathFor` output (except a product's `aisleKey`);
  - `interruptionLevelFor` never yields `critical`, and gives important → time-sensitive only when on.

  Regenerate the contracts (`contract:gen`) if any type is in the Kotlin contract.
- [X] T006 `apis/edge-api/notifications/src/fcm/sender.ts` (`toFcmMessage`), for app platforms only:
  - `android.notification.tag = notificationId`;
  - `apns.payload.aps["interruption-level"]` from `PushMessage.interruptionLevel` (a new field; the drain sets it in T020).

  Web is unchanged. Extend `sender.test.ts`:
  - each level;
  - `time-sensitive` only with `APPLE_TEAM_ID`;
  - no `critical` ever;
  - the tag present on Android and absent on web.

**Checkpoint**: the parser and the push rules exist; the stories can start.

## Phase 3: User Story 1 - An Effy link opens the app on the right screen (P1) 🎯 MVP

**Goal**: on Android, the eight shopper paths open the customer app on their screen; every other page stays on the website.

**Independent test**: quickstart walk steps 1–4 (`pm get-app-links` verified; eight paths open the app; unsubscribe opens the
browser; uninstalled → website).

- [X] T007 [P] [US1] customer-web `apps/customer-web/app/.well-known/assetlinks.json/route.ts` and
  `apps/customer-web/app/.well-known/apple-app-site-association/route.ts`:
  - `export const dynamic = "force-static"`, built from `APP_LINK_ANDROID_SHA256` / `APP_LINK_APPLE_APP_ID`;
  - 404 when empty, `application/json`, no redirect;
  - the Apple components from `APP_LINK_PATHS` (contracts/links.md).

  `apps/customer-web/proxy.ts`: the matcher skips `/.well-known/`. Add `apps/customer-web/app/.well-known/well-known.test.ts`:
  empty → 404; set → the exact JSON shapes; the Apple file lists only the claimed paths.
- [X] T008 [US1] Customer app build config:
  - `apps/customer-mobile/build.gradle.kts`: optional key `WEB_SITE_HOST` (empty → `links.invalid` with a build warning),
    also listed in `apps/customer-mobile/secrets.properties.example` (analysis U5);
  - `apps/customer-mobile/androidApp/build.gradle.kts`: `manifestPlaceholders["effyLinkHost"]`;
  - `apps/customer-mobile/androidApp/src/main/AndroidManifest.xml`: a second intent filter on `MainActivity`,
    `android:autoVerify="true"`, VIEW / DEFAULT / BROWSABLE, `https`, host `${effyLinkHost}`, and the paths of
    contracts/links.md.

  Check `scripts/mobile-guard.sh` still passes (the key is not secret-shaped).
- [X] T009 [P] [US1] Kotlin twin `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/core/push/WebLink.kt`
  (`WebLink.parse(path: String, query: Map<String,String>) → OpenedLink(destination, messageId)`), mapping to the app's
  existing destination type. Test `.../commonTest/.../core/push/WebLinkFixtureTest.kt` reads `web-links.fixtures.json` (as
  `NotificationCategoryFixture` does).
- [X] T010 [US1] `apps/customer-mobile/androidApp/src/main/kotlin/com/effyshopping/customer/mobile/MainActivity.kt`:
  - `onCreate` / `onNewIntent` read `ACTION_VIEW` with an `https` URI on the claimed host;
  - parse with `WebLink`;
  - set the container's opened-destination holder (the one `PushOpen` sets), with no notification id, so 109's
    held-through-sign-in router opens it;
  - a null destination opens home.

  If the holder's type requires a notification id, widen it to an optional one (no read call when absent).
- [X] T011 [US1] Analytics: `AnalyticsEvent.AppLinkOpened(kind)` → `app_link_opened {kind, surface: "app"}` (kind only,
  FR-006) in `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/core/observability/AnalyticsEvent.kt`,
  captured where T010 hands over, AND its line in `docs/telemetry/platform-events.md` (`AnalyticsEventDriftTest`, analysis
  G3). Router tests (existing push-open test file, or new `AppLinkOpenTest.kt`):
  - a link to an order while signed out is held, then opened after sign-in;
  - an unknown path → home;
  - a product link → the product screen;
  - another person's order → the order screen's not-found state (never their data);
  - a product that is gone → its "no longer available" state;
  - signed in as a different account than the link's order → not found, no account switch (analysis G4).
- [X] T012 [P] [US1] iOS, built and switched off:
  - `apps/customer-mobile/iosApp/iosApp/` scene/app delegate: `continue userActivity` (`NSUserActivityTypeBrowsingWeb`) →
    the same Kotlin entry as T010 (a small `AppLinkBridge` in iosMain);
  - the Associated Domains entitlement `applinks:<host>` is NOT attached. The exact lines go into
    `docs/observability-apple-blockers.md` "After paying" (T023).

  The iOS compile passes.
- [X] T013 [US1] Links Effy writes: build every shopper link in emails as `WEB_SITE_URL` + `customerWebPathFor`:
  - the order receipt, `notifications/src/receipts/sender.ts`. Also remove `receipts/handler.ts`'s fallback to the reserved
    production apex, `https://effyshopping.com`: an unset `WEB_SITE_URL` fails loudly (analysis P1);
  - the order and points emails, `notifications/src/worker/email-sender.ts`. The points link becomes `/account/points`
    (today `/account?tab=points`, which is never claimed; analysis G1) and the order links stop being hand-built;
  - message emails, `shared/src/notifications/messages/email.ts`.

  Add a test that each email's shopper links parse to a destination with `parseWebLink`, and that the unsubscribe link does
  not.

**Checkpoint**: US1 deploys alone (after T001–T006): links open the app on Android.

## Phase 4: User Story 2 - The app icon shows exactly how many new items there are (P2)

**Goal**: any inbox change elsewhere corrects every phone's badge within a minute, silently, combined.

**Independent test**: quickstart walk steps 5–6, plus `badge.container.test.ts`.

- [X] T014 [US2] `apis/edge-api/shared/src/notifications/badge.ts`, the ONE module that queues badge corrections:
  - `requestBadgeCorrections(db, [{audience, sub}])`: customer and driver only; upsert keeping `LEAST(requested_at)`;
  - `QUEUE_EXPIRED_BADGES_SQL`: the watermark sweep (contracts/push.md, step 1). It queues people with an unseen item whose
    `expires_at` is in `(swept_to, now()]` and moves `swept_to` in the same statement.

  Export from `notifications/index.ts`. Add `badge.guard.test.ts`: `notification_badge_correction` is touched only by
  `badge.ts`, the drain's `worker/badge.ts` and erasure (T019b); `notification_badge_sweep` only by `badge.ts`.
- [X] T015 [US2] Callers:
  - `apis/edge-api/shared/src/notifications/inbox-handlers.ts`: after seen, read-all, archive and undo, call
    `requestBadgeCorrections` beside `announce`;
  - `apis/edge-api/shared/src/notifications/read-handler.ts`: the same after a read.

  - `apis/edge-api/shared/src/notifications/notify.ts`: in the same transaction, queue corrections for the recipients whose
    push was not `pending` without `not_before` (`skipped`, `capped`, held to 08:00, or push not asked for), because their
    count rose with nothing on the phone (analysis G2). Return those subs from the existing statement; do not queue for an
    immediate push, which carries its own badge (R6).

  Extend the handler tests and `notify.container.test.ts`: an offer with push off queues one correction, and an immediate
  push queues none.
- [X] T016 [US2] The drain step `apis/edge-api/notifications/src/worker/badge.ts` `sendBadgeCorrections(deps, now)`:
  1. run the expiry sweep;
  2. claim (`DELETE … requested_at <= now - 15 s … FOR UPDATE SKIP LOCKED LIMIT 500 RETURNING`);
  3. per person: the unseen count (110's definition, `inbox.ts unseenCount`) and the latest 50 unseen ids;
  4. their `device_token` rows for that audience on `ios` / `android`;
  5. send through the sender's new `toBadgeMessage(token, platform, count, keep)` (contracts/push.md), removing invalid
     tokens as the drain does;
  6. metrics `BadgeCorrections{audience, outcome: sent|no_devices|failed}` and `BadgeCorrectionsQueued` (the rows still
     waiting after the run).

  Wire it in `worker/drain.ts` / `worker/handler.ts` each minute, after the deliveries, within the time budget. Add
  `toBadgeMessage` to `fcm/sender.ts`, with sender tests: iOS `aps.badge` only, `apns-push-type: alert`, priority 5,
  `apns-collapse-id: badge`, no alert or sound; Android data only, `collapseKey: "badge"`, `type=badge`, `count`, `keep`
  (analysis U2).
- [X] T017 [US2] Container test `apis/edge-api/notifications/src/worker/badge.container.test.ts`:
  - seen queues one row;
  - 20 changes in a burst → one claim and one send per device (SC-004);
  - a row younger than 15 s waits;
  - an expiry and a withdrawal are queued by the sweep, and a run skipped for five minutes still catches them (the
    watermark);
  - shop and web devices get nothing;
  - an invalid token is removed;
  - the count and `keep` are right.
- [X] T018 [P] [US2] Customer app:
  - `EffyFirebaseMessagingService.kt`: post the in-app notification with `tag = data["notificationId"]`. For `type=badge`,
    cancel shown notifications whose tag is not in `keep` (all at `count == 0`), show nothing, and return early before the
    `notification` check;
  - `core/platform/AppBadge.kt` (+ `.android.kt`, `.ios.kt`): replace 110's `rememberClearAppBadge` with
    `rememberSetAppBadge(): (Int) -> Unit` and update its callers (`InboxScreen.kt`). iOS sets the number; Android cancels
    all at 0. Drive it from `LocalInboxCount` at the app root;
  - sign-out calls `set(0)` (FR-016).

  Tests: a pure `badgeCancellations(shownTags, keep, count)` helper in commonMain with a host test.
- [X] T019 [P] [US2] Driver app (`apps/driver-mobile/shared/src/...`): `EffyFirebaseMessagingService.kt` tags by id and
  handles `type=badge` as in T018. `core/platform/AppBadge.kt` gets `rememberSetAppBadge` in place of
  `rememberClearAppBadge`, driven by the count `core/push/InboxBadge.kt` already shows. Sign-out calls
  `set(0)`. A host test with the same helper.
- [X] T019b [US2] Erasure: in `apis/edge-api/customer/src/erasure/repository.ts`, delete the customer's
  `notification_badge_correction` rows with their notifications, and extend `erasure.container.test.ts` (analysis U4).

**Checkpoint**: US2 deploys alone (it needs T001 and T006's tag).

## Phase 5: User Story 3 - Important notices break through; offers arrive quietly (P3)

**Goal**: every iPhone push carries its urgency; time-sensitive only once switched on; never critical. Android is unchanged
and pinned.

**Independent test**: the sender tests (T006) and a drain test that the claimed importance and category reach the payload.

- [X] T020 [US3] Drain to sender (the ONE place this is wired; analysis D1): `worker/repository.ts` also claims each
  notification's `importance`. `worker/drain.ts` `messageFor` sets `PushMessage.interruptionLevel =
  interruptionLevelFor(importance, category, timeSensitiveOn)`, where `timeSensitiveOn = isAppleTeamId(APPLE_TEAM_ID)` is read
  once in `handler.ts`. Extend `drain.test.ts`: an
  important system notification and an important back-office message → `time-sensitive` (on) / `active` (off); an offer →
  `passive`.
- [X] T021 [P] [US3] Android pin (FR-021): both apps' `NotificationCategoryPolicyTest` already pins the channels to a fixture.
  Add one assertion only if it isn't there: `important` is high-importance and offers and news are default-importance. No
  change to the channels.

## Phase 6: Polish & Cross-Cutting

- [X] T022 Run and record:
  - shared-types tests and contract;
  - edge-api units, plus containers for shared, notifications and customer;
  - customer-web vitest, build (the two well-known routes are static) and depcruise;
  - both apps' host tests, the Android compile and the iOS compile;
  - `mobile-guard.sh`, `driver-guard.sh`, gateway capacity (unchanged 189 / 240), change-map, `check-no-telemetry-pii.sh`.

  Note failures that predate 116.
- [X] T023 [P] Docs:
  - `docs/observability-apple-blockers.md` "After paying": the 116 steps, in order, with checks (R9). These are: set
    `apple_team_id`, then `make apply`; deploy notifications and customer-web; attach Associated Domains and the
    Time Sensitive capability; check the association file; walk steps 3 and 5 on an iPhone;
  - `FEATURE-HISTORY.md` 116 entry (deploy order from plan.md);
  - `CLAUDE.md` feature line;
  - `docs/notifications-backlog.md`: B7, C6, D7 done (iPhone parts switched off), and the programme marked complete.
- [X] T024 [P] Memory: `links-badges-urgency-116.md` + the `MEMORY.md` line. Update `mobile-push-ios.md` with the new
  after-paying steps.
- [X] T025 Walk the quickstart's local checks, mark this file [X], and hand off the operator steps. The operator supplies the
  debug or release SHA-256 and sets `WEB_SITE_HOST`.

## Dependencies

- T001 → T014–T017, T019b (erasure).
- T002 → T007 (the env names), T003 → T020.
- T004/T005 → T007, T009, T013, T006 → T016, T020.
- US1, US2 and US3 are independent after Phase 2. US2's Android cancellation relies on T006's tag.

## Parallel examples

- Phase 1: T002 and T003 beside T001.
- US1: T007 (web), T009 (Kotlin parser) and T012 (iOS) together; then T010 → T011.
- US2: T018 and T019 (apps) beside T016–T017 (backend).

## Implementation strategy

1. MVP = Phases 1–3 (links on Android).
2. US2 (badge), then US3 (urgency, mostly tests).
3. Polish: the after-paying steps are the deliverable for the iPhone half.

**Totals**: 26 tasks (T019b added after `/speckit-analyze`).

| Phase | Tasks |
|---|---|
| Setup | 3 |
| Foundational | 3 |
| US1 | 7 |
| US2 | 7 |
| US3 | 2 |
| Polish | 4 |
