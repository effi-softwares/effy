# Tasks: Notification Preferences & Marketing Consent (111)

**Input**: `specs/111-notification-preferences/` (spec, plan, research R1–R16, data-model, contracts, quickstart)

**Tests**: included where the spec's guarantees are mechanical:
- the sending rules table (contracts/sending-rules.md; SC-001, SC-004, SC-005, SC-006);
- refusals (FR-009, SC-008);
- consent history (FR-010, SC-003);
- policy parity TS ↔ Kotlin ↔ migration CHECKs (FR-002);
- erasure.

Container tests run on the local Postgres (memory: container-tests-local-postgres; `scratchpad/run-ct.sh`). The
migration is also run with real goose up / down-to / up (the 109 Stage B lesson).

**Rules carried from the plan**:
- one writer per fact (`preferences.ts` for choices and consent; `notify.ts` for rows; the drain for outcomes);
- no timers;
- the operating zone only via `OPERATING_TZ`;
- the customer app has no dialogs or drop-downs;
- every console page has a tour;
- loading states draw the page's own shape;
- never edit a committed migration;
- no compatibility fields.

## Phase 1: Setup

- [X] T001 Write `db/migrations/20261110090000_notification_preferences.sql` per data-model.md:
  - `customer_notification_choice` (PK, CHECKs incl. `customer_notification_choice_channel_ck`, FK cascade);
  - `customer_marketing_consent` (CHECKs, `customer_marketing_consent_latest_idx`, FK cascade);
  - view `marketing_consent_current`;
  - `notification_settings` (singleton, CHECKs, seeded row) and `notification_settings_change`;
  - `notification_delivery.not_before`, `notification_delivery_not_before_ck`, and the status CHECK re-created with
    `skipped`, `capped`;
  - grants to `effy_shopper`: choice SELECT/INSERT/UPDATE/DELETE; consent SELECT/INSERT only; view SELECT; settings
    SELECT;
  - full goose Down: delete `skipped`/`capped` delivery rows before restoring the old CHECK; drop the column, view and
    tables;
  - any `DO $$` body wrapped in `-- +goose StatementBegin`/`StatementEnd`.
- [X] T002 Run the migration with real goose against the local Postgres (a fresh database: `up`, `down-to 20261109090000`,
  `up`) and record the result in FEATURE-HISTORY at the end (T060).
- [X] T003 [P] Create `packages/shared-types/src/notification-categories.ts` per data-model.md › Category policy:
  - the types `NotificationCategoryPolicy` (`required`, `marketing`, `importance`, `defaults {push, email}`,
    `changeable: ("push"|"email")[]`, `androidChannel | null`, `label`, `description`, `reason | null`);
  - `NOTIFICATION_CATEGORY_POLICY: Record<audience, Partial<Record<InboxCategory, policy>>>`;
  - `categoriesFor(audience)` (display order);
  - `policyFor(audience, category)` (throws on an undeclared pair);
  - `ANDROID_CHANNELS` per app (id, name, importance);
  - words from research.md › R9 (description and reason lines);
  - exported from `index.ts`.
- [X] T004 [P] Create `packages/shared-types/src/notification-categories.fixtures.json`, the same data as T003, and
  `notification-categories.test.ts`. The test checks:
  - the policy matches the fixture;
  - FR-001's lists per audience;
  - no required category has a `changeable` channel;
  - offers and news are the only marketing categories;
  - every catalogue type's category is declared for its audience (read `apis/edge-api/shared/src/notifications/catalogue.ts`
    entries through the same text-parse pattern `notification-types.contract.test.ts` uses, or the exported list if
    importable);
  - the migration's `customer_notification_choice` category/channel CHECK lists agree with the changeable channels;
  - the Kotlin copies (T008, T031) are byte-identical to the fixture.
- [X] T005 [P] Create `packages/shared-types/src/notification-preferences.ts` per contracts/preferences-api.md:
  - `NotificationPreferencesDTO`, `NotificationPreferencesChange`, `StaffNotificationPreferencesDTO`;
  - `NotificationSettingsDTO`, `NotificationSettingsUpdate`;
  - `ConsentSurface = "app"|"web"`, `ConsentVia = "settings"|"prompt"|"inbox"`;
  - add the customer DTOs to `customer-contract.ts` and regenerate `packages/shared-types/contract/…/Dto.kt` with the
    existing generator;
  - export from `index.ts`.
- [X] T006 [P] Add `packages/legal-content/src/consent/marketing.json` (version `marketing-2026-11`, heading, body, yes,
  no, offers/news settings lines, footnote: research.md › R9). Extend `scripts/build.mjs`, `emitTs` and `emitKotlin` to
  emit `MARKETING_CONSENT` (TS) and `MarketingConsent` (Kotlin, in `LegalContent.kt`). Extend `check.mjs` so the
  generated files must match, then run `legal:gen`.
- [X] T007 [P] Add `packages/legal-content/src/documents/privacy-policy/v2.md` (v1 text with the Marketing section
  replaced by research.md › R9's draft; `effectiveDate` today; `status: current`), set v1 `status: superseded`, and run
  `legal:gen`. Update any test that pins the privacy version (`documents.test.ts`, customer-web legal tests, the app's
  legal test).
- [X] T008 [P] Customer app `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/core/push/NotificationCategoryPolicy.kt` (the customer twin of the policy, with
  the embedded fixture copy for T004's parity test; used by T020 and T036), plus a host test.

## Phase 2: Foundational (blocks every story)

- [X] T009 Create `apis/edge-api/shared/src/notifications/preferences.ts`, the one writer of choices and consent:
  - `readPreferences(db, customerId)` → the DTO, with defaults applied from the policy and consent from
    `marketing_consent_current`;
  - `askForOffers(db, customerId)` (no consent rows AND ≥1 paid order);
  - `applyPreferencesChange(tx, customerId, change)`: validate per the contract table, upsert choices (`surface`,
    `changed_at`), append consent rows (one per key given), refuse `wordingVersion` ≠ current (`MARKETING_CONSENT.version`;
    add `@effy/legal-content` to edge-shared deps if absent) with a typed error → 409;
  - `channelAllowedSql(policyParams)`: the SQL boolean fragment over `(customer_id, category, channel)` per research.md › R6;
  - `promoLimitsSql` / `quietHoursSql` helpers (Effy clock via an `OPERATING_TZ` parameter);
  - `PROMO_LOCK_KEY`;
  - export from `notifications/index.ts`.
- [X] T010 Change `apis/edge-api/shared/src/notifications/notify.ts` per contracts/sending-rules.md:
  - look up the policy for the entry's audience and category;
  - marketing: take the advisory lock; refuse words without "Effy" (throw before writing); restrict `input` to
    recipients whose customer has a current yes (join `public.customer` on `cognito_sub` and `marketing_consent_current`);
  - deliveries: set `status` to `skipped` when not allowed (non-required customer categories only; driver and shop skip
    the join), `capped` for a marketing push over either limit (from `notification_settings`), else `pending` with
    `not_before` for a marketing push in [21:00, 08:00) on Effy's clock;
  - keep one statement, the dedupe and the after-commit announce unchanged;
  - the return value is unchanged.
- [X] T011 [P] Add a marketing-words check to `apis/edge-api/shared/src/notifications/catalogue.test.ts`: any catalogue
  entry whose category is marketing must name "Effy" in its general title or body (none today; the test proves the rule
  with the policy).
- [X] T012 Container tests in `apis/edge-api/shared/src/notifications/preferences.container.test.ts`:
  - every row of contracts/sending-rules.md's table;
  - the limits (day and week, `muted`/`no_device` counted, `capped` not counted);
  - two concurrent marketing `notify()` calls never both pass a limit of 1;
  - quiet hours with the clock set by `SET LOCAL` or a now() override parameter (22:00 → `not_before` next 08:00;
    07:59 → same day 08:00; 08:00 → none);
  - an order update at 22:00 → `pending`, no `not_before`;
  - `applyPreferencesChange` refusals and the consent history rows;
  - `askForOffers` true/false cases.

  Use a test-only marketing catalogue entry (a dependency-injected entry or a test helper in `notify.ts` that takes the
  policy explicitly; it must not add a type to the DB CHECK).
- [X] T013 [P] Create `apis/edge-api/shared/src/notifications/preferences.guard.test.ts`:
  - only `preferences.ts` INSERTs/UPDATEs/DELETEs `customer_notification_choice` / `customer_marketing_consent`, except the
    purge (`apis/edge-api/notifications/src/purge/repository.ts`) DELETE;
  - nothing reads `customer_marketing_consent` directly except `preferences.ts`, the orders consent activity source and
    the purge (everything else uses the view).

  Extend `notifications.guard.test.ts` if its writer list needs the new statuses.
- [X] T014 Change `apis/edge-api/notifications/src/worker/repository.ts`:
  - the claim adds `AND (d.not_before IS NULL OR d.not_before <= now())` and returns `category` and, for marketing
    categories, `allowed` (the T009 fragment, push channel);
  - `pendingStats` ignores `not_before > now()`.

  In `worker/drain.ts`, a claimed delivery with `allowed === false` records `skipped` (not attempted, no send). Update
  `repository.container.test.ts` (a held row is not claimed; released after `not_before`; consent withdrawn → `skipped`)
  and `drain.test.ts`.
- [X] T015 Change `apis/edge-api/notifications/src/purge/repository.ts`: delete `customer_notification_choice` and
  `customer_marketing_consent` rows of customers past their closure's `erase_after` (not cancelled), in batches, beside
  `erased`. Add them to the summary metric and to `repository.container.test.ts`.

**Checkpoint**: the rules hold for every sender; shared and notifications tests are green.

## Phase 3: User Story 1 - A customer chooses how Effy reaches them (P1) 🎯 MVP

**Goal**: settings on the app and website; muted channels skip; the inbox always has orders and points.
**Independent test**: quickstart §1–§2, §4.

- [X] T016 [P] [US1] Create `apis/edge-api/customer/src/functions/customer-notification-preferences-v1-get.ts` and
  `…-v1-patch.ts`:
  - thin handlers over `readPreferences` / `applyPreferencesChange` in `withTransaction`;
  - the caller's own customer (resolve by sub as the other customer routes do);
  - errors per the contract: `400 invalid_preferences_change`, `400 category_required`, `409 consent_wording_changed`.

  Add two entries to `apis/edge-api/customer/serverless.yml` (no colon in descriptions). Add unit tests for validation.
- [X] T017 [US1] Mark both routes SILENT in `apis/edge-api/live/…/change-map.guard.test.ts` (wherever 110 listed its
  inbox routes), and run the gateway capacity contract test (shared 187).
- [X] T018 [P] [US1] Customer app data and domain:
  - `features/notifications/settings/data/HttpNotificationPreferencesRepository.kt` (GET/PATCH via the contract DTOs);
  - `domain/NotificationPreferences.kt` (domain model, mapping, `changeable`, consent state).
- [X] T019 [US1] Customer app `features/notifications/settings/presentation/NotificationSettingsViewModel.kt`:
  - load; toggle with an optimistic update and rollback on refusal;
  - a consent toggle sends `consent` + `via=settings` + `wordingVersion` from `MarketingConsent`;
  - a 409 re-reads.

  Add `…/commonTest/…/NotificationSettingsViewModelTest.kt` (load, toggle, rollback, 409).
- [X] T020 [US1] Customer app `NotificationSettingsScreen.kt`:
  - `EffySwitch` rows per category from the policy twin (label, description);
  - push/email sub-rows;
  - Offers and News as a main switch (consent) with a push sub-switch, plus the footnote;
  - fixed rows with the reason;
  - `EffySkeletonText` loading;
  - the OS-permission notice using `rememberTurnOnNotifications()` (T021).
- [X] T021 [P] [US1] Port `core/platform/NotificationsSetting.kt` (`expect fun rememberTurnOnNotifications(): (() ->
  Unit)?`) and its Android/iOS actuals from `apps/driver-mobile/shared/src/{commonMain,androidMain,iosMain}/…/core/platform/`
  into the customer app's same paths, adjusting packages.
- [X] T022 [US1] Wire the customer app:
  - `CustomerNavKey.NotificationSettings` plus its entry in `app/CustomerShell.kt`;
  - an "Notification settings" row in the settings group of `features/account/presentation/AccountScreens.kt`;
  - a settings icon in the inbox top bar (`features/notifications/presentation/InboxScreen.kt`);
  - the repository in `app/AppContainer.kt`;
  - `notification_setting_changed` in `core/observability/AnalyticsEvent.kt`;
  - a lucide `settings` drawable if missing (`scratchpad/lucide2vd.mjs`).

  Run `scripts/mobile-guard.sh`.
- [X] T023 [P] [US1] Customer website:
  - `lib/customer-reads.ts` `getNotificationPreferences()`;
  - `app/(account)/account/notifications/settings/page.tsx` (server-rendered) plus `actions.ts` (Server Action
    proxying PATCH);
  - `components/notifications/NotificationSettingsForm.tsx` (client switches, same words from shared-types and
    `@effy/legal-content`, optimistic, rollback);
  - a skeleton beside it (`NotificationSettingsSkeleton`, the 2026-10-29 rule);
  - links from the inbox page header (`InboxView.tsx`) and `components/header/account-links.ts`;
  - `notification_setting_changed` in `lib/telemetry.ts`;
  - tests: `NotificationSettingsForm.test.tsx`.

**Checkpoint**: Story 1 walks (quickstart §1–§2, §4).

## Phase 4: User Story 2 - A customer is asked, once, whether they want offers (P1)

**Goal**: the one-time ask on the order confirmation in the app and on the website; consent recorded.
**Independent test**: quickstart §3.

- [X] T024 [P] [US2] Customer app `features/notifications/offers/OffersAsk.kt`:
  - `OffersAskSheet` (`EffySheet`: heading, body, "Yes, tell me" / "Not now" as two equal buttons, the words from
    `MarketingConsent`);
  - a small `OffersAskController` (reads `askForOffers` from the preferences repository; answer → PATCH consent both
    keys, `via=prompt`, `surface=app`; dismissing = "Not now"; after "Yes", call the existing push permission request,
    with the consent already recorded first);
  - `offers_ask_shown` / `offers_ask_answered` events;
  - a test: `OffersAskControllerTest.kt`.
- [X] T025 [US2] Show the ask from `features/checkout/presentation/ReceiptScreen.kt` once per screen visit when
  `askForOffers` is true (never for a guest).
- [X] T026 [P] [US2] Customer website `components/notifications/OffersAsk.tsx`:
  - an inline panel, not a modal (first-load rule), a client island;
  - "Yes, tell me" / "Not now" through a Server Action PATCH with `via=prompt`, `surface=web`;
  - it hides after answering;
  - render it in `app/checkout/complete/page.tsx` when the server read says `askForOffers`;
  - telemetry;
  - test `OffersAsk.test.tsx`;
  - run `dependency-cruiser.first-load.cjs`.
- [X] T027 [US2] Container test in `preferences.container.test.ts` (or the customer service's): answering on one surface
  makes `askForOffers` false for the other; "Not now" writes two `granted=false` rows; a settings grant without a prompt
  answer stops the ask (FR-012, Story 2 scenarios 3, 4, 7).

**Checkpoint**: Story 2 walks (quickstart §3).

## Phase 5: User Story 3 - Promotions respect the night and do not pile up (P1)

**Goal**: quiet hours and limits (T010/T014 already apply them); staff set the limits.
**Independent test**: container tests (T012) plus quickstart §6 (settings).

- [X] T028 [P] [US3] Orders service settings:
  - `apis/edge-api/orders/src/notification-settings/service.ts` (read, update with `notification_settings_change` rows
    per field, validation → `400 invalid_notification_settings`; follow `tax-settings/service.ts` / the points settings
    pattern);
  - `activity` source `apis/edge-api/orders/src/activity/notification-settings.ts`;
  - handlers `notification-settings-v1-get.ts`, `notification-settings-v1-put.ts` (admin and manager; csa → 403),
    `notification-settings-activity-v1-get.ts` (`activityResponse`);
  - three entries in `apis/edge-api/orders/serverless.yml`;
  - unit plus container tests.
- [X] T029 [P] [US3] Back-office `features/settings/notifications/NotificationSettingsScreen.tsx` (+ `repo.ts`, test):
  - the shared Settings layout from `@effy/web-kit`, two number fields, Save;
  - the activity drawer via `useActivityAction`;
  - `useTourPage("notification-settings", …)` with `data-tour` keys;
  - its route in `apps/back-office/src/routes/settings.tsx` and the router;
  - a "Notifications" link (bell icon) under Business in `SettingsIndexScreen.tsx`;
  - a skeleton in the page's shape.
- [X] T030 [US3] Back-office tour CN in `apps/back-office/src/features/tours/tours.ts` (words from spec.md › Guided
  tours), its row in `specs/107-backoffice-guided-tours/spec.md`'s inventory, and run the back-office `tours.test.ts` /
  `tours.guard.test.ts`.

**Checkpoint**: limits are editable; the rules are proved by T012/T014.

## Phase 6: User Story 4 - Drivers and shop staff see what they get (P2)

**Goal**: fixed categories shown with reasons.
**Independent test**: quickstart §5.

- [X] T031 [P] [US4] Driver app `core/push/NotificationCategoryPolicy.kt`: the Kotlin twin for the driver categories,
  with the fixture copy embedded for T004's parity test (`scratchpad/embed-fixture.py`), plus a host test.
- [X] T032 [US4] Driver app `features/account/AccountScreen.kt`: under Notifications, list Work, Announcements and
  Important with their reasons ("Always on"), leaving the phone on/off row unchanged. Run `scripts/driver-guard.sh`.
- [X] T033 [P] [US4] Shop console `features/notifications/NotificationSettings.tsx`: an "Always in your inbox" section
  listing the five shop categories (labels and reasons from shared-types), `data-tour="notifications.categories"`; the
  059 device controls are unchanged.
- [X] T034 [US4] Shop tour NS v2 in `apps/shop-web/src/features/tours/tours.ts` (version 2, new step 3, words from
  spec.md › Guided tours), the NS table in `specs/106-guided-tours/spec.md`, and run shop-web `tours.test.ts` /
  `tours.guard.test.ts`.

## Phase 7: User Story 5 - The phone files Effy's notifications by kind (P2)

**Goal**: Android channels per category.
**Independent test**: quickstart §8.

- [X] T035 [P] [US5] `apis/edge-api/notifications/src/fcm/sender.ts`: `PushMessage.androidChannel` (from the policy of the
  claimed row's audience and category, carried through `drain.ts` `messageFor`); `toFcmMessage` sets
  `android.notification.channel_id` (customer and driver only; shop web push unchanged). Update `sender.test.ts`.
- [X] T036 [P] [US5] Customer app Android:
  - create the four channels from `ANDROID_CHANNELS` (twin) at start (in `MainActivity.kt` or the Application class
    where push is set up);
  - delete the old default channel id;
  - point `default_notification_channel_id` in `androidApp/src/main/AndroidManifest.xml` at `orders`.
- [X] T037 [P] [US5] Driver app Android: the same with `work`, `announcements`, `important`; the default is `work`.

## Phase 8: User Story 6 - Promotions say who they are from and how to stop them (P2)

**Goal**: "Stop offers like this"; versioned wording; privacy v2.
**Independent test**: container test plus UI tests (no real offer until spec 4).

- [X] T038 [P] [US6] Customer app `InboxScreen.kt`:
  - a tap on an `offers`/`news` item always opens the detail `EffySheet` (words, "See offer" when it has a destination,
    "Stop offers like this" / "Stop news like this");
  - stop → PATCH consent false, `via=inbox`, plus an undo snackbar that re-grants (`via=inbox`);
  - `offers_stopped_from_inbox`;
  - a ViewModel test for the stop/undo.
- [X] T039 [P] [US6] Customer website `components/notifications/InboxView.tsx`: the same for offers and news (the detail
  dialog with "See offer" and "Stop offers like this", toast undo through a Server Action/route proxy), plus a test.
- [X] T040 [US6] Confirm `notify()`'s "Effy" check (T010) has a unit test in `notify.test.ts` or the container test, and
  that the privacy v2 page renders on the website and in the app (`LegalContent.kt` regenerated, T007).

## Phase 9: User Story 7 - Staff can see a customer's choices and consent history (P3)

**Goal**: read-only choices plus the consent drawer on the back-office customer page.
**Independent test**: quickstart §3.3.

- [X] T041 [P] [US7] Orders service:
  - `apis/edge-api/orders/src/customers/notification-preferences.ts` (reuse `readPreferences` from edge-shared; minus
    ask/version);
  - activity source `apis/edge-api/orders/src/activity/consent.ts` over `customer_marketing_consent` (rows "Said yes to
    offers" / "Said no to news", details per the contract);
  - handlers `customer-notification-preferences-v1-get.ts`, `customer-consent-activity-v1-get.ts` (`requireStaff`, any
    role read);
  - two entries in `apis/edge-api/orders/serverless.yml`;
  - tests;
  - run the gateway capacity test (staff 218).
- [X] T042 [US7] Back-office `features/customers/CustomerDetailScreen.tsx` (+ `queries.ts`, `repo.ts`):
  - a "Notifications" detail-rows section (each category: push/email on/off, offers/news consent with date);
  - "Consent activity" in the page's More menu opening `ActivityLogDrawer`;
  - no edit control;
  - skeleton rows;
  - a test.

## Phase 10: Polish & cross-cutting

- [X] T043 [P] `docs/telemetry/platform-events.md`: `offers_ask_shown`, `offers_ask_answered`,
  `notification_setting_changed`, `offers_stopped_from_inbox` (props, no personal data).
- [X] T044 [P] `docs/notifications-backlog.md`: mark D1–D6, D8–D10 "(111, done)"; D7 deferred.
- [X] T045 Run every check:
  - shared-types, edge-shared (unit plus containers);
  - customer, orders and notifications unit tests and tsc;
  - the change-map and gateway capacity tests;
  - shop-web, back-office and customer-web tests and builds (+ depcruise);
  - both apps' host tests and Android/iOS compiles;
  - the mobile and driver guards, `check-no-refresh-timers.sh`, `check-tokens`;
  - legal-content check.

  Record the pass/fail state.
- [X] T046 FEATURE-HISTORY.md entry for 111 (what changed, verification, deploy order: db-up → notifications →
  edge-deploy-all → web → apps; wording approval pending), the CLAUDE.md "Features recorded" line, and memory.

## Dependencies

- **Setup (T001–T008)** → **Foundational (T009–T015)** → stories.
- **US1 (T016–T023)** needs T009, T005 and T008 (Kotlin twin).
- **US2** needs US1's repository and route (T016, T018).
- **US3**: T028–T030 are independent of US1/US2 (orders/back-office only).
- **US4, US5** depend only on Setup (policy twins, T035 on T014).
- **US6** needs US1's PATCH and the 110 inbox screens.
- **US7** needs T009 and the migration.
- **Polish** last.

## Parallel examples

- After T001: T003, T004, T005, T006 and T007 in parallel (different packages).
- After Phase 2: US1's backend (T016) ∥ US3 (T028–T030) ∥ US4 (T031–T034) ∥ US5 (T035–T037) ∥ US7's backend (T041).
- Within US1: T018 ∥ T021 ∥ T023.

## Implementation strategy

1. **MVP** = Setup + Foundational + US1: the rules hold for every send, and customers can mute push and email.
2. Add US2 (consent ask): required before spec 4 sends any customer promotion.
3. US3 (limits editable), then US4–US7.
4. Walk the quickstart; spec 4 walks the marketing steps with its first real offer.
