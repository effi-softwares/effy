# Implementation Plan: Back-Office Messages

**Branch**: `112-backoffice-messages` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/112-backoffice-messages/spec.md`

## Summary

Back-office gains a **Messages** area for writing a message once, choosing who gets it from fixed filters, previewing it,
sending it now or later, and reading a report. Every recipient's notification is written by 109's one writer, so 111's
consent, choices, limits and night hold apply without being restated.

**Sending** (R1, R3):
- `notify()` gains a `message` input and three types: `customer_message`, `driver_message` and `shop_message`.
- A new route-less `messages` function in the `notifications` service runs every minute. It sends due messages in pages
  of 1,000, one transaction per page, with a cursor, so a stop or a crash never repeats or skips anyone.

**Audiences** (R4, R5):
- `MESSAGE_KINDS` in shared-types says which audiences each kind may reach and the category it is filed under.
- The filters are reviewed SQL fragments in one shared module, used for the live count and for sending.

**Routes** (R2): a new `admin-messages` stack with 13 staff routes. The staff gateway goes **218 → 231 of 300 (77%)**,
past the 75% warning. The decision on what moves next is recorded in R2.

**Safeguards** (R12, R13):
- Kind and audience pairs are checked.
- Offers and news must name Effy.
- A per-message limit (default 20,000; administrators only).
- The confirmation carries the count; all customers needs the count typed.
- Stop, cancel and withdraw.
- A CSA may only send a direct message to one person.

**Withdraw** (R8): it ends every recipient's item at once (`expires_at = now()`). The existing drain expiry stops held
and queued pushes, and the worker tells open inboxes within a minute.

**Report** (R15): computed from the notification and delivery rows, then frozen by the purge before those rows go.

**Screens** (R10, R11, R16, R17):
- back-office: the Messages list, the composer with previews, the message page with its report and activity, and Send
  message plus Messages received on the customer, driver and shop pages;
- every inbox (customer app, customer website, driver app, shop console) opens a message as a detail with its picture.

## Technical Context

**Language/Version**: TypeScript 5.9 (Node 22 Lambdas, React 19 consoles, Next.js 16 customer-web), Kotlin 2.4 (customer
and driver apps), PostgreSQL 16 SQL.

**Primary Dependencies**: existing only:
- `@effy/edge-shared` (`notifications`, `activity`, `lib/db`, `lib/list-query`, `lib/media-public`, `live`);
- `@effy/shared-types` and the quicktype generators;
- `@effy/web-kit` (data-table, activity-log, tour, patterns), the design-system shadcn components;
- TanStack Router/Query/Form;
- the app kits.

**No new package.**

**Storage**: one additive migration, `20261111090000_backoffice_messages.sql`, with a full Down (see
[data-model.md](data-model.md)):
- `message`, `message_audience`, `message_event`;
- `notification.message_id` and `image_url`, three types, and a partial index;
- `notification_settings.max_recipients_per_message`.

**Testing**:
- vitest unit tests, plus container tests on the local Postgres recipe:
  - every audience filter against a hand query;
  - the count, and the consent count;
  - `notify` with a message (each kind × audience, the refusals);
  - the worker: pages, stop, resume with no duplicate, 20,000 recipients, not sent, the withdrawal announcement;
  - the routes, roles, versions and refusals;
  - purge freezing and erasure of `people` ids.
- guards:
  - the new `messages.guard` (audience SQL only in `audience.ts`, `message_event` append-only, kinds ↔ CHECK ↔ policy);
  - 109's writer guard, gaining `messages/withdraw.ts`;
  - the change map (SILENT);
  - gateway capacity;
  - `activity.guard`;
  - list-query;
  - back-office tours, skeletons, list screens and nav.
- shop-web and customer-web vitest and builds;
- Kotlin host tests (the inbox detail for a message) and the Android and iOS compiles;
- the quickstart walk.

**Target Platform**:
- the staff gateway: `admin-messages` (new) and `orders` (settings field);
- the `notifications` service: the worker, the drain image and the purge freeze;
- every `notify()` caller, through the shared library (types only);
- customer, driver and shop inbox reads (`imageUrl`);
- back-office, shop-web, customer-web, and the customer and driver apps.

**Project Type**: a monorepo of serverless services, three web apps, two KMP apps and shared packages.

**Performance Goals**:
- 20,000 recipients written in under a minute (SC-002 allows 10);
- the audience count in under 2 s (SC-008) on dev-sized tables, using the existing indexes plus the new partial one;
- a report read in under 1 s.

**Constraints**:
- one writer per fact: notifications are written by `notify()`; outcomes by the drain; message state by
  `admin/src/messages/service.ts` and the worker; `message_event` is append-only;
- no timers anywhere: the back-office re-reads on the ops kind `messages`;
- no free SQL from the client;
- the operating zone only through `OPERATING_TZ`;
- no personal data in telemetry or in `message_event.detail`;
- every console page has a tour; loading states draw the page's own shape;
- shadcn only in the consoles;
- the customer app has no dialogs;
- never edit a committed migration; no compatibility fields;
- a public picture only through `publicImageUrl`.

**Scale/Scope**:
- 1 migration;
- shared:
  - `messages/{audience,withdraw,kinds-sql}.ts` (new);
  - `notify.ts` and `catalogue.ts` (message types);
  - `inbox.ts` (`image_url`);
  - `announce.ts` (ops kind `messages`);
- notifications: `src/messages/{handler,worker,repository}.ts` (new), plus drain and sender (image) and the purge
  (freeze);
- admin: `src/messages/*` (service, repository, authz, report, activity sources, handlers), 13 functions,
  `serverless.messages.yml`;
- orders: one settings field;
- shared-types: `messages.ts` plus a test, the inbox DTO field, contracts;
- back-office about 16 files; shop-web about 3; customer-web about 3; customer app about 4; driver app about 4;
- Makefile: the stack.

## Constitution Check

| Principle | Check |
|---|---|
| I Spec-driven | spec.md → this plan → tasks.md. The tour words are in the spec (106/107 rule). Three spec corrections came from design and were written back to the spec: withdraw reaches open inboxes within a minute; "tapped through" was dropped; the existing telemetry covers FR-034. ✓ |
| II Shared contracts | Kinds, filters, statuses and DTOs are in `@effy/shared-types` `messages.ts`, held to the migration CHECKs and 111's policy by a test. The inbox DTO is regenerated for both apps. ✓ |
| III One serverless backend | Routes go in a new stack of the existing `admin` service on the staff gateway (231/300, 77%, under the 90% stop line). The 75% warning's required decision is recorded (R2). Sending is a scheduled Lambda in the existing `notifications` service. No queue, scheduler service or compute is added. ✓ |
| IV Auth isolation | Every route sits behind the back-office authorizer, with roles from `admin.staff`. Recipients are reached only through their own audience's inbox reads. A CSA's limits are enforced on the server. ✓ |
| V Native feel / design | Consoles use shadcn, `DataTable`, the 104 drawer, tours and skeletons. The report is detail rows and a table, not metric cards. The previews are drawings of the real surfaces (they are the purpose of the composer). Both apps use their own kits for the inbox detail (the customer app's `EffySheet`, never a dialog). ✓ |
| VI Layered architecture | Handler → `messages/service.ts` → repository and shared SQL. The worker is handler → `worker.ts` → repository. React Query is the server-state truth. ViewModels in the apps. ✓ |
| VII Observability | The worker logs and emits metrics per pass (`MessagesPagesWritten`, `MessagesSent`, `MessagesNotSent`). The existing inbox telemetry carries the message types. No personal data. ✓ |
| Real-world identifiers | None introduced. Messages are written by staff in the UI. ✓ |
| Gateway capacity | Staff 218 → 231 (77%). It crosses the 75% warning, and the required plan is in R2: move `catalog` and `inventory-staff` to a third gateway after an amendment, before 90%. Nothing merged. ✓ (recorded) |

No violations, so Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/112-backoffice-messages/
├── spec.md                 # + guided tour words (ML, ME, MS, CN v2)
├── plan.md                 # this file
├── research.md             # R1–R17
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── messages-api.md
│   └── sending.md
├── checklists/requirements.md
└── tasks.md                # /speckit-tasks
```

### Source Code (repository root)

```text
db/migrations/20261111090000_backoffice_messages.sql

packages/shared-types/src/
  ├── messages.ts                     # NEW: MESSAGE_KINDS, statuses, filter shapes, limits, DTOs
  ├── messages.test.ts                # NEW: kinds ↔ category policy ↔ migration CHECKs
  ├── notification-inbox.ts           # InboxItemDTO.imageUrl
  └── index.ts, customer-contract.ts (+ driver contract) → regenerated Kotlin DTOs

apis/edge-api/shared/src/
  ├── notifications/notify.ts         # `message` input (R1)
  ├── notifications/catalogue.ts      # customer_message / driver_message / shop_message
  ├── notifications/inbox.ts          # image_url → imageUrl
  ├── notifications/messages/audience.ts            # NEW: parseAudience, audienceSql, countSql (R4)
  ├── notifications/messages/withdraw.ts            # NEW: withdrawMessageItems (R8)
  ├── notifications/messages/*.container.test.ts, messages.guard.test.ts   # NEW
  ├── notifications/notifications.guard.test.ts     # + withdraw.ts as a writer
  ├── fleet-sql or lib/on-duty.ts     # ON_DUTY_EXISTS moved here from fleet (one copy)
  ├── live/announce.ts                # ops kind "messages"
  └── live/change-map.guard.test.ts, lib/activity.guard.test.ts
apis/edge-api/notifications/
  ├── src/messages/{handler,worker,repository}.ts (+ tests)   # NEW (R3)
  ├── src/worker/{repository,drain}.ts, src/fcm/sender.ts      # image_url → FCM image; message tag lookup
  ├── src/purge/repository.ts         # freeze reports, scrub erased people ids (R15)
  └── serverless.yml                  # + messages function (rate 1 minute)
apis/edge-api/admin/
  ├── serverless.messages.yml         # NEW stack admin-messages, 13 functions
  ├── src/messages/{service,repository,authz,report,activity,handlers}.ts (+ tests)   # NEW
  └── src/functions/messages-*.ts     # NEW one-liners
apis/edge-api/orders/src/notification-settings/service.ts       # maxRecipientsPerMessage, admin only
apis/edge-api/shared/src/lib/serverless-stacks.ts               # listStacks knows admin-messages
Makefile                               # EDGE_STACK_* admin-messages, EDGE_ALL_SERVICES

apps/back-office/src/
  ├── features/messages/{MessagesListScreen,MessageEditorScreen,MessageScreen}.tsx      # NEW
  ├── features/messages/components/{AudienceBuilder,Previews,ReportTable,SendSheet,DirectMessageDialog,PeoplePicker}.tsx
  ├── features/messages/{repo,queries,list,draft,access}.ts (+ tests)
  ├── components/link-picker/LinkPicker.tsx          # moved from promotions (R10)
  ├── routes/messages.tsx, router.tsx, components/shell/nav.ts (+ test)
  ├── features/customers/CustomerDetailScreen.tsx, features/drivers/DriverDetailScreen.tsx,
  │   features/shops/ShopDetailScreen.tsx            # Send message + Messages received
  ├── features/settings/notifications/NotificationSettingsScreen.tsx   # Largest message
  ├── features/live/routes.ts                        # messages kind
  └── features/tours/{tours,codes}.ts, tours.test.ts # ML, ME, MS; CN v2
specs/107-backoffice-guided-tours/spec.md            # inventory: 56 tours
apps/shop-web/src/features/notifications/{InboxList.tsx, NotificationsScreen.tsx}   # message detail + picture
apps/customer-web/components/notifications/InboxView.tsx (+ test)                  # message detail + picture
apps/customer-mobile/.../features/notifications/{presentation/InboxScreen.kt, data/…, domain/…}   # detail + picture
apps/driver-mobile/.../features/inbox/…              # detail + picture
docs/notifications-backlog.md (E1–E8, E10 done), docs/api/path-assignment.md (staff usage + the R2 decision)
```

**Structure Decision**:
- No new service. The admin service owns staff-facing content (promotions, staff, shops), so messages go in a new stack
  of it.
- Sending lives in the service that already owns notification delivery and its schedules.
- The audience SQL and the withdraw writer are shared, because two services use them.

## Phase 0 / Phase 1

See [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/) and
[quickstart.md](quickstart.md). Post-design constitution re-check: unchanged, all ✓.

## Operator decisions recorded

- **The staff gateway passes 75% (231/300).** The plan is R2: before 270, amend the constitution for a third gateway and
  move `catalog` and `inventory-staff` there. No action is needed for this feature.
- **Message pictures use the existing public `promotions/` prefix** (R9), so the bucket and its policy are unchanged.
- **One Terraform change**: a failure alarm for the new `messages` worker in `infra/envs/dev/background-functions.tf`
  (found while building: `background-alarms.contract.test.ts` requires every scheduled function to have one).

## Deploy order (for the operator)

0. `make apply ENV=dev`: the `messages` worker's failure alarm (it names the function by its deployed name, so it may
   go before or after step 2).
1. `make db-up ENV=dev`: additive. Old code ignores the new tables and columns, and the type CHECK only widens.
2. `make edge-deploy ENV=dev SERVICE=notifications`: the drain sends the picture and the purge freezes reports. The
   `messages` worker starts, with nothing to send yet.
3. `make edge-deploy-all ENV=dev`: every service's `notify()` knows the message types, plus the inbox `imageUrl`, the
   new `admin-messages` stack (in `EDGE_ALL_SERVICES`) and the `orders` settings field.
4. back-office, shop-web and customer-web through their pipelines; both apps.

## Complexity Tracking

None.
