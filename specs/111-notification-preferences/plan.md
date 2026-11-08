# Implementation Plan: Notification Preferences & Marketing Consent

**Branch**: `111-notification-preferences` | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/111-notification-preferences/spec.md`

## Summary

Spec 109 made `notify()` the one writer of every notification. This feature gives people a say in what it writes, and
records marketing consent before any promotion can exist.

**Rules at the moment of sending** (R1, R4–R7):
- `notify()` applies the category policy, the customer's channel choices and marketing consent in the same SQL that
  writes the rows:
  - marketing without a current yes → nothing is written;
  - a channel turned off → the delivery is `skipped`;
  - a marketing push over the limits → `capped`;
  - a marketing push at night → held with `not_before` 08:00.
- The drain skips held rows and re-judges them on release.
- No `notify()` call site changes.

**Policy and storage** (R2, R3, R5):
- One category policy in `@effy/shared-types` (required, marketing, defaults, changeable channels, Android channel,
  words), with Kotlin twins pinned to a fixture.
- One migration with:
  - `customer_notification_choice` (current choices);
  - `customer_marketing_consent` (append-only history), plus the view `marketing_consent_current`;
  - `notification_settings` (the limits), plus `notification_settings_change`;
  - `not_before`, plus two delivery statuses.

**Routes** (R8):
- `GET`/`PATCH /customer/v1/notification-preferences` (shared 185 → 187);
- five read/settings routes in `orders` for back-office (staff 213 → 218).

**Screens** (R10, R11, R15):
- customer app and website: Notification settings, the one-time offers ask on the order confirmation, and "Stop offers
  like this" on offer items;
- driver app and shop console: their categories shown as fixed;
- back-office: the customer's choices and consent activity, and a Notification settings page for the limits.

**Phones** (R12): Android channels per category; the FCM message names the channel.

**Wording** (R9): the consent wording and privacy policy v2 are drafted in research.md, for operator approval, and
published through `@effy/legal-content`.

## Technical Context

**Language/Version**: TypeScript 5.9 (Node 22 Lambdas, React 19 consoles, Next.js 16 customer-web), Kotlin 2.4 (customer
and driver apps), PostgreSQL 16 SQL.

**Primary Dependencies**: existing only:
- `@effy/edge-shared` (`notifications`, `activity`, `lib/db`);
- `@effy/shared-types` and the quicktype contract generators;
- `@effy/legal-content` and its generator;
- `@effy/web-kit` (activity-log, tour, settings layout), the design-system shadcn components;
- TanStack Router/Query/Form in the consoles;
- the app kits (`EffySheet`, `EffySwitch`, driver kit).

**No new package.**

**Storage**: one additive migration, `20261110090000_notification_preferences.sql`, with a full Down (see
[data-model.md](data-model.md)). Bodies are wrapped in goose `StatementBegin`/`StatementEnd`, and it is checked with real
goose up/down/up before hand-off.

**Testing**:
- vitest unit tests, plus container tests on the local Postgres recipe:
  - `notify` rules per row of [contracts/sending-rules.md](contracts/sending-rules.md);
  - limits with the lock and concurrent sends;
  - quiet hours with a fixed clock;
  - the drain release re-check;
  - purge erasure;
  - the PATCH transaction;
- guards: `preferences.guard`, `notification-categories.test` (policy ↔ catalogue ↔ CHECK ↔ Kotlin copies), the
  existing 109 one-writer guard, change-map (SILENT), gateway capacity;
- both consoles' tours, skeletons and list-screen guards;
- customer-web vitest, build and first-load rule;
- Kotlin host tests (settings ViewModels, ask logic, policy fixture) and Android/iOS compiles; mobile and driver
  guards;
- the quickstart walk.

**Target Platform**:
- shared gateway: `customer`;
- staff gateway: `orders`;
- the `notifications` drain and purge;
- every `notify()` caller, through the shared library;
- the customer and driver apps;
- shop-web, back-office and customer-web.

**Project Type**: a monorepo of serverless services, three web apps, two KMP apps and shared packages.

**Performance Goals**:
- the rules add one join per recipient set, inside the existing insert statement;
- a 1,000-recipient marketing page stays a single statement;
- settings load within 1 s.

**Constraints**:
- one writer per fact (choices and consent in `preferences.ts`; rows in `notify()`; outcomes in the drain);
- no timers: held pushes ride the existing one-minute drain;
- the operating zone only through `OPERATING_TZ`;
- no personal data in telemetry;
- the customer app has no centred dialogs or drop-downs;
- every console page has a tour;
- loading states draw the page's own shape;
- never edit a committed migration;
- no compatibility fields;
- the staff gateway stays under the 225 alarm (218).

**Scale/Scope**:
- 1 migration;
- shared:
  - 1 new module (`preferences.ts`) and changes to `notify.ts`, `catalogue.ts` and the purge;
  - the drain claim, `pendingStats` and the FCM sender;
- routes: 2 customer and 5 orders handlers plus serverless entries;
- shared-types: 1 module plus a fixture, contract DTOs;
- legal-content: the consent JSON, privacy v2 and the generator;
- customer app about 9 files, driver app about 4, shop-web about 3, back-office about 6, customer-web about 8.

## Constitution Check

| Principle | Check |
|---|---|
| I Spec-driven | spec.md → this plan → tasks.md. The tour words are in the spec (106/107 rule). The consent wording is drafted for approval, not invented in code. ✓ |
| II Shared contracts | The category policy, DTOs and consent words are each one source (shared-types, legal-content). Kotlin twins are pinned to fixtures, and the customer contract is regenerated. ✓ |
| III One serverless backend | Routes go in existing services (`customer` on shared 187/300, `orders` on staff 218/300, both under 75%). Held pushes use the existing drain schedule. No queue, scheduler or compute is added. ✓ |
| IV Auth isolation | Customer routes sit behind the customer pool and are keyed on the caller's own customer. Back-office reads sit behind the admin pool with role checks. Staff cannot write consent (no route). ✓ |
| V Native feel / design | Customer app: the `EffySheet` ask, `EffySwitch` rows, no dialogs. Driver kit. Consoles: shadcn, the settings layout, the 104 drawer, tours. The website ask is an inline panel (first-load rule). No card layouts: settings are lists and detail rows. ✓ |
| VI Layered architecture | Handler → `preferences.ts` service → SQL. ViewModels over repositories in the apps. React Query is the server-state truth in the consoles. In customer-web the server renders and client islands act through Server Actions. ✓ |
| VII Observability | Four events without personal data (R14). The drain's age alarm ignores held rows. Delivery outcomes `skipped` / `capped` are countable for spec 4's report. ✓ |
| Real-world identifiers | None introduced. The consent text names only "Effy". ✓ |

No violations, so Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/111-notification-preferences/
├── spec.md                 # + guided tour words
├── plan.md                 # this file
├── research.md             # R1–R16, incl. draft consent wording + privacy v2
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── preferences-api.md
│   └── sending-rules.md
├── checklists/requirements.md
└── tasks.md                # /speckit-tasks
```

### Source Code (repository root)

```text
db/migrations/20261110090000_notification_preferences.sql   # 2 customer tables + view, settings + change, not_before, statuses

packages/shared-types/src/
  ├── notification-categories.ts            # NEW: policy per audience × category (R2)
  ├── notification-categories.fixtures.json # NEW
  ├── notification-categories.test.ts       # NEW: catalogue mapping, FR-001 lists, Kotlin copies, migration CHECKs
  ├── notification-preferences.ts           # NEW: DTOs (GET/PATCH, staff, settings)
  ├── customer-contract.ts, index.ts
packages/shared-types/contract/…            # regenerated
packages/legal-content/
  ├── src/consent/marketing.json            # NEW: versioned wording (R9)
  ├── src/documents/privacy-policy/v2.md    # NEW (v1 → superseded)
  └── scripts/build.mjs                     # emit consent into TS + Kotlin

apis/edge-api/shared/src/notifications/
  ├── preferences.ts                        # NEW: read/write choices + consent, channelAllowedSql, limits, quiet hours
  ├── preferences.container.test.ts, preferences.guard.test.ts
  ├── notify.ts                             # applies the rules (R1)
  ├── notify.container.test.ts              # + rules table
  └── catalogue.ts / catalogue.test.ts      # marketing words must name Effy
apis/edge-api/customer/src/functions/customer-notification-preferences-v1-{get,patch}.ts   # NEW
apis/edge-api/customer/serverless.yml       # + 2
apis/edge-api/orders/src/notifications/…    # NEW: customer prefs read, consent activity source, settings repo
apis/edge-api/orders/src/functions/{customer-notification-preferences-v1-get, customer-consent-activity-v1-get,
  notification-settings-v1-get, notification-settings-v1-put, notification-settings-activity-v1-get}.ts   # NEW
apis/edge-api/orders/serverless.yml         # + 5
apis/edge-api/notifications/src/
  ├── worker/repository.ts                  # not_before filter, release re-check, pendingStats
  ├── worker/drain.ts                       # `skipped` outcome on release
  ├── fcm/sender.ts                         # android channel_id
  └── purge/repository.ts                   # erase choices + consent
apis/edge-api/live/… change-map.guard.test.ts   # SILENT entries

apps/customer-mobile/
  ├── shared/src/commonMain/.../features/notifications/settings/{data,domain,presentation}/   # NEW settings screen + VM
  ├── shared/src/commonMain/.../features/notifications/offers/OffersAsk.kt                    # NEW sheet + logic
  ├── shared/src/commonMain/.../features/checkout/presentation/ReceiptScreen.kt              # shows the ask
  ├── shared/src/commonMain/.../features/notifications/presentation/InboxScreen.kt           # offer detail + stop
  ├── shared/src/commonMain/.../core/platform/NotificationsSetting.kt (+ actuals)             # ported from driver
  ├── shared/src/commonMain/.../core/push/NotificationCategoryPolicy.kt                      # NEW Kotlin twin
  ├── androidApp/…/MainActivity.kt (channels), AndroidManifest.xml (default channel)
  └── app/{CustomerShell,AppContainer}.kt, AccountScreens.kt (row), AnalyticsEvent.kt
apps/driver-mobile/
  ├── features/account/AccountScreen.kt     # fixed categories
  ├── core/push/NotificationCategoryPolicy.kt
  └── androidApp/… channels + manifest
apps/shop-web/src/features/notifications/NotificationSettings.tsx   # "Always in your inbox"
apps/shop-web/src/features/tours/tours.ts   # NS v2
specs/106-guided-tours/spec.md              # NS inventory updated (test source)
apps/back-office/src/
  ├── features/customers/{CustomerDetailScreen.tsx, queries.ts, repo.ts}   # Notifications section + consent drawer
  ├── features/settings/notifications/…     # NEW page (limits + activity)
  ├── features/settings/SettingsIndexScreen.tsx, router
  └── features/tours/tours.ts               # CN tour
specs/107-backoffice-guided-tours/spec.md   # CN inventory (test source)
apps/customer-web/
  ├── app/(account)/account/notifications/settings/page.tsx (+ actions.ts)   # NEW
  ├── components/notifications/{NotificationSettingsForm.tsx, OffersAsk.tsx}  # NEW
  ├── app/checkout/complete/page.tsx        # the ask
  ├── components/notifications/InboxView.tsx # offer detail + stop
  └── lib/customer-reads.ts, lib/telemetry.ts
docs/telemetry/platform-events.md, docs/notifications-backlog.md
```

**Structure Decision**: no new service, app or package.
- The rules live where 109 put the one writer.
- Choices and consent have one writer module beside it.
- Back-office reads sit in `orders`, which already serves the customer page and points settings.

## Phase 0 / Phase 1

See [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/) and
[quickstart.md](quickstart.md). Post-design constitution re-check: unchanged, all ✓.

## Operator approval needed before shipping

The consent wording and privacy policy v2 drafts are in [research.md › R9](research.md). Implementation uses them as
drafted. The operator approves or edits them before the deploy, and an edit is a text change only.

## Deploy order (for the operator)

1. `make db-up ENV=dev`: additive. Old code ignores the new tables and column; the status CHECK only widens.
2. `make edge-deploy ENV=dev SERVICE=notifications`: the drain honours `not_before` and the re-check, and the purge
   erases. This must come before any `notify()` writes `not_before`.
3. `make edge-deploy-all ENV=dev`: `notify()` applies the rules in every service, plus the customer and orders routes.
4. shop-web, back-office and customer-web through their pipelines; both apps.

No Terraform change.

## Complexity Tracking

None.
