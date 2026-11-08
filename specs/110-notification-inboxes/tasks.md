# Tasks: Notification Inboxes (110)

**Input**: `specs/110-notification-inboxes/` (spec, plan, research R1–R22, data-model, contracts, quickstart)

**Tests**: included where the spec's guarantees are mechanical:
- ownership and isolation (FR-027, FR-028, SC-008);
- exact paging (SC-005);
- the seen and read-all cut-off (FR-010, FR-014);
- pinned items kept apart (FR-003);
- once per order / once per day (FR-029, FR-031);
- the announce after commit (FR-018);
- TS↔Kotlin parity of the categories and the live kind.

Container tests run on the local Postgres (memory: container-tests-local-postgres; `scratchpad/run-ct.sh`).

**Rules carried from the plan**:
- one writer per kind of write (`notify.ts` creates; `read.ts` + `inbox.ts` change state);
- no timers;
- the customer app has no dialogs or drop-downs;
- every console page has a tour;
- loading states draw the page's own shape;
- never edit a committed migration.

## Phase 1: Setup

- [X] T001 Write `db/migrations/20261109090000_notification_inbox.sql` per data-model.md:
  - add `public.notification.pinned_until timestamptz` and CHECK `notification_pinned_important_ck`
    (`pinned_until IS NULL OR importance = 'important'`);
  - drop and re-add `notification_type_check` with `'driver_runs_today'` added (24 types);
  - `CREATE INDEX notification_unseen_idx ON public.notification (recipient_sub, audience) WHERE seen_at IS NULL AND archived_at IS NULL`;
  - goose Down reverses all three; it deletes `driver_runs_today` rows before restoring the old CHECK.
- [X] T002 [P] Create `packages/shared-types/src/notification-inbox.ts` per contracts/inbox-api.md:
  - `InboxItemDTO`, `InboxPageDTO`, `InboxCountDTO`, `InboxReadAllDTO`, `InboxArchiveRequest`, `InboxArchiveDTO`;
  - `InboxFilter = "all" | "unread"`;
  - `INBOX_CATEGORIES` (category → `{label, icon, filterableBy: audience[]}`): customer orders/points/offers/news/
    important/support; shop orders/stock/products/announcements/important; driver none;
  - `inboxCategoriesFor(audience)`;
  - export from `packages/shared-types/src/index.ts`.
- [X] T003 [P] Create `packages/shared-types/src/notification-inbox.fixtures.json` (each category: key, label, Lucide
  icon name, filterable audiences) and `notification-inbox.test.ts`. The test checks `INBOX_CATEGORIES` against the
  fixture, and that the Kotlin copies embedded in both apps (T025, T044) are identical, with the same pattern as
  `notification-destinations.test.ts`.
- [X] T004 [P] Add `customerWebPathFor(destination: CustomerDestination): string` to
  `packages/shared-types/src/notification-destinations.ts` (R19 table):

  | Destination | Path |
  |---|---|
  | home | `/` |
  | orders | `/orders` |
  | order | `/orders/{id}` |
  | points | `/account/points` |
  | product | `/product/{id}` |
  | aisle | `/search?category=<key>` |
  | search | `/search?q=` |
  | sale | `/offers` |

  Then add `webPath` to every customer case in `notification-destinations.fixtures.json`, and assert it in
  `notification-destinations.test.ts`.
- [X] T005 [P] Add `"inbox"` to `LIVE_KINDS` in `packages/shared-types/src/live.ts` (with its comment: a person's
  inbox changed; their own channel, or their shop's) and `INBOX("inbox")` to `packages/mobile-kit/common/live/LiveKind.kt`.
  `live.test.ts` must pass.
- [X] T006 Add the inbox DTOs to `packages/shared-types/src/customer-contract.ts` and `driver-contract.ts`, then
  regenerate with `pnpm --filter @effy/shared-types contract:gen` and `driver-contract:gen`
  (`contract/Dto.kt`, `contract-driver/DriverDto.kt`). Depends on T002.

## Phase 2: Foundational (blocks every story)

- [X] T007 Add `afterCommit(tx, fn)` to `apis/edge-api/shared/src/lib/db.ts` (R6):
  - a `WeakMap<client, Array<() => Promise<void>>>`;
  - `withTransaction` and `transactorFor` register the client after `BEGIN`, run the callbacks after `COMMIT`
    (awaited; each wrapped so one failure never throws), and drop them on `ROLLBACK`;
  - for a `tx` that is not an open transaction, `afterCommit` awaits `fn` straight away;
  - export it from the package index.
- [X] T008 Test `afterCommit` in `apis/edge-api/shared/src/lib/db.after-commit.container.test.ts`:
  - it runs after commit and not after rollback;
  - it runs immediately for `pooled`;
  - one failing callback does not stop the next.
- [X] T009 Extend `LiveChange` in `apis/edge-api/shared/src/live/announce.ts` with `kind: "inbox"` on the customer,
  driver and shop scopes, and add `announceInbox(recipients: {audience, sub}[], db)`
  (`apis/edge-api/shared/src/notifications/announce-inbox.ts`):
  - it resolves the scope: customer → sub; driver → `driver.id` by `cognito_sub`; shop → the shop id through
    `shop_staff`, active only, reusing the `live/scope.ts` rules;
  - it removes duplicate channels;
  - it calls `announce`, and never throws.
- [X] T010 Update `apis/edge-api/shared/src/live/customer-announce.guard.test.ts` to name
  `notifications/announce-inbox.ts` as the one new builder of a customer update (own channel, kind `inbox` only).
  Prove it by breaking it.
- [X] T011 Extend `apis/edge-api/shared/src/notifications/catalogue.ts` (R11, R12):
  - entry `title` / `body` may be `string | ((s: NotificationSubject) => string)`, and `NotificationSubject` gains
    `count?: number`;
  - add `driver_runs_today` (driver, work, important, destination `{kind:"today"}`), titled "You have 1 run today" or
    "You have N runs today", with the body "Open Today to see what's first.";
  - add the type to `NOTIFICATION_TYPES`, the shared type list and `catalogue.test.ts`;
  - `notification-types.contract.test.ts` reads the T001 migration's CHECK and must pass.
- [X] T012 Update `apis/edge-api/shared/src/notifications/notify.ts`:
  - the input gains `pinnedUntil?: Date | null`, written to `pinned_until`, and refused for a non-important type;
  - the words are resolved with the subject;
  - the CTE returns the inserted recipients;
  - after the insert, `afterCommit(tx, () => announceInbox(inserted, pooled))`;
  - an empty `channels` array is allowed (inbox only).
- [X] T013 Extend `apis/edge-api/shared/src/notifications/notify.container.test.ts`:
  - `pinnedUntil` is stored, and refused for a normal type;
  - inbox-only creates no delivery;
  - the announce runs once after commit and not on rollback (inject a fake `announce` through `AnnounceDeps`/env).
- [X] T014 Create `apis/edge-api/shared/src/notifications/inbox.ts` (R1–R5, data-model rules). Every statement is
  keyed on `recipient_sub` **and** `audience`.
  - `listInbox(sub, audience, {filter, category, cursor, limit})` returns
    `{pinned, items, nextCursor, categories, unseenCount}`:
    - keyset on `(created_at DESC, id DESC)`, with an opaque base64 cursor;
    - `pinned` and `categories` on the first page only;
    - pinned rows are left out of `items`;
    - listed = not archived and not ended.
  - `unseenCount(sub, audience)` uses `notification_unseen_idx`.
  - `markSeen(sub, audience, before)` and `readAll(sub, audience, before)` cap the cut-off at `least(before, now())`.
  - `setArchived(sub, audience, id, archived)` returns null when it is not theirs.
  - `endsLabel` comes from R15 (offers/news/announcements/important with `expires_at`, on `OPERATING_TZ`: "Ends Sun",
    "Ends 5 pm", "Ends today 5 pm").
  - Every function takes a `Queryable` (default `pooled`).
  - Export from `notifications/index.ts`.
- [X] T015 Write `apis/edge-api/shared/src/notifications/inbox.container.test.ts`:
  - newest first;
  - 1,000 items paged with none lost or repeated (SC-005);
  - unread and category filters, and `categories` present;
  - pinned kept apart and dropped after read or after its pin ends;
  - expired and archived not listed or counted;
  - the seen cut-off leaves a later item unseen;
  - read-all leaves a later item unread;
  - archive and undo keep the read state;
  - another person's id and another audience's id: null, nothing changed;
  - `endsLabel` only for the named categories.
- [X] T016 Create `apis/edge-api/shared/src/notifications/inbox-handlers.ts`: `makeInboxHandlers(audience, deps)`
  returns `{list, unseenCount, seen, readAll, patch}` per contracts/inbox-api.md.
  - **Validation**: `filter`, a `category` allowed for the audience (the driver takes none), `limit` 1–50, cursor
    shape, `before` ISO, `archived` boolean. Bad input gets 400 `invalid_inbox_query` / `invalid_inbox_change` /
    `invalid_notification_id`.
  - **Not found**: 404 `notification_not_found`.
  - **Announce**: after `seen`, `readAll` and `patch`, `announceInbox([{audience, sub}])`.
  - **Read route**: also make `read-handler.ts` announce after a successful read.
- [X] T017 [P] Write `apis/edge-api/shared/src/notifications/inbox-handlers.test.ts`: validation per audience
  (customer and shop categories, the driver refuses `category`), 401 without a subject, 404 mapping, and that the
  announce is called after each change.
- [X] T018 Update `apis/edge-api/shared/src/notifications/notifications.guard.test.ts`: `UPDATE public.notification`
  is allowed only in `read.ts` and `inbox.ts`. Prove it by breaking it.
- [X] T019 [P] Add the five customer routes in `apis/edge-api/customer/src/functions/`:
  - `customer-notifications-v1-get.ts`
  - `customer-notifications-v1-unseen-count-get.ts`
  - `customer-notifications-v1-seen-post.ts`
  - `customer-notifications-v1-read-all-post.ts`
  - `customer-notifications-v1-id-patch.ts`

  Each is one line over `makeInboxHandlers("customer")`. Add five functions to
  `apis/edge-api/customer/serverless.yml`, copying the existing `CustomerNotificationsV1IdReadPost` entry's
  authorizer and shape.
- [X] T020 [P] Add the same five routes for the driver (`apis/edge-api/driver/src/functions/driver-notifications-v1-*.ts`
  + `driver/serverless.yml`). Add exemptions for them in `apis/edge-api/driver/src/work/open.guard.test.ts`, as 109
  did for the read route.
- [X] T021 [P] Add the same five routes for the shop (`apis/edge-api/shop/src/functions/shop-notifications-v1-*.ts` +
  `shop/serverless.yml`).
- [X] T022 Add SILENT entries for the 15 new routes to `apis/edge-api/shared/src/live/change-map.guard.test.ts`. They
  change only the person's own inbox and announce `inbox` themselves. Run `gateway-capacity.contract.test.ts` and
  expect shared 185/300.
- [X] T023 Run `apis/edge-api/shared` vitest and tsc, the customer/driver/shop unit tests and tsc, and the container
  tests T008, T013 and T015.

**Checkpoint**: the inbox exists server-side for all three audiences, and every new notification announces `inbox`.

## Phase 3: User Story 1 - A customer finds what they were told in the app (P1) 🎯 MVP

**Goal**: the customer app's inbox: bell count, grouped list, filters, tap to open, archive with undo, mark all read,
live.

**Independent Test**: quickstart walk 1.

- [X] T024 [P] [US1] Create `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/features/notifications/data/HttpInboxRepository.kt`
  and `domain/InboxRepository.kt`:
  - `page(filter, category, cursor)`, `unseenCount()`, `markSeen(before)`, `readAll(before)`,
    `setArchived(id, archived)`;
  - a 404 on archive or undo is treated as done;
  - map the contract DTOs to domain `InboxItem` (destination parsed with `parseCustomerDestination`; `null` = detail).
- [X] T025 [P] [US1] Create `features/notifications/domain/InboxCategory.kt`: the Kotlin twin of `INBOX_CATEGORIES`
  (customer), with labels and icons, and the fixture JSON embedded exactly as T003 checks. Add `InboxGrouping.kt`:
  Today / Yesterday / Earlier on `OPERATING_TZ`.
- [X] T026 [US1] Create `core/push/InboxBadge.kt`, an app-level store (`StateFlow<Int>`) in `AppContainer`. It
  re-reads `unseenCount` on start, on `container.live.changes(LiveKind.INBOX)`, when the app returns to the front,
  after a foreground push, and after any inbox action. Signed out → 0.
- [X] T027 [US1] Create `features/notifications/presentation/InboxViewModel.kt` (MVVM):
  - immutable state: pinned, groups, chips (All, Unread and the categories present), filter, loading/end/error;
  - `open()` loads the first page and then `markSeen(newest createdAt)`;
  - `loadMore()`, `select(filter|category)`, `tap(item)` (optimistic read, then the destination or the detail
    sheet), `archive(item)` (optimistic removal plus a 5 s undo token), `undo()` and `markAllRead()`;
  - reload the first page on `LiveKind.INBOX`;
  - no timers.
- [X] T028 [P] [US1] Create `core/presentation/EffySwipeRow.kt`, a kit row with swipe-to-archive (end-to-start,
  labelled action, haptic, a 44dp target and an accessible "Archive" action). Add it to `scripts/mobile-guard.sh`'s
  allowed kit components if the guard lists them.
- [X] T029 [US1] Create `features/notifications/presentation/InboxScreen.kt`:
  - `EffyAppBar` "Notifications", with a settings icon that opens the phone's settings (`rememberOpenAppSettings`);
  - the chip row, the pinned section, then the day groups;
  - rows with the category icon, title, two lines of body, relative time, the unread dot and `endsLabel`;
  - `EffySwipeRow`, endless scroll, and a "Mark all read" action in the app bar when anything is unread;
  - a skeleton in the list's own shape (`EffySkeletonText` rows);
  - empty states for first use and for an empty filter.

  Add `InboxDetailSheet.kt`, an `EffySheet` with the full title and body and a close button (FR-013, FR-025).
- [X] T030 [US1] Wire into `app/CustomerShell.kt` and `features/account/presentation/AccountScreens.kt`:
  - `CustomerNavKey.Notifications` shows `InboxScreen`;
  - a tap routes through the existing `openFromPush` / `pushNavSteps` path (109), with the item's destination;
  - the archive undo uses `shellSnackbar`;
  - a guest tapping the bell is sent through deferred sign-in, then the inbox;
  - delete `features/notifications/presentation/NotificationsScreen.kt`.
- [X] T031 [US1] Show the count on the header bell in `core/presentation/EffyFrame.kt`: a `LocalInboxCount` composition
  local provided from `InboxBadge` in the shell, drawn as a small `accent2` badge ("9+" above 9) with an accessible
  label ("Notifications, 3 new").
- [X] T032 [US1] Add analytics to `core/observability/AnalyticsEvent.kt` and fire them from the ViewModel (R20):
  - `InboxOpened(surface="app")`;
  - `InboxItemOpened(type, category, fallback)`;
  - `InboxItemArchived` and `InboxArchiveUndone` (type, category);
  - `InboxMarkedAllRead`.
- [X] T033 [US1] Host tests in `apps/customer-mobile/shared/src/commonTest/.../features/notifications/`:
  - `InboxViewModelTest`: open → seen with the newest createdAt; tap marks read and routes; archive then undo
    restores; mark all read; a live update reloads; chips only for categories present;
  - `InboxGroupingTest` (Effy-day boundaries);
  - `InboxCategoryFixtureTest`;
  - `InboxBadgeTest`.

  Then build: `./gradlew :shared:allTests :androidApp:assembleDebug` and the iOS framework compile;
  `scripts/mobile-guard.sh`.

## Phase 4: User Story 2 - A shop operator keeps track in the console (P1)

**Goal**: the bell, the side panel and the `/notifications` page with filters in the URL, plus its tour.

**Independent Test**: quickstart walk 4.

- [X] T034 [P] [US2] Create `apps/shop-web/src/features/notifications/inbox-api.ts` over the shop API client
  (`listInbox`, `unseenCount`, `markSeen`, `readAll`, `setArchived`) and `useInbox.ts`:
  - React Query keys under `["shop","inbox", …]`;
  - `useInfiniteQuery` for pages; `useUnseenCount`;
  - mutations with optimistic updates that invalidate `["shop","inbox"]`.
- [X] T035 [P] [US2] Add `inbox: [["shop","inbox"]]` to `apps/shop-web/src/features/live/routes.ts` and a case in
  `features/live/routes.test.ts`.
- [X] T036 [US2] Create `apps/shop-web/src/features/notifications/InboxList.tsx`, shared by the panel and the page:
  - the pinned block, then Today / Yesterday / Earlier on `OPERATING_TZ`;
  - rows with the Lucide category icon, title, body, relative time, the unread dot (`accent2`), `endsLabel`, and an
    archive icon button with an accessible label;
  - a click marks read (`markNotificationRead` from 109's api.ts), then navigates with `shopPathFor`;
  - archive shows a toast with Undo (5 s);
  - a row skeleton in the list's own shape;
  - empty states for first use and per filter.
- [X] T037 [US2] Create `apps/shop-web/src/features/notifications/NotificationBell.tsx` and `InboxPanel.tsx`:
  - the bell, with a count badge ("9+"), sits in `headerActions` in `apps/shop-web/src/routes/app.tsx` beside
    `SoundChip`;
  - it opens the design-system Drawer `direction="right"` (floating);
  - the panel holds the first 20, "Mark all read" and a "See all" link to `/notifications`;
  - opening it calls `markSeen(newest)`, and a click closes the panel;
  - set `navigator.setAppBadge(count)` / `clearAppBadge()` when supported (R8).
- [X] T038 [US2] Create `apps/shop-web/src/routes/notifications.tsx`:
  - search params validated as `{filter: "all"|"unread", category?: shop category}`;
  - the page head is "Notifications" with "Mark all read";
  - a filter bar (All / Unread plus the five categories) carrying `data-tour` keys
    `notifications.list`, `notifications.filters` and `notifications.mark-all`;
  - `InboxList` with endless scroll;
  - `markSeen` on open;
  - `useTourPage("notifications", { status: tourStatus(query) })`;
  - add the route to the navigation or command palette as the app's routing requires.
- [X] T039 [US2] Add the `notifications` tour to `apps/shop-web/src/features/tours/tours.ts` (version 1, path
  `/notifications`), with the four steps word for word from spec.md › Guided tour. Copy the same words into
  `specs/106-guided-tours/spec.md` › Tour Inventory (the source `tours.test.ts` reads). Add a named "feed"
  exception for `routes/notifications.tsx` in `apps/shop-web/src/__tests__/list-screens.guard.test.ts` (built: not needed - that guard only
  checks raw `Table` use, which the feed has none of; `reachable.test.ts` names the page as reached from the bell instead). Check that
  `skeletons.guard.test.ts` passes.
- [X] T040 [P] [US2] Add `notif_inbox_opened`, `notif_inbox_item_opened`, `notif_inbox_archived`,
  `notif_inbox_undo` and `notif_inbox_all_read` to `apps/shop-web/src/lib/telemetry.ts` (fields as R20), and fire
  them.
- [X] T041 [US2] Tests in `apps/shop-web/src/features/notifications/__tests__/`:
  - `InboxList.test.tsx`: grouping, pinned first, a click marks read and navigates, archive and undo;
  - `NotificationBell.test.tsx`: the count, opening marks seen;
  - a route test that the filter round-trips through the URL.

  Then `pnpm --filter shop-web test` and `build`.

## Phase 5: User Story 3 - A driver sees their work even if they were not signed in (P1)

**Goal**: the driver inbox with a bell on Today, plus the catch-up notice.

**Independent Test**: quickstart walk 5.

- [X] T042 [P] [US3] Create `apis/edge-api/driver/src/devices/catch-up.ts`:
  `catchUpNotice(tx, driverSub, now)`:
  - the Effy date on `OPERATING_TZ`;
  - is there a `run_assigned` for this sub created that day with a push delivery `status = 'no_device'`?
  - N = the driver's rounds dated that Effy day still assigned to them (`planned` / `in_progress`);
  - if both, `notify({type: "driver_runs_today", recipients: [{sub}], subject: {entityId: date, count: N},
    dedupeScope: date, channels: [], pinnedUntil: <end of that Effy day>})`.

  Call it from `apis/edge-api/driver/src/functions/driver-devices-v1-post.ts`, after the device is registered, inside
  a transaction. A failure is logged and never fails the registration.
- [X] T043 [US3] Write `apis/edge-api/driver/src/devices/catch-up.container.test.ts`:
  - `no_device` plus 2 runs gives one notice with N=2, pinned until the end of the day;
  - calling it again gives no second notice;
  - a delivered push gives no notice;
  - no runs left gives no notice;
  - yesterday's `no_device` gives no notice;
  - a run taken away leaves the notice counting only runs still theirs.
- [X] T044 [P] [US3] Create the driver app repository, category twin and grouping
  (`apps/driver-mobile/shared/src/commonMain/kotlin/com/effyshopping/driver/mobile/features/inbox/{data,domain}/`),
  as T024–T025, with no category chips. Embed the fixture copy for T003.
- [X] T045 [US3] Create `core/push/InboxBadge.kt` in the driver app (as T026, on `LiveKind.INBOX`, foreground, push and
  actions) and add it to `app/AppContainer.kt`.
- [X] T046 [US3] Create `features/inbox/presentation/{InboxViewModel,InboxScreen}.kt` in the driver app's kit:
  - All / Unread only;
  - the pinned section;
  - swipe to archive with an undo snackbar;
  - Mark all read;
  - a skeleton (`DriverSkeletonText` rows);
  - empty states;
  - a detail view for an unknown destination.

  Taps go through `DriverShell`'s `openFromPush` (109; "Today if not yours").
- [X] T047 [US3] Add the bell with the count to the Today header (`features/today/presentation/TodayScreen.kt`),
  pushing `InboxRoot` onto the Today stack (`core/nav/DriverRoutes.kt`, `app/DriverShell.kt`). Add the R20
  analytics to the driver `AnalyticsEvent`.
- [X] T048 [US3] Driver host tests (`InboxViewModelTest`, `InboxBadgeTest`, the category fixture), then
  `./gradlew :shared:allTests :androidApp:assembleDebug`, the iOS compile and `scripts/driver-guard.sh`.

## Phase 6: User Story 4 - Customers are told when their order is on its way (P2)

**Independent Test**: quickstart walk 3.

- [X] T049 [US4] In `apis/edge-api/driver/src/work/load.ts`, inside the transaction after `moved`:
  - select the distinct orders (and the customer's `cognito_sub`) on the moved `round_stop` ids, joining through the
    stop's packages to `public."order"` where `delivery_type = 'effy'`;
  - for each, `notify({type: "order_out_for_delivery", recipients: [{sub}], subject: {entityId: orderId},
    dedupeScope: orderId, channels: ["push"]})`.
- [X] T050 [US4] Extend the driver load container test (`apis/edge-api/driver/src/work/drop-progress.container.test.ts`
  or a new `load-notify.container.test.ts`):
  - one notification per order;
  - none on a second load or for the order's second parcel;
  - one per order for two orders on one drop;
  - the notification is in the inbox for a customer with no device (status `no_device`).

## Phase 7: User Story 5 - The inbox stays tidy and current (P2)

**Goal**: cross-surface behaviour not already covered by US1–US3: other devices update, ended items, pinned rules.

**Independent Test**: quickstart walk 6, plus archive and undo across two devices.

- [X] T051 [US5] Write `apis/edge-api/shared/src/notifications/inbox-live.container.test.ts`:
  - `notify` for a customer, a driver and two operators at one shop announces once per channel after commit (one for
    the shop);
  - `seen`, `readAll`, `patch` and `read` each announce to the caller's own channel.
- [X] T052 [P] [US5] Check every surface re-reads on returning to the front (customer app, driver app, shop-web,
  customer-web) and add the missing one. Run `scripts/check-no-refresh-timers.sh`.

## Phase 8: User Story 6 - Customers on the website have the same inbox (P2)

**Independent Test**: quickstart walk 2.

- [X] T053 [P] [US6] Add `apps/customer-web/app/api/notifications/` route handlers (proxying through `lib/api/proxy.ts`
  with the session; a guest gets 204):
  - `unseen-count/route.ts` (GET)
  - `route.ts` (GET page)
  - `seen/route.ts`
  - `read-all/route.ts`
  - `[id]/route.ts` (PATCH)
  - `[id]/read/route.ts` (POST)
- [X] T054 [US6] Create `apps/customer-web/components/notifications/NotificationBell.tsx`, a client island in the
  header chrome beside the account menu (`components/header/`):
  - it fetches the count, and shows nothing for a guest;
  - after a signed-in answer, it opens the live channel with `@effy/web-kit/live` (as `components/live/LiveRefresh.tsx`
    does, through `/api/live`) and re-reads on `inbox` and on caught-up;
  - it links to `/account/notifications` with `prefetch={false}`;
  - `dependency-cruiser.first-load.cjs` must stay green.
- [X] T055 [US6] Create `apps/customer-web/app/(account)/account/notifications/page.tsx`:
  - the server renders the first page from `searchParams` (`filter`, `category`);
  - a client `InboxList.tsx` handles load more, chips for the categories present, grouping on `OPERATING_TZ`, the
    pinned block, the unread dot, `endsLabel`, archive with an undo toast, Mark all read, and `markSeen` on mount;
  - a click marks read, then `router.push(customerWebPathFor(destination))`;
  - an unknown destination opens the detail (shadcn responsive Dialog);
  - a skeleton from `@/components/ui/skeletons` in the list's shape;
  - add the account navigation entry (`app/(account)/account/tabs.ts` / `sections.tsx`).
- [X] T056 [US6] customer-web analytics through its PostHog helper (R20, surface `web`), and tests: `InboxList.test.tsx`
  (grouping, tap path, archive and undo), `NotificationBell.test.tsx` (a guest gets nothing). Then
  `pnpm --filter customer-web test` and `build`.

## Phase 9: User Story 7 - The phone's app icon shows the count (P3)

**Independent Test**: quickstart walk 7.

- [X] T057 [US7] In `apis/edge-api/notifications/src/worker/repository.ts`, the batch claim adds each recipient's
  unseen count (a lateral count on `notification_unseen_idx`) to `ClaimedDelivery.badge`. In `fcm/sender.ts`,
  `PushMessage.badge` maps to APNs `aps.badge` and Android `notification.notificationCount` for the customer and
  driver audiences (not shop). Update `sender.test.ts` and `repository.container.test.ts`.
- [X] T058 [P] [US7] Add a platform `clearAppBadge()` to both apps:
  - iOS (`iosMain/.../core/push/`): `UNUserNotificationCenter.setBadgeCount(0)`;
  - Android (`androidMain/.../core/push/`): `NotificationManagerCompat.cancelAll()`.

  Call it from each `InboxViewModel.open()` after `markSeen` succeeds.

## Phase 10: User Story 8 - "Points about to expire" reaches app users (P3)

**Independent Test**: quickstart walk 8.

- [X] T059 [US8] In `apis/edge-api/shared/src/points/warnings.ts`, change the channels to `["push", "email"]`. Update
  the warnings container test to expect a push and an email delivery, once per expiry.

## Phase 11: Polish & cross-cutting

- [X] T060 [P] Document the `inbox_*` events (and shop `notif_inbox_*`) in `docs/telemetry/platform-events.md`.
- [X] T061 [P] Mark C1–C7, A7, F2, F6, F7 and F9 as "In spec 110" in `docs/notifications-backlog.md`.
- [X] T062 Run the full automated list in quickstart.md:
  - shared-types, edge-shared, customer/driver/shop/notifications unit and container tests;
  - shop-web and customer-web test and build;
  - both apps' host tests and compiles;
  - the guard scripts and gateway capacity.

  Fix what is ours, and report failures that predate this feature.
- [X] T063 Add the 110 entry to `FEATURE-HISTORY.md` (what changed, verified, deploy order from plan.md) and the
  "Features recorded" line in `CLAUDE.md`. Update the memory note.

## Dependencies & execution order

- **Phase 1 → Phase 2**:
  - T002 before T006, T024, T034 and T053;
  - T005 before T009, T026, T035 and T045;
  - T001 before T011 and every container test.
- **Phase 2 blocks every story**. Within it:
  - T007 → T009 → T012 → T013;
  - T011 → T012;
  - T014 → T015, T016 → T017, T019–T021 → T022 → T023.
- **US1, US2, US3 and US6** (the surfaces) are independent of one another after Phase 2.
- **US4** (T049–T050) and **US8** (T059) need only Phase 2 (notify announce) and can run any time after it.
- **US5** needs Phase 2. T052 checks the surfaces, so it runs after US1, US2, US3 and US6.
- **US7**: T057 needs only Phase 1 (the index); T058 needs the inbox ViewModels (T027, T046).
- **Polish** last.

## Parallel examples

- Phase 1: T002, T004 and T005 together, then T003 and T006.
- Phase 2: after T014, run T016/T017 and T019, T020 and T021 together.
- After Phase 2:
  - the customer app (T024–T033), shop-web (T034–T041), driver (T042–T048) and customer-web (T053–T056) are four
    parallel streams;
  - T049, T057 and T059 fit between them.

## Implementation strategy

1. **MVP = Phases 1–3**: the server inbox for everyone and the customer app inbox. Customers can find everything they
   were told.
2. Then the shop console (US2) and the driver app (US3), the other two P1 stories.
3. Then out for delivery (US4), the live and tidy checks (US5) and the customer website (US6).
4. Then the badge (US7) and the points push (US8).
5. One deploy at the end (plan.md › Deploy order). The migration is additive, so a partial deploy is safe.
