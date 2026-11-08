# Implementation Plan: Notification Inboxes

**Branch**: `110-notification-inboxes` | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/110-notification-inboxes/spec.md`

## Summary

Spec 109 keeps every notification as one row per person. This feature lets people see those rows.

**Backend**:
- A new module, `@effy/edge-shared/notifications` `inbox.ts`, holds the list, unseen count, seen, mark all read and
  archive/undo (R1–R5, R22).
- One factory, `makeInboxHandlers`, exposes five routes per audience in the `customer`, `driver` and `shop` services
  (shared gateway 170 → 185 of 300).
- Pinned important items come back apart from the time-ordered pages, so paging stays exact (R2).

**Live updates and badges**:
- A new live kind, `inbox`, tells a person's open screens to re-read. It is sent after `notify()` commits, through a
  new `afterCommit` hook in the two transaction helpers, so none of the ~12 notify call sites change (R6, R7).
- Pushes carry the unseen count as the app-icon badge (R8).

**Inbox screens**:
- the customer app: the existing header bell gains a count; a new inbox screen replaces the empty one (R16);
- the driver app: a bell on Today (R17);
- the shop console: a bell, a right-hand side panel, and a `/notifications` page with filters in the URL and a guided
  tour (R18);
- the customer website: a bell island in the header and `/account/notifications` (R19).

**Notification changes**:
- "Out for delivery" is sent once per Effy order when the van is loaded (R9).
- "Points about to expire" is also sent as a push (R10).
- A driver whose assignment found no phone gets a pinned "You have N runs today" when they next register a device
  (R11, new type `driver_runs_today`).

## Technical Context

**Language/Version**: TypeScript 5.9 (Node 22 Lambdas, React 19 shop-web, Next.js 16 customer-web), Kotlin 2.4
(customer and driver apps), PostgreSQL 16 SQL.

**Primary Dependencies**: existing only:
- `@effy/edge-shared` (`notifications`, `live`, `lib/db`);
- `@effy/shared-types` and the quicktype contract generators;
- `@effy/web-kit/live`, `@effy/web-kit/tour` and the design-system shadcn Drawer;
- TanStack Router and Query in shop-web;
- `mobile-kit` LiveClient and the existing app kits.

**No new package.**

**Storage**: one additive migration, `20261109090000_notification_inbox.sql`. It adds `pinned_until`, the type
`driver_runs_today` and `notification_unseen_idx`. See [data-model.md](data-model.md).

**Testing**:
- vitest unit tests, plus container tests on the local Postgres (repo recipe);
- guards: the one-writer guard extended to `inbox.ts`, the customer-announce guard, `live.test.ts` Kotlin parity,
  fixture parity for the inbox categories and customer-web paths, and the type-list contract;
- shop-web: tours, list-screens, skeletons and live-route tests;
- customer-web: vitest and its build, including the first-load dependency-cruiser rule;
- Kotlin host tests for both inbox ViewModels and badge stores;
- the quickstart walk.

**Target Platform**:
- shared gateway: `customer`, `driver` and `shop`;
- the `notifications` drain (badge);
- every service that calls `notify()`, which gains the announce through the shared library;
- the customer and driver apps (Android, plus the iOS Simulator);
- shop-web;
- customer-web.

**Project Type**: a monorepo of serverless services, two web apps, two KMP apps and shared packages.

**Performance Goals**:
- the first page within 2 s, each further page within 1 s (SC-004);
- the live update on screen within 5 s (SC-003);
- the count is one index range over unseen rows only.

**Constraints**:
- no timers; no new always-on compute or queue (constitution III);
- one writer per kind of write;
- no personal data in live updates, pushes beyond what 109 sends, or telemetry;
- the shared gateway under the 75% alarm (185/300);
- the customer app has no centred dialogs or drop-downs;
- every console page has a guided tour;
- loading states draw the page's own shape;
- never edit a committed migration;
- no compatibility fields.

**Scale/Scope**:
- 1 migration;
- shared: 2 new modules (`inbox.ts`, `inbox-handlers.ts`) and changes to `notify.ts`, `catalogue.ts`, `lib/db.ts` and
  `live/announce.ts`;
- 15 route handlers (5 × 3) plus 15 serverless entries;
- 3 sender changes (load, points warnings, driver devices);
- the drain claim and FCM message (badge);
- shared-types: 1 module plus a fixture, 1 live kind and 1 path helper;
- customer app about 10 files, driver app about 8, shop-web about 10, customer-web about 10.

## Constitution Check

| Principle | Check |
|---|---|
| I Spec-driven | spec.md → this plan → tasks.md. The tour words are in the spec (106 rule). ✓ |
| II Shared contracts | DTOs, categories and `customerWebPathFor` are in `@effy/shared-types`. Kotlin twins are pinned to fixtures, and the live kind's Kotlin twin is pinned by `live.test.ts`. Customer and driver contracts are regenerated. ✓ |
| III One serverless backend | Routes go in existing services on the shared gateway (185/300, under 75%). Live updates use the existing AppSync Events channel (the v3.1.0 exception). No queue, no container, no listener. The catch-up check rides an existing route; no scheduler is added. ✓ |
| IV Auth isolation | Each route sits behind its own pool's authorizer, and every query is keyed on `sub` **and** audience. Others' ids get 404. Live channels are the person's (customer, driver) or their shop's, and the update carries no content. ✓ |
| V Native feel / design | Customer app: kit components, `EffySheet` for detail, a new kit `EffySwipeRow`, no dialogs or drop-downs. Driver app: its kit. Console: the shadcn floating Drawer, the console list look and a guided tour. Each loading state is in its page's own shape. No card layouts: the inboxes are lists. ✓ |
| VI Layered architecture | Handler (factory) → `inbox.ts` service → SQL. ViewModels over repositories in the apps. In shop-web, the server-state cache is the truth (React Query) and the URL holds filter state. In customer-web, the server renders and client islands act. ✓ |
| VII Observability | `inbox_*` events (R20) without personal data. `announce` emits its existing metrics. The drain's metrics are unchanged. ✓ |
| Real-world identifiers | None introduced. ✓ |

No violations, so Complexity Tracking is empty.

**Card-layout note**: the shop side panel is a Drawer (an overlay), not a card. The rows are list rows.

## Project Structure

### Documentation (this feature)

```text
specs/110-notification-inboxes/
├── spec.md                 # + guided tour words
├── plan.md                 # this file
├── research.md             # R1–R22
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── inbox-api.md
│   └── live-and-badge.md
├── checklists/requirements.md
└── tasks.md                # /speckit-tasks
```

### Source Code (repository root)

```text
db/migrations/20261109090000_notification_inbox.sql   # pinned_until, driver_runs_today, notification_unseen_idx

packages/shared-types/src/
  ├── notification-inbox.ts               # NEW: DTOs, INBOX_CATEGORIES, customerWebPathFor (R13, R14, R19)
  ├── notification-inbox.fixtures.json    # NEW: categories (labels, icons, filterable audiences)
  ├── notification-inbox.test.ts          # NEW: fixtures + Kotlin copies identical
  ├── notification-destinations.fixtures.json  # + customer-web path per customer case
  ├── live.ts                             # + "inbox"
  ├── customer-contract.ts, driver-contract.ts # + inbox DTOs
  └── index.ts
packages/shared-types/contract/…, contract-driver/…   # regenerated
packages/mobile-kit/common/live/LiveKind.kt           # + INBOX("inbox")

apis/edge-api/shared/src/
  ├── lib/db.ts                           # afterCommit(tx, fn) in withTransaction + transactorFor (R6)
  ├── live/announce.ts                    # LiveChange + inbox for customer/driver/shop
  ├── live/customer-announce.guard.test.ts # + notify.ts, inbox.ts as named builders
  └── notifications/
      ├── inbox.ts                        # NEW: list, unseenCount, markSeen, readAll, setArchived (R1–R5)
      ├── inbox-handlers.ts               # NEW: makeInboxHandlers(audience)
      ├── inbox.container.test.ts, inbox-handlers.test.ts
      ├── notify.ts                       # + pinnedUntil, afterCommit → announce inbox
      ├── catalogue.ts                    # + driver_runs_today; words may use subject.count (R11, R12)
      ├── read-handler.ts                 # + announce inbox after read
      ├── notifications.guard.test.ts     # state changes: read.ts + inbox.ts
      └── notification-types.contract.test.ts
  └── points/warnings.ts                  # channels push + email (R10)

apis/edge-api/{customer,driver,shop}/src/functions/
  {aud}-notifications-v1-get.ts, {aud}-notifications-v1-unseen-count-get.ts,
  {aud}-notifications-v1-seen-post.ts, {aud}-notifications-v1-read-all-post.ts,
  {aud}-notifications-v1-id-patch.ts                       # NEW ×3
apis/edge-api/{customer,driver,shop}/serverless.yml        # + 5 functions each
apis/edge-api/driver/src/work/load.ts                      # out for delivery (R9)
apis/edge-api/driver/src/functions/driver-devices-v1-post.ts (+ a driver/catch-up module)   # catch-up notice (R11)
apis/edge-api/live/… change-map.guard.test.ts              # SILENT/announce entries for the new routes
apis/edge-api/notifications/src/worker/repository.ts, fcm/sender.ts   # badge count in claim + payload (R8)

apps/customer-mobile/shared/src/commonMain/.../
  ├── features/notifications/{data,domain,presentation}/   # InboxRepository, InboxViewModel, InboxScreen, detail sheet
  ├── features/notifications/presentation/NotificationsScreen.kt   # DELETED
  ├── core/presentation/{EffyFrame.kt (bell count), EffySwipeRow.kt (NEW)}
  ├── core/push/InboxBadge.kt (NEW store) + platform clearAppBadge (android/ios)
  ├── app/{CustomerShell,AppContainer}.kt, core/observability/AnalyticsEvent.kt
  └── commonTest/…                                          # ViewModel, badge store, category fixture
apps/driver-mobile/shared/src/commonMain/.../               # same set; bell on TodayScreen header; no category chips
apps/shop-web/src/
  ├── features/notifications/{inbox-api.ts, useInbox.ts, NotificationBell.tsx, InboxPanel.tsx, InboxList.tsx}
  ├── routes/notifications.tsx                              # NEW page, search-param filters, tour
  ├── routes/app.tsx                                        # bell in headerActions
  ├── features/live/routes.ts                               # inbox → ["shop","inbox"]
  ├── features/tours/tours.ts                               # + notifications tour
  └── __tests__/list-screens.guard.test.ts                  # named exception (feed)
specs/106-guided-tours/spec.md                              # Tour Inventory + Notifications (test source)
apps/customer-web/
  ├── components/notifications/{NotificationBell.tsx, InboxList.tsx}
  ├── app/(account)/account/notifications/page.tsx (+ actions.ts)
  ├── app/api/notifications/{unseen-count,…}/route.ts       # proxies through lib/api/proxy
  └── header chrome                                         # bell island
docs/telemetry/platform-events.md                           # inbox_* events
docs/notifications-backlog.md                               # mark spec 2 items
```

**Structure Decision**: no new service, app or package. The inbox logic is one shared module behind one factory, like
109's read route. Each surface's inbox lives in its existing `features/notifications` area.

## Phase 0 / Phase 1

See [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/) and
[quickstart.md](quickstart.md). Post-design constitution re-check: unchanged, all ✓.

## Deploy order (for the operator)

1. `make db-up ENV=dev`: additive. Old code ignores `pinned_until`; the type CHECK only widens.
2. `make edge-deploy ENV=dev SERVICE=notifications`: the badge count.
3. `make edge-deploy-all ENV=dev`: the inbox routes, the three sender changes, and `inbox` announces from every
   `notify()` caller.
4. shop-web and customer-web through their pipelines; both apps.

No Terraform change.

## Complexity Tracking

None.
