# Tasks: Back-Office Messages (112)

**Input**: `specs/112-backoffice-messages/` (spec, plan, research R1–R17, data-model, contracts, quickstart)

**Tests**: included where the spec's guarantees are mechanical:
- no duplicate and no gap after a stop or crash (FR-013, SC-003);
- 20,000 recipients (SC-002);
- no offer without a yes (SC-004);
- the report adding up (SC-005);
- CSA refusals (SC-007);
- every audience filter against a hand query;
- kinds ↔ policy ↔ CHECK parity.

Container tests run on the local Postgres recipe (memory: container-tests-local-postgres; `scratchpad/run-ct.sh`). The
migration is run with real goose up / down-to / up.

**Rules carried from the plan**:
- one writer per fact: notifications by `notify()`; delivery outcomes by the drain; message state by
  `admin/src/messages/service.ts` and the worker; `message_event` append-only;
- no timers: the back-office re-reads on the ops kind `messages`;
- no client SQL;
- `OPERATING_TZ` only;
- no personal data in telemetry or `message_event.detail`;
- every console page has a tour; skeletons are the page's shape; shadcn only;
- no dialogs in the customer app;
- never edit a committed migration; no compatibility fields;
- pictures only through `publicImageUrl`.

## Phase 1: Setup

- [X] T001 Write `db/migrations/20261111090000_backoffice_messages.sql` per data-model.md:
  - tables `message` (every CHECK, including `message_status_fields_ck` and `kind <> 'direct' OR push`),
    `message_audience` (PK, destination CHECK), and `message_event` (event CHECK);
  - indexes `message_list_idx`, `message_due_idx`, `message_sending_idx` and `message_event_idx`;
  - `notification.message_id` (FK, no cascade), `notification.image_url`, and CHECK `image_url IS NULL OR source <>
    'system'`;
  - `notification_type_check` re-created with `customer_message`, `driver_message` and `shop_message` (copy the current
    list from `20261109090000_notification_inbox.sql` Up);
  - CHECK `notification_message_type_ck`;
  - the partial index `notification_message_idx`;
  - `notification_settings.max_recipients_per_message` (DEFAULT 20000, CHECK 1–200000);
  - a full Down: delete notifications of the three types before restoring the type CHECK; drop the columns, index and
    tables;
  - any `DO $$` body wrapped in goose StatementBegin/End.
- [X] T002 Run the migration with real goose on a fresh local database (`up`, `down-to 20261110090000`, `up`). Record it
  for FEATURE-HISTORY (T075).
- [X] T003 [P] Create `packages/shared-types/src/messages.ts` per research R5 and contracts/messages-api.md:
  - `MessageKind`, `MESSAGE_KINDS` (audiences allowed, and `{category, importance}` per audience);
  - `MESSAGE_STATUSES`;
  - `MESSAGE_LIMITS` (title 60, body 500, lock-screen preview lengths: title 40, body 110 on iOS and 90 on Android);
  - the filter shapes `CustomerAudienceFilter`, `DriverAudienceFilter` and `ShopAudienceFilter` (R4 tables, with their
    max array lengths);
  - the DTOs `MessageDraftDTO`, `MessageDTO`, `MessageRowDTO`, `MessageReportDTO`, the audience-count request and
    response, the test response, the send request, and the picture upload request and response;
  - `messageNamesEffy(title, body)` (`/effy/i`);
  - exported from `index.ts`.
- [X] T004 [P] Create `packages/shared-types/src/messages.test.ts`. It checks:
  - each `MESSAGE_KINDS` category is declared for its audience in `NOTIFICATION_CATEGORY_POLICY`;
  - offer and news are customer-only, with marketing categories;
  - announcement has no customer;
  - direct has all three audiences;
  - the `message.kind`, `status` and `message_event.event` CHECK lists in the T001 migration equal
    `MESSAGE_KINDS` / `MESSAGE_STATUSES` and the event list (text-parse the migration, as `notification-categories.test.ts`
    does).
- [X] T005 [P] Add `imageUrl: string | null` to `InboxItemDTO` in `packages/shared-types/src/notification-inbox.ts`, and
  to its fixture `notification-inbox.fixtures.json`. Regenerate the Kotlin contract DTOs for the customer and driver apps
  (the same generator 110 used) and commit the outputs.
- [X] T006 [P] Wire the new stack:
  - `apis/edge-api/shared/src/lib/serverless-stacks.ts`: `listStacks()` returns `admin-messages` →
    `admin/serverless.messages.yml` on the staff gateway;
  - `Makefile`: `EDGE_STACK_DIR_admin-messages := admin`, `EDGE_STACK_CONFIG_admin-messages := serverless.messages.yml`,
    added to `EDGE_ALL_SERVICES` after `admin-promotions`, the `case` at the `edge-deploy-all` loop, and both usage
    strings.
- [X] T007 Create `apis/edge-api/admin/serverless.messages.yml` by copying the shape of `serverless.promotions.yml`
  (provider, params, layers, esbuild, IAM, the staff authorizer SSM id, media bucket env for presigning). Leave
  `functions:` empty; the story phases add them.

## Phase 2: Foundational (blocks every story)

- [X] T008 Extend `apis/edge-api/shared/src/notifications/catalogue.ts`:
  - add types `customer_message`, `driver_message` and `shop_message` to `NotificationType`;
  - add their entries: audience; a category declared for that audience (customer `support`, driver and shop
    `announcements`), so 111's policy test still passes; it is never used, because the message supplies the real one; importance `normal`; tag `customer-message` / `driver-message` / `shop-message`; group
    `customer` / `driver` / `attention`; title and body `"Message from Effy"`; destination = the audience's home
    (`home` / `today` / `queue`);
  - export `isMessageType(t)`;
  - update `notification-types.contract.test.ts` and `catalogue.test.ts` for the three types.
- [X] T009 Extend `apis/edge-api/shared/src/notifications/notify.ts` per research R1 and contracts/sending.md:
  - `NotifyInput.message?: { messageId: string | null; source: 'campaign' | 'direct'; category; importance; title; body;
    destination; imageUrl: string | null }`;
  - throw when `message` is set on a non-message type or missing on a message type;
  - take words, category, importance and destination from `message`;
  - check `policyFor(audience, message.category)`;
  - allow `pinnedUntil` when `message.importance === 'important'`;
  - insert `message_id`, `image_url` and `source` (`'system'` for every non-message call) in the same INSERT;
  - the Effy-name check stays.

  No existing caller changes.
- [X] T010 [P] Add cases to `apis/edge-api/shared/src/notifications/notify.container.test.ts`:
  - each kind × audience from `MESSAGE_KINDS` writes the right category, importance, source, `message_id` and
    `image_url`;
  - an offer reaches only a customer with a current yes;
  - a direct message to a customer with push off still writes a `pending` push (support is required);
  - an important one is pinned;
  - the same `messageId` twice writes nothing the second time;
  - a message type without `message` throws, and a system type with `message` throws.
- [X] T011 Move `ON_DUTY_EXISTS` from `apis/edge-api/fleet/src/drivers/sql.ts` to
  `apis/edge-api/shared/src/lib/driver-duty.ts`, exported through the package. Fleet imports it from there, leaving one
  copy.
- [X] T012 Create `apis/edge-api/shared/src/notifications/messages/audience.ts` per research R4:
  - `parseAudience(audience, json)` validates the closed filter shape and throws `AudienceInvalid` on an unknown key or a
    bad value;
  - `audienceSql(audience, filter, { afterSub, limit })` returns `{text, values}` selecting `DISTINCT sub, email` of
    active people, ordered by `sub`;
  - `countSql(audience, filter, consentCategory?)` returns `matched`, plus `consented` via `consentGrantedSql` when the
    category is offers or news;
  - `resolveCustomerEmails(db, emails)` returns `{ids, notFound, repeated}` (case-insensitive, at most 5,000);
  - each filter is a fixed fragment with parameters;
  - shop audience: staff with `status = 'active'` at shops with `status = 'active'`, with `managersOnly` via
    `shop_staff_role`;
  - driver `workToday` / `collectionToday` / `deliveryToday` use Effy's day via `OPERATING_TZ`;
  - export from `notifications/index.ts`.
- [X] T013 [P] Create `apis/edge-api/shared/src/notifications/messages/audience.container.test.ts`. For **every** filter
  key, seed people who match and people who don't, and compare `audienceSql` against a hand-written query:
  - customers: none, people, postcodes, groups, orderedWithinDays, neverOrdered, hasPoints, appUsers, and AND
    combinations;
  - drivers: none, onDuty, workToday, collectionToday, deliveryToday, clearance (zone and everywhere), people;
  - shops: none, shops, managersOnly.

  Also check: a closed customer, a deactivated driver and a closed shop are excluded; `afterSub` paging covers everyone
  once; `countSql` consented equals the hand count; email resolution reports not-found and repeated.
- [X] T014 Create `apis/edge-api/shared/src/notifications/messages/withdraw.ts` with
  `withdrawMessageItems(tx, messageId)`, per contracts/sending.md › Withdraw. It returns the count. Add the file to the
  `UPDATE public.notification` writer list in `notifications.guard.test.ts`, with a comment naming 112 R8.
- [X] T015 [P] Create `apis/edge-api/shared/src/notifications/messages/messages.guard.test.ts`. It fails:
  - any `message_event` UPDATE or DELETE in source;
  - audience SQL fragments (`device_token`, `points_usable(`, `driver_zone_capability`) used by any message module other
    than `audience.ts`;
  - an `INSERT INTO public.message\b` outside `admin/src/messages/repository.ts`;
  - an `UPDATE public.message\b` outside that repository and `notifications/src/messages/repository.ts`.
- [X] T016 [P] Return `image_url` as `imageUrl` from the inbox reads in `apis/edge-api/shared/src/notifications/inbox.ts`
  (`COLUMNS`, `Row`, `toItem`), and update `inbox.container.test.ts` and `inbox-handlers.test.ts`.
- [X] T017 [P] Picture in the push:
  - `apis/edge-api/notifications/src/worker/repository.ts`: the claim selects `n.image_url`;
    `ClaimedDelivery.imageUrl`; the catalogue lookup handles message types (the tag and group from the T008 entry);
  - `apis/edge-api/notifications/src/worker/drain.ts`: passes it on;
  - `apis/edge-api/notifications/src/fcm/sender.ts`: sets `message.notification.image` when present (Android); APNs is
    unchanged;
  - update `sender.test.ts`, `drain.test.ts` and `repository.container.test.ts`.
- [X] T018 [P] Add ops kind `messages` to `LiveChange` in `apis/edge-api/shared/src/live/announce.ts`. Map it in
  `apps/back-office/src/features/live/routes.ts` to `["back-office", "messages"]`, and update `routes.test.ts`.
- [X] T019 Create the admin messages slice skeleton:
  - `apis/edge-api/admin/src/messages/authz.ts`: `canManageMessages(sub)` (admin or manager, as
    `promotions/authz.ts`); re-export `isActiveStaff`;
  - `apis/edge-api/admin/src/messages/repository.ts`: insert and update message and audiences, read message plus
    audiences, append event, `lockForUpdate`;
  - `apis/edge-api/admin/src/messages/service.ts`: `parseDraft` (closed shape, kind ↔ audience via `MESSAGE_KINDS`,
    `parseAudience`, `parseDestination` per audience, lengths, `endsAt`), `toDTO` (`pictureUrl` via `publicImageUrl`,
    `createdBy` display name as promotions do), and refusal errors mapped to the contracts table;
  - `apis/edge-api/admin/src/messages/handlers.ts`: the handler factory pattern of `promotions/handler-support.ts`,
    announcing ops `messages` after commit on writes.

## Phase 3: User Story 1 - Send an announcement to drivers or shops (P1) 🎯 MVP

**Goal**: a manager writes, previews, tests and sends an announcement to drivers or shops, and every matching person
gets it in their inbox, with a push and a picture.

**Independent test**: quickstart steps 1–7.

- [X] T020 [US1] Implement routes 1–8 (send now only) in `apis/edge-api/admin/src/messages/service.ts` and
  `handlers.ts`, per contracts/messages-api.md:
  - list via `parseListQuery` (`q`, kind, audience and status filters; sort created, sent or title, then id; `reached`
    and `openedShare` from `notification_message_idx`);
  - create (`created` event);
  - get;
  - edit (`version` check, `edited` event);
  - audience-count (uses `countSql` and `resolveCustomerEmails`);
  - picture (`presignUpload("promotions", "messages-" + id, …)`; JPEG, PNG or WebP up to 5 MB);
  - test (R14: one recipient by audience and id, resolved to their `sub`, `notify` with `messageId: null`, the
    "Test: " title, dedupe `test:{id}:{uuid}`; answers what was written; `test_sent` event with `{to: audience}`);
  - send now (role check; `confirmCount` within 5% of the true count, else `409 audience_changed`; status `sending`;
    `sending` event).
- [X] T021 [US1] Add the one-liner handlers `apis/edge-api/admin/src/functions/messages-{list-v1-get, create-v1-post,
  get-v1-get, update-v1-put, audience-count-v1-post, picture-v1-post, test-v1-post, send-v1-post}.ts` and their
  entries in `serverless.messages.yml` (paths per the contract).
- [X] T022 [P] [US1] Create `apis/edge-api/admin/src/messages/service.test.ts` (unit) for `parseDraft`:
  - every refusal row of the contract table;
  - kind ↔ audience pairs;
  - an unknown filter key;
  - a bad destination per audience;
  - the length limits;
  - `endsAt` before `sendAt`.
- [X] T023 [US1] Create the sending worker in `apis/edge-api/notifications/src/messages/`, per research R3 and
  contracts/sending.md (step 2, pages; the other steps come later):
  - `repository.ts`: claim sending messages `FOR UPDATE SKIP LOCKED`, re-lock per page, read audiences, run the
    `audienceSql` page, add to `matched_count`, advance the cursor, mark `sent` with an event (actor `'system'`);
  - `worker.ts`: the page loop with a 12-minute budget, calling `notify()` with the `message` input (category and
    importance from `MESSAGE_KINDS`; `pinnedUntil` for important; `expiresAt` = `ends_at`; `imageUrl` via
    `publicImageUrl`), and emitting the metrics `MessagesPagesWritten` and `MessagesSent`;
  - `handler.ts`: the scheduled entry, which announces ops `messages` once per pass when something changed;
  - add `messages: handler: src/messages/handler.handler`, schedule `${param:drainSchedule}`, timeout 900, to
    `apis/edge-api/notifications/serverless.yml`.
- [X] T024 [P] [US1] Create `apis/edge-api/notifications/src/messages/worker.container.test.ts`:
  - a 3-audience important message reaches each audience once;
  - a person matched twice gets one row;
  - **20,000 customers** finish in one pass, and the time is logged (SC-002);
  - **a crash after page 7** (throw from a stubbed `notify` on page 8, then run again) gives exactly 20,000 rows and no
    duplicates (SC-003);
  - two concurrent passes never write one message twice;
  - `matched_count ≥ reached` per audience.
- [X] T025 [P] [US1] Create `apis/edge-api/admin/src/messages/routes.container.test.ts`:
  - create, get, edit, and a stale version giving 409;
  - the list's paging, filters and sort;
  - audience-count against the T013 seeds;
  - test send writes one row with no `message_id`, not counted;
  - send moves to `sending`;
  - `confirmCount` off by more than 5% gives 409;
  - events are written in order.
- [X] T026 [P] [US1] Back-office data layer in `apps/back-office/src/features/messages/`:
  - `repo.ts`: the route calls, plus the picture upload (presign, then PUT);
  - `queries.ts` (root `["back-office", "messages"]`);
  - `list.ts`: the `DataTable` list definition (columns title, kind, audiences, status, send time, reached, opened %;
    filters kind, audience, status);
  - `draft.ts`: draft state and validation mirroring `MESSAGE_LIMITS` and `MESSAGE_KINDS`;
  - `access.ts`: `canManage` from roles, as `promotions/access.ts`.
- [X] T027 [US1] Create `apps/back-office/src/features/messages/MessagesListScreen.tsx`:
  - `DataTable` over `list.ts`;
  - a **New message** button for managers and admins;
  - `useTourPage("messages", …)` with `data-tour` keys for page-heading, new-message, the-list and status;
  - `TableSkeleton` while loading.
- [X] T028 [P] [US1] Create `apps/back-office/src/features/messages/components/Previews.tsx`: an iPhone and an Android
  lock-screen notification (app name "Effy", title and body cut at the `MESSAGE_LIMITS` preview lengths with "…"), an
  inbox row, and the opened item (picture, title, full text, an "Open" button) for each chosen audience. Use tokens
  only. These are drawings, not cards of content (plan › Constitution V).
- [X] T029 [P] [US1] Create `apps/back-office/src/features/messages/components/AudienceBuilder.tsx`:
  - one section per audience the kind allows, with an on/off per audience;
  - driver filters: on duty, work today, collection run today, delivery run today, clearance (function + area, from the
    fleet zones query), and chosen drivers (search over the drivers list);
  - shop filters: chosen shops (search over the shops list), everyone or managers only;
  - a live count through `audience-count`, debounced 300 ms, shown as "12 drivers".

  Customer filters come in US5.
- [X] T030 [P] [US1] Create `apps/back-office/src/features/messages/components/DestinationPicker.tsx`: the driver choices
  (Today, Account) and the shop choices (Order queue, Catalogue). Customer choices come in US4 and US5.
- [X] T031 [US1] Create `apps/back-office/src/features/messages/MessageEditorScreen.tsx` (routes `/messages/new`, and
  `/messages/$id/edit`):
  - kind toggle (the kinds the role may use);
  - `AudienceBuilder`, title and text with counters that mark the lock-screen cut, picture upload (JPEG, PNG or WebP,
    5 MB), push on/off, end time, `DestinationPicker` per audience;
  - `Previews` beside the form from 1280px, below it under that;
  - **Save draft**, then **Send to me**: pick an own account by searching drivers, shops or customers; remember the last
    one per audience in `localStorage` inside try/catch;
  - **Send**: opens `SendSheet`;
  - tour `message-editor` with keys kind, audience, words, previews, destination, send-to-me and send;
  - the skeleton is the form's own shape.
- [X] T032 [P] [US1] Create `apps/back-office/src/features/messages/components/SendSheet.tsx`: an `AlertDialog` saying
  "Send to {n} {people}?" with the count from `audience-count`, and the 409 `audience_changed` re-ask. It sends now in
  this story; scheduling comes in US2.
- [X] T033 [US1] Routes and navigation:
  - `apps/back-office/src/routes/messages.tsx` (`/messages`, `/messages/new`, `/messages/$id/edit`, `/messages/$id`
    placeholder until US3), registered in `router.tsx`;
  - `components/shell/nav.ts`: People › **Messages** (`Send` icon, every role), and update `nav.test.ts`.
- [X] T034 [US1] Tours: add `ML` (`messages`) and `ME` (`message-editor`) to `apps/back-office/src/features/tours/codes.ts`,
  and their steps word for word from spec › Guided tours to `tours.ts`, with the role marks (ML step 2: administrator or
  manager). Update `tours.test.ts`, and add the rows to the inventory in `specs/107-backoffice-guided-tours/spec.md`.
- [X] T035 [P] [US1] Driver app inbox detail:
  - `features/inbox/domain/Inbox.kt`: `imageUrl`;
  - `data/HttpInboxRepository.kt`: maps it;
  - `presentation/InboxScreen.kt`: a `driver_message` item opens a detail sheet (driver kit) with the picture (the app's
    image loader), title, full text and an **Open** button to its destination; other items keep their tap behaviour;
  - add a host test for the mapping and the "message opens detail" decision in the ViewModel.
- [X] T036 [P] [US1] Shop console inbox detail:
  - `apps/shop-web/src/features/notifications/inbox-api.ts` (`imageUrl`);
  - `InboxList.tsx` and `NotificationsScreen.tsx`: a `shop_message` item opens a detail `Dialog` with the picture,
    title, full text and an **Open** button to `shopPathFor(destination)`;
  - a vitest case in `__tests__`.

**Checkpoint**: an announcement to drivers or shops can be written, previewed, tested and sent (MVP).

## Phase 4: User Story 2 - Schedule, cancel, stop, withdraw (P1)

**Goal**: staff schedule, edit, cancel, stop and withdraw messages safely, within the per-message limit.

**Independent test**: quickstart steps 8–11 and 26.

- [X] T037 [US2] Extend send with `sendAt`: a future time gives `scheduled`; a past time is treated as now. Add routes
  9–11 in `admin/src/messages/service.ts`:
  - cancel: `scheduled` → `cancelled`;
  - stop: `sending` → `stopped`;
  - withdraw: `sending` / `sent` / `stopped` → `withdrawn`, calling `withdrawMessageItems` in the same transaction;

  Each takes the row lock and writes its event. Also: a CSA cannot schedule; edits are allowed while `scheduled`
  (`edited` event, "edited while scheduled" detail).
- [X] T038 [US2] Add `apis/edge-api/admin/src/functions/messages-{cancel,stop,withdraw}-v1-post.ts` and their
  `serverless.messages.yml` entries.
- [X] T039 [US2] The per-message limit:
  - `admin/src/messages/service.ts`: send and schedule refuse a count above
    `notification_settings.max_recipients_per_message` with `409 too_many_recipients {count, limit}`;
  - `apis/edge-api/orders/src/notification-settings/service.ts`: GET and PUT carry `maxRecipientsPerMessage`
    (1–200,000); a manager changing it gets `403 forbidden`; the change is logged as a `notification_settings_change`
    row with the words "Changed the largest message from {a} to {b} people";
  - update `NotificationSettingsDTO` / `NotificationSettingsUpdate` in `packages/shared-types/src/notification-preferences.ts`,
    `service.test.ts` and `service.container.test.ts`.
- [X] T040 [US2] Worker steps 1 and 3 in `apis/edge-api/notifications/src/messages/`:
  - **due**: `scheduled` with `send_at <= now()` is counted; over the limit it becomes `not_sent`
    (`too_many_recipients`, event), otherwise `sending` (event);
  - **stop**: the per-page re-lock exits when the status is no longer `sending`;
  - **withdrawn**: for `withdraw_announced_at IS NULL`, `announceInbox` to the recipients in pages of 1,000 (subs from
    `notification` by `message_id`), then stamp it;
  - the `MessagesNotSent` metric.
- [X] T041 [P] [US2] Extend `worker.container.test.ts`:
  - a scheduled message is sent at its time with the edited text;
  - a cancelled one is never sent;
  - over the limit gives `not_sent`;
  - stop between pages keeps those reached and no more;
  - withdraw during sending stops it and ends every item;
  - after withdraw, the inbox read lists nothing, and a pending push (including one held with `not_before`) is
    `expired` by the drain;
  - the withdrawal announcement runs once.
- [X] T042 [P] [US2] Extend `routes.container.test.ts`: every state transition in the R7 diagram, every
  `409 message_not_editable` case, `too_many_recipients`, and withdraw ending the items.
- [X] T043 [US2] Back-office:
  - `SendSheet.tsx` gains **Send now / Schedule** (date and time on Effy's clock via `OPERATING_TZ`, with "Times are
    Melbourne time" from `OPERATING_CITY`);
  - the editor keeps working for `scheduled`;
  - action buttons with `AlertDialog` confirmations: **Cancel** (scheduled), **Stop sending** (sending), and
    **Withdraw** (sent / stopped / sending), whose text is "This removes it from everyone's inbox. Notifications
    already shown on phones can't be taken back.";
  - all in `apps/back-office/src/features/messages/components/MessageActions.tsx`.
- [X] T044 [US2] `apps/back-office/src/features/settings/notifications/NotificationSettingsScreen.tsx` (+ test):
  - a **Largest message** field (people), editable by administrators only, read-only for managers;
  - add `data-tour="message-limit"`;
  - the CN tour goes to version 2 with words from spec › Guided tours in `tours.ts`;
  - update `tours.test.ts` and the 107 inventory.

**Checkpoint**: messages can be scheduled, cancelled, stopped and withdrawn; oversize messages are refused.

## Phase 5: User Story 3 - The report (P1)

**Goal**: each message has a report that adds up and survives retention, plus an activity log.

**Independent test**: quickstart steps 12–14.

- [X] T045 [US3] Create `apis/edge-api/admin/src/messages/report.ts`: `reportFor(db, messageId)` per research R15. It
  returns one SQL pass grouped by audience over `notification` (by `message_id`) left-joined to the push delivery, with
  every `MessageReportDTO` line and the total; when `report_frozen_at` is set, it returns the frozen jsonb. Wire it into
  get (route 3), and use the same SQL for the list's `reached` / `openedShare`.
- [X] T046 [P] [US3] Create `apis/edge-api/admin/src/messages/report.container.test.ts`:
  - seed deliveries in every status (including held with `not_before`, and expired after withdraw), with seen, read and
    archived;
  - the lines equal the hand counts;
  - **the push parts sum to reached, and reached + noConsent = matched**, for each audience and the total (SC-005);
  - a frozen report is returned as stored.
- [X] T047 [US3] Purge freeze in `apis/edge-api/notifications/src/purge/repository.ts`: before deleting, write
  `message_audience.report` and `report_frozen_at` for messages with `sent_at <= now() - 29 days` and not frozen,
  reusing the report SQL (move it to `shared/src/notifications/messages/report-sql.ts` so admin and notifications share
  one copy). Extend `repository.container.test.ts`.
- [X] T048 [US3] Activity:
  - `apis/edge-api/admin/src/messages/activity.ts`: the source `message` over `message_event`, with server-side words
    ("Sent to 1,204 customers", "Test sent to a driver account", "Withdrawn", …), actor names as promotions' audit does,
    and types for the drawer's filter;
  - route 12 `apis/edge-api/admin/src/functions/messages-activity-v1-get.ts` plus its serverless entry;
  - add it to `shared/src/lib/activity.guard.test.ts`.
- [X] T049 [US3] Create `apps/back-office/src/features/messages/MessageScreen.tsx` (`/messages/$id`):
  - the head with title, kind, status and the More menu (Activity, which opens `ActivityLogDrawer` on source `message`);
  - the words and picture as sent, and the audiences with filters described in words;
  - `components/ReportTable.tsx`: a `StaticTable`, one column per audience plus the total, rows per R15, and "Final
    numbers as of {date}" when frozen;
  - `MessageActions`;
  - tour `MS` (`message`) with keys report, actions, duplicate and activity;
  - `DetailPageSkeleton`;
  - re-reads on the live kind.
- [X] T050 [US3] Tours: `MS` into `codes.ts` and `tours.ts` word for word from the spec (steps 2–3 for administrator or
  manager). Update `tours.test.ts` and the 107 inventory, reaching 56 tours.

**Checkpoint**: P1 complete: send, brakes, report.

## Phase 6: User Story 4 - Message one person (P2)

**Goal**: a CSA or manager sends a direct message from a customer, driver or shop page, and sees what the person
received.

**Independent test**: quickstart steps 15–17.

- [X] T051 [US4] Direct in `admin/src/messages/service.ts`:
  - a `direct` draft has one audience whose filter is `{people: [one id]}` (shop: `{shops: [one id], managersOnly}`);
  - a CSA may create, test and send-now a direct message only, everything else is `403 forbidden`;
  - closed, deactivated or unavailable recipients give `409 recipient_unavailable`;
  - a customer destination may be `order{orderId}` only for that customer's own order.
- [X] T052 [P] [US4] Extend `routes.container.test.ts` with the CSA matrix (SC-007): every route and kind other than
  direct is refused; a direct message to two people is refused; direct to a customer with every switch off still writes
  inbox and push.
- [X] T053 [US4] Messages received:
  - the source `messages-received` in `admin/src/messages/activity.ts` (R16: customer by `cognito_sub`, driver by
    `cognito_sub`, shop by all its staff subs);
  - route 13 `apis/edge-api/admin/src/functions/messages-received-v1-get.ts`, its serverless entry (declared alongside
    `{id}`), and the activity guard.
- [X] T054 [US4] Create `apps/back-office/src/features/messages/components/DirectMessageDialog.tsx`: a shadcn `Dialog`
  with title, text and destination (customer: Home, Orders, Points, or one of their orders from the customer's orders
  query; driver: Today, Account; shop: Order queue, Catalogue, plus everyone or managers only). It creates, then sends
  with `confirmCount` 1, and toasts "Message sent".
- [X] T055 [US4] Add **Send message** and **Messages received** (drawer on `messages-received`) to the More menu of
  `apps/back-office/src/features/customers/CustomerDetailScreen.tsx`, `features/drivers/DriverDetailScreen.tsx` and
  `features/shops/ShopDetailScreen.tsx`, disabled for a closed or deactivated person.
- [X] T056 [P] [US4] Customer website inbox detail: `apps/customer-web/components/notifications/InboxView.tsx` generalises
  111's marketing detail so a `customer_message` item opens it, with the picture (`next/image` from the media host
  already allowed), title, full text, and **Open** (or "See offer" for offers) to `customerWebPathFor(destination)`.
  "Stop … like this" stays for offers and news only. Extend `InboxView.test.tsx`.
- [X] T057 [P] [US4] Customer app inbox detail:
  - `features/notifications/domain/Inbox.kt` (`imageUrl`) and `data/HttpInboxRepository.kt`;
  - `presentation/InboxScreen.kt`: a `customer_message` item opens the existing detail `EffySheet` with the picture,
    title, full text and **Open** / **See offer**; stop only for offers and news;
  - a host test for the decision and mapping.

## Phase 7: User Story 5 - Important to customers (P2)

**Goal**: an important message reaches matching customers whatever their choices, pinned.

**Independent test**: quickstart steps 18–19.

- [X] T058 [US5] Customer filters in `AudienceBuilder.tsx`:
  - postcodes (a comma-separated list, validated as 4 digits);
  - coverage groups (from the coverage groups query);
  - ordered in the last N days, or never ordered;
  - has points;
  - uses the app;
  - chosen customers, by search over the customers list, or a CSV of emails parsed in the browser and resolved through
    `audience-count` `resolve` ("1,180 found, 12 not found, 3 repeated").
- [X] T059 [US5] Typed confirmation: send requires `typedCount` when a customer audience has no filter
  (`409 confirmation_required`) in `admin/src/messages/service.ts`, and `SendSheet.tsx` shows the "Type {n} to send"
  field. The editor shows the Important reminder (FR-022): "Important is for service messages - deliveries, safety, your
  account. Never offers." Extend `routes.container.test.ts`.
- [X] T060 [US5] Customer destinations in `DestinationPicker.tsx`: Home, Orders and Points, plus 108's picker. Move
  `features/promotions/components/LinkPicker.tsx` to `apps/back-office/src/components/link-picker/LinkPicker.tsx`
  (update `BannerEditorScreen.tsx`'s import), and add `toCustomerDestination(link)` per research R10 with a unit test.
- [X] T061 [P] [US5] Customer app and website: confirm that an important `customer_message` is pinned (110's pinned list)
  and opens the detail. Add a case each to the T056 and T057 tests.

## Phase 8: User Story 6 - Offers and news (P2)

**Goal**: promotions reach only customers who said yes, under every 111 rule, and must name Effy.

**Independent test**: quickstart steps 20–24.

- [X] T062 [US6] In `admin/src/messages/service.ts`:
  - offer and news: send, schedule and test refuse words without Effy (`messageNamesEffy`) with
    `400 message_must_name_effy`;
  - audience-count returns `consented` for them;
  - send's `confirmCount` and the limit compare against **consented**, not matched;
  - a test to a customer without a yes answers `{inbox: "not_written", reason: "no_consent"}`.
- [X] T063 [P] [US6] Create `apis/edge-api/notifications/src/messages/promotions.container.test.ts` (SC-004):
  - customers A (yes), B (no) and C (never answered), sending an offer to all: only A has a row;
  - a second offer the same day is `capped` for A;
  - sent at 22:00 (worker clock seam), A's push is held to 08:00;
  - consent withdrawn after scheduling: not sent;
  - the report shows matched 3, reached 1, noConsent 2.
- [X] T064 [US6] Back-office:
  - the count line shows "3 match · 1 said yes";
  - `SendSheet` says "Send to 1 customer?";
  - the editor shows the Effy rule under the words ("Offers and news must say they're from Effy.") and blocks Send when
    it is missing;
  - the test result shows "This customer hasn't said yes to offers.";
  - the previews show "Stop offers like this" in the opened item for offers and news.

## Phase 9: User Story 7 - Duplicate (P3)

**Goal**: start a new draft from any message.

**Independent test**: quickstart step 25.

- [X] T065 [US7] Create accepts `fromMessageId`: it copies nothing on the server; the client sends the copied draft.
  The service writes `duplicated_from` and a `duplicated` event `{from}`. In `MessageScreen.tsx`, **Duplicate**
  (managers and admins) opens `/messages/new?from={id}`, which prefills the editor with no schedule. Extend
  `routes.container.test.ts` and add a back-office vitest case.

## Phase 10: Polish & cross-cutting

- [X] T066 [P] `apis/edge-api/shared/src/live/change-map.guard.test.ts`: mark the 13 messages routes and the orders
  settings PUT SILENT.
- [X] T067 [P] Run `apis/edge-api/shared/src/lib/gateway-capacity.contract.test.ts` and confirm the staff gateway reads
  231/300. Update `docs/api/path-assignment.md`: the staff usage, plus the R2 decision (third gateway for `catalog` and
  `inventory-staff`, raised before about 255, needing an amendment).
- [X] T068 [P] Back-office guards: skeletons, list screens (the list is a `DataTable` over `parseListQuery`; the report
  is a `StaticTable`), tours (56), nav, `check-token-usage`. Fix whatever they report.
- [X] T069 [P] `docs/telemetry/platform-events.md`: note that `inbox_item_opened`, `notification_opened` and the shop's
  `notif_*` carry the three message types (FR-034). No new event.
- [X] T070 [P] `docs/notifications-backlog.md`: mark E1–E8 and E10 "(112, done)"; E11–E13 stay later.
- [X] T071 Run every suite:
  - edge-shared unit tests and containers;
  - admin, notifications and orders `tsc`, vitest and containers;
  - every other service's `tsc` (the `notify` signature);
  - shared-types;
  - back-office, shop-web and customer-web vitest plus builds, and customer-web depcruise;
  - customer and driver app host tests, plus Android and iOS compiles and the mobile and driver guards.

  Record results, separating failures that predate this work (see memory) from new ones.
- [X] T072 Run quickstart › Local checks end to end, and fix what fails.
- [X] T073 [P] Update `CLAUDE.md`: a 112 line under Feature history ("built 2026-11-11; not migrated, deployed or
  walked").
- [X] T074 [P] Memory: create `backoffice-messages-112.md` (the stack `admin-messages`, the worker in notifications, staff
  231/300 past 75%, pictures under `promotions/messages-`, the deploy order) and its line in `MEMORY.md`. Update
  `notification-preferences-111.md` to say spec 4 is built.
- [X] T075 `FEATURE-HISTORY.md`: the 112 entry with what changed, the goose run (T002), the tests, the deploy order
  (plan) and the walk (quickstart) still open.

## Dependencies

- **Setup (T001–T007)** comes before **Foundational (T008–T019)**, which comes before every story.
- **US1** (T020–T036) is the MVP. **US2** and **US3** build on US1's service, worker and screens: US2 needs T020, T023
  and T031; US3 needs T020 and T023.
- **US4** needs US1's service and the US3 activity helper (T048) for "messages received".
- **US5** needs US1's builder and editor.
- **US6** needs US5's customer filters and destinations.
- **US7** needs US3's message page.
- **Polish** comes last.

Within each phase, the `[P]` tasks touch different files and can run alongside each other.

## Parallel examples

- **Setup**: T003, T004, T005 and T006 together after T001.
- **Foundational**: T010, T013, T015, T016, T017 and T018 alongside each other once T008, T009, T012 and T014 exist.
- **US1**: T022, T024, T025, T026, T028, T029, T030, T032, T035 and T036 together after T020 and T023.
- **US4**: T056 and T057 (the two customer surfaces) alongside T051–T055.

## Implementation strategy

1. **MVP = US1**: announcements to drivers and shops, which proves `notify` with messages, the worker, the composer and
   two inbox surfaces.
2. Add the brakes (US2) and the report (US3) before anyone relies on it.
3. Then direct messages (US4), important messages to customers (US5) and offers and news (US6), in that order. That is
   the story order the operator asked for: no consent first, promotions last.
4. Duplicate (US7) last.

Each checkpoint can be walked on dev on its own.
