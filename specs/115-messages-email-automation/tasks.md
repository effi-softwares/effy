# Tasks: Messages That Do More (115)

**Input**: `specs/115-messages-email-automation/`: spec (FR-023 amended at planning), plan, research R1–R12, data-model,
`contracts/routes.md`, quickstart.

**Tests**: included where the guarantees are mechanical:
- no offer/news email without both consents (SC-003);
- unsubscribe without sign-in, and a wrong token reveals nothing (FR-005, FR-006);
- never twice per occurrence (SC-004);
- every repeat on time (SC-005);
- no name on a lock screen or in stored rows (SC-006, FR-026);
- the report adds up (SC-007).

Container tests run on the local Postgres recipe (memory: container-tests-local-postgres). The migration is checked with
real goose up / down-to / up.

**Rules carried from the plan**:
- deliveries only through `notify()`; the consent log is append-only; `marketing_consent_current` reads notification rows
  only;
- names never stored, logged or pushed;
- the two public routes answer one shape for any token;
- no merged routes (staff 240/300, shared 189/300);
- tours, skeletons, `DataTable` and shadcn in back-office;
- the customer-web guest-route first-load rule;
- `EffySheet` in the app;
- never edit a committed migration;
- no real-world identifiers beyond the approved `hello@effyshopping.com`.

## Phase 1: Setup

- [X] T001 Write `db/migrations/20261113090000_messages_email_automation.sql` per data-model.md, with a full Down:
  - `customer_marketing_consent`: + `channel` (default `notifications`, CHECK), + `message_id` (FK ON DELETE SET NULL), widened
    `surface` / `via` CHECKs;
  - **redefine `marketing_consent_current`** to `WHERE channel = 'notifications'`; new view `marketing_email_consent_current`;
  - `customer_notification_choice`: **drop `customer_notification_choice_channel_ck`** and widen `surface` to `app`, `web`,
    `email` (analysis C1, C2). The Down deletes offer/news email rows and `surface = 'email'` rows first;
  - `customer.email_unsubscribe_token` (UNIQUE, NULL);
  - `message` + `email`, `name_fallback`, `automation_id`, the customer-only CHECK on `email`, the title CHECK refusing
    `{first name`;
  - tables `message_automation` (all mode CHECKs), `message_automation_run`, `message_automation_recipient`
    (UNIQUE automation/customer/occurrence), `message_automation_event`, with their indexes;
  - revoke UPDATE/DELETE on the two append-only tables from `effy_shopper`, as 111 did.
- [X] T002 [P] Shared types in `packages/shared-types/src/`:
  - `notification-categories.ts` + `notification-categories.fixtures.json`: offers and news `changeable: ["push", "email"]`
    (defaults unchanged). Update the Kotlin twins in both apps the fixture test reads;
  - `messages.ts`: `email`, `nameFallback` on the draft and DTO; `FIRST_NAME_PLACEHOLDER = "{first name}"`;
    `fillFirstName(text, firstName | null)` (fills `{first name|fallback}` and a bare `{first name}`); `titleHasPlaceholder`;
    `MessageReportDTO.email`; `NAME_FALLBACK_LIMIT = 20`;
  - new `message-automations.ts`: `AutomationDTO`, `AutomationDraft`, `AutomationRunDTO`, `AutomationStatus`, `TRIGGERS`
    (`not_ordered_days` 7–365 days, `cart_left_hours` 1–72 hours, labels), `REPEAT_EVERY`, and the pure
    `nextRunAt(schedule, after: Date, tz)` on Effy's clock;
  - new `email-unsubscribe.ts`: request and response;
  - `notification-preferences.ts` (111): email toggles carry `emailWordingVersion`;
  - export from `index.ts`, and unit tests for `fillFirstName` and `nextRunAt` (including a daylight-saving change in
    `OPERATING_TZ`).
- [X] T003 [P] `packages/legal-content/src/consent/marketing-email.json` (version `marketing-email-2026-11`, **DRAFT**: "Email me
  Effy's offers and news. You can unsubscribe from any email."), the generator output (`src/generated/consent.ts`) and the
  customer app's twin. `legal:check` stays green.
- [X] T004 [P] `packages/email-kit/src/templates/message.mjml`, plus the `CATALOG` entry `message` in `src/catalog.ts`:
  - vars: title, body (paragraphs), imageUrl?, buttonLabel, buttonUrl, marketing (boolean), unsubscribeUrl?, reason;
  - subject = title; preheader = the first body line;
  - the marketing footer: the sender line from the legal identifiers, `hello@effyshopping.com`, the reason, Unsubscribe.
  - Allow `send.ts` `SendOptions.headers` (List-Unsubscribe, List-Unsubscribe-Post) and pass them into SES `Headers`.
  - Render test: a marketing email has the unsubscribe link and headers; a service email has neither.
- [X] T005 Regenerate the contracts (`pnpm --filter @effy/shared-types contract:gen`, `commerce-contract:gen`) and run
  `pnpm --filter @effy/shared-types test`.

## Phase 2: Foundational (blocks every story)

- [X] T006 `apis/edge-api/shared/src/notifications/notify.ts`:
  - the `message` input gains `email: boolean` and `nameFallback`;
  - for customer recipients with `email`, the channels include `email`; consent and the switch already decide `skipped`;
  - **extend the night hold and the limits to marketing email** (analysis G1; today they apply to `channel = 'push'`
    only, ~lines 156–172):
    - a marketing email in [21:00, 08:00) is `pending` with `not_before` = next 08:00;
    - the limits count marketing **notifications** per customer (any channel), and over a limit both the push and email
      deliveries are `capped`;
    - update the `not_before` "push only" comment;
  - the body is stored with `{first name}` normalised to `{first name|<fallback>}`;
  - throw on the placeholder in a title.

  Keep `notifications.guard.test.ts` green.
- [X] T007 `apis/edge-api/shared/src/notifications/inbox.ts`: fill the placeholder with the recipient's first name
  (`fillFirstName`), else the fallback. Join or select the name per audience: customer `given_name`, driver first name,
  shop staff first name. Add an inbox container test: a name, no name, and the stored row unchanged.
- [X] T008 `apis/edge-api/notifications/src/worker/drain.ts`: **the push text fills the placeholder with the fallback,
  always** (`fillFirstName(body, null)`). Add a unit test that a push built from a placeholder body never contains the
  recipient's name (SC-006).
- [X] T009 Create `apis/edge-api/shared/src/notifications/messages/words.ts`, the ONE validation and normalisation of
  message words (title placeholder refusal, fallback rules, email only for customers, `messageNamesEffy`), used by the
  admin service and the worker's runner. Update the messages admin service validation in
  `apis/edge-api/admin/src/messages/service.ts` to call it:
  - refuse `{first name}` in the title (`400`, field `title`);
  - validate `nameFallback` (1–20 characters, no braces);
  - accept `email` only for customer audiences.

  Extend `service.test.ts`.

**Checkpoint**: messages can carry email and a name placeholder; nothing sends email yet.

## Phase 3: User Story 1 - Send an offer by email too (P1) 🎯 MVP

**Goal**: a customer message may go by email. Offers and news reach only customers with both consents; service kinds
reach everyone with an address; suppressed addresses are skipped; the report counts email.

**Independent test**: A (yes and email on) gets the email; B (yes, email off) gets the inbox only; C gets nothing;
Important reaches A and B by email.

- [X] T010 [US1] `apis/edge-api/shared/src/notifications/preferences.ts`: turning email on or off for offers or news writes
  the choice row and an email consent row (`channel = 'email'`, the version). Turning it on requires the current email
  wording (`409 consent_wording_changed`) and the category's notifications yes (`400 consent_required`). `GET` returns the
  email switches and wording. Extend `preferences.container.test.ts`, including that 111's `marketing_consent_current`
  ignores email rows.
- [X] T011 [US1] Unsubscribe tokens: `apis/edge-api/shared/src/notifications/messages/unsubscribe.ts`, issuing and
  resolving ONLY: `ensureUnsubscribeToken(tx, customerId)` (32 random bytes, base64url, set once) and
  `customerForToken(q, token)`. It writes only `customer.email_unsubscribe_token`, never choices or consent (111's
  `preferences.guard`). The messages worker (`apis/edge-api/notifications/src/messages/worker.ts`) ensures it for each
  customer recipient of a marketing email page.
- [X] T012 [US1] `apis/edge-api/notifications/src/worker/email-sender.ts` and `drain.ts`, for the message types
  (`customer_message`):
  - send template `message` from the claimed delivery's words, image and destination (customer-web path for the
    destination);
  - the first name filled for the email body (the customer's `given_name`), the fallback for the preheader;
  - marketing kinds carry the unsubscribe link and the List-Unsubscribe headers (edge and web base URLs from the stack's
    env);
  - **suppression**: before **any message email** (`customer_message`, marketing and service alike, analysis I3), read
    `email_delivery_status`; `undeliverable` or `complained` → `skipped` with error `suppressed`. System emails are
    unchanged;
  - emit `MessageEmails{outcome}`.

  Add stack env for the web base URL in `apis/edge-api/notifications/serverless.yml` if not present.
- [X] T013 [US1] Report: `apis/edge-api/shared/src/notifications/messages/report.ts` + `MessageReportDTO.email`.
  - **The partition that adds up to recipients** (analysis A1): sent, failed, held for the night (pending with
    `not_before`), over the limit (`capped`), and not sent by reason (no address / off / suppressed).
  - **Beside it, outside the sum**: unsubscribed, from `customer_marketing_consent.message_id`.

  Extend 112's report test so the whole report adds up with email (SC-007).
- [X] T014 [US1] Test send (analysis I5): `apis/edge-api/admin/src/messages/service.ts`. When `email` is on, the admin
  service sends the email **itself**: email-kit `message`, straight to the picked test account's address, not through
  `notify()`, recorded nowhere, with 112's `Test: ` prefix. Add `ses:SendEmail` on the platform identity and the mail env
  to `apis/edge-api/admin/serverless.messages.yml`. Add a service test.
- [X] T015 [US1] back-office composer (`apps/back-office/src/features/messages/MessageEditorScreen.tsx`, `components/`,
  `draft.ts`, `words.ts`), and the "Send message" direct composer on the customer page (analysis G4):
  - an **Email** tickbox for customer audiences, with the words saying who gets it per kind;
  - an email preview pane approximating the `message` layout (title, picture, body, button, footer for marketing).
- [X] T016 [US1] back-office report: an Email section in `apps/back-office/src/features/messages/MessageScreen.tsx` (the
  partition, then unsubscribes beside it); the withdraw sheet says "Emails already sent stay sent" when the message had
  email (analysis L1); and
  the customer page's Notifications panel line for a suppressed address (`apps/back-office/src/features/customers/`) from
  the customer read in the orders service. Add the field to that DTO.
- [X] T017 [US1] Customer settings, email switches with the wording on turn-on:
  - customer-web `apps/customer-web/app/(account)/account/notifications/settings/` (and its API proxy), event
    `marketing_email_toggled`;
  - customer app `features/notifications/settings/presentation/NotificationSettingsScreen.kt` + `ViewModel` (an
    `EffySheet` with the wording; `MarketingEmailToggled`);
  - tests on both.
- [X] T018 [US1] Container test `apis/edge-api/shared/src/notifications/messages/email.container.test.ts`, **the matrix**:
  - for offer and for news: category yes/no × email on/off × suppressed or not → an email delivery `pending`, `skipped`
    or none;
  - a marketing email at 22:00 is held to 08:00; over the daily limit, push and email are both `capped` and the inbox
    item stays (G1);
  - an Important email to a suppressed address is `skipped` (I3);
  - Important to customers emails everyone with an address;
  - a customer with no address is "no address" in the report (SC-003).

**Checkpoint**: email works end to end; unsubscribe comes next (US1 and US2 ship together).

## Phase 4: User Story 2 - Unsubscribe in one tap (P1)

**Goal**: one tap turns marketing email off, with no sign-in, revealing nothing, undoable, recorded.

**Independent test**: the link in a private window confirms. Settings show email off. A changed token says "didn't work"
and changes nothing.

- [X] T019 [US2] In `apis/edge-api/shared/src/notifications/preferences.ts`, the one writer of choices and consent
  (analysis I1; 111's `preferences.guard` stays unchanged):
  - `unsubscribeFromEmail(tx, customerId, messageId, via)` turns both email switches off (`surface = 'email'`) and writes
    a consent "no" per category that was on;
  - `undoEmailUnsubscribe(tx, customerId)` restores the switches from before the latest email-link "no" within 7 days,
    and writes yes rows.

  The route resolves the token with `customerForToken` (T011) first. Both return `{ ok }` and never throw for a bad token.
- [X] T020 [US2] Public routes in `apis/edge-api/customer/`:
  - `src/functions/email-unsubscribe-v1-post.ts` (body token, or the `?t=&m=` one-click form);
  - `src/functions/email-unsubscribe-undo-v1-post.ts`;
  - `serverless.yml` with no authorizer and `EmailUnsubscribes{source}`. No rate limiter (analysis U3: none exists on
    the edge; a 32-byte token cannot be guessed);
  - `docs/api/path-assignment.md` (shared 189/300).

  Keep the gateway capacity and change-map guards green (list them SILENT with the reason: "the customer's own email
  choice; no screen is live").
- [X] T021 [US2] customer-web guest page `apps/customer-web/app/email/unsubscribe/page.tsx` + a client component:
  - it posts to the route **from the browser after it has loaded**, never during the server render (analysis R1: mail
    scanners prefetch links), with its own skeleton meanwhile (`skeletons.guard`);
  - it shows "You won't get offers and news by email any more", or "That link didn't work";
  - Undo; a link to settings;
  - events `email_unsubscribed` / `email_unsubscribe_undone`;
  - no radix, vaul or sonner on first load (the depcruise first-load rule).

  vitest for both outcomes and Undo.
- [X] T022 [US2] Container test `apis/edge-api/shared/src/notifications/messages/unsubscribe.container.test.ts`:
  - by token;
  - idempotent;
  - one-click form;
  - a wrong token changes nothing and answers the same shape;
  - undo within 7 days and refused after;
  - the message's report counts the unsubscribe;
  - the next offer sends no email.
- [X] T023 [US2] Erasure: `customer` erasure (113, `apis/edge-api/customer/src/erasure/repository.ts`) NULLs
  `email_unsubscribe_token` and **deletes the customer's `message_automation_recipient` rows** (analysis I4: the row is
  kept, so the cascade never fires). Extend the full-database scan test's expectations.
- [X] T023b [US2] Consent history words (analysis G2): `apis/edge-api/orders/src/activity/consent.ts` says
  `channel = 'email'` ("by email"), `surface = 'email'` ("from an email") and `via` `email_link` / `one_click` ("unsubscribe
  link" / "mail program's unsubscribe button"). Extend its test.

**Checkpoint**: US1 and US2 are one deployable increment.

## Phase 5: User Story 3 - Messages that send themselves when something happens (P2)

**Goal**: triggered automatic messages, once per occurrence, through the ordinary message path.

**Independent test**: a 30-day win-back reaches a customer once; a new order resets it; pause stops it.

- [X] T024 [US3] Admin automations, in `apis/edge-api/admin/src/messages/automations/`:
  - `repository.ts`, `service.ts` (validation per contract through `messages/words.ts`: triggers customer-only and
    offer/news-only, ranges, the placeholder rule, version checks; **a change to the trigger kind or number resets
    `activated_at`**, analysis L7), `list.ts` (`parseListQuery`), `activity.ts` (`activityResponse` over
    `message_automation_event`);
  - `service.test.ts`.
- [X] T025 [US3] Six routes in `apis/edge-api/admin/src/functions/automations-*.ts`, plus `serverless.messages.yml`:
  - list, create, get, patch, state, activity at `/admin/v1/messages/automations…` (analysis I6); roles per contract;
    announce `ops` `messages` after writes; a route test that the literal `automations` segment never reaches a 112
    `{id}` route;
  - `docs/api/path-assignment.md` (staff 240/300).

  Keep the gateway capacity guard green.
- [X] T026 [US3] The runner, worker-side (analysis I2): `apis/edge-api/notifications/src/messages/automations.ts`
  `runTriggers(tx, now)`. Its message insert goes in `apis/edge-api/notifications/src/messages/repository.ts`, and
  `apis/edge-api/shared/src/notifications/messages/messages.guard.test.ts` names that file as the second creator of
  `public.message`, with the reason "automatic runs". The runner:
  - per active trigger automation on its cadence (`not_ordered_days` at 07:00 Effy time daily; `cart_left_hours`
    hourly), insert matching customers into `message_automation_recipient` with the occurrence key
    `ON CONFLICT DO NOTHING`;
  - only moments at or after `activated_at`;
  - create a `message` (status `scheduled`, send now, `automation_id`, audience `{automationRun}`) when any matched; record
    `message_automation_run`;
  - emit `AutomationRuns` / `AutomationRecipients`.
- [X] T027 [US3] `apis/edge-api/shared/src/notifications/messages/audience.ts`: the `automationRun` fragment (that run's
  recipients, intersected with the automation's filter). The live count refuses it (staff never build it). Extend the
  audience test.
- [X] T028 [US3] `apis/edge-api/notifications/src/messages/handler.ts` / `worker.ts`: call the runner (triggers and, in US4,
  repeats) before sending due messages, in the same minute. Extend `worker.container.test.ts`.
- [X] T029 [P] [US3] back-office Automatic (`apps/back-office/src/features/messages/automatic/`):
  - list (`DataTable`, `/messages/automatic`);
  - the automatic message page (summary, runs `StaticTable`, pause/resume/end, edit, the activity drawer, skeletons);
  - the composer's **When** section with "When something happens" (trigger and value);
  - routes and nav; queries/repo/words; live `messages` mapping;
  - tests.
- [X] T030 [US3] Container test `apis/edge-api/notifications/src/messages/automations.container.test.ts`, triggers:
  - 7 simulated daily runs, once per occurrence (SC-004);
  - a new order resets the win-back; the cart reminder resets only on a new order (removing a line or refilling does not,
    analysis U2);
  - changing the number resets `activated_at` (no backlog);
  - no backlog blast before `activated_at`;
  - never-ordered customers excluded;
  - a paused automation does nothing.

## Phase 6: User Story 4 - Messages on a repeating schedule (P2)

**Goal**: daily, weekly or monthly sends at a time, each its own message, never doubled or lost.

**Independent test**: a daily repeat sends at its time with its own report; pause and resume do not catch up.

- [X] T031 [US4] `apis/edge-api/notifications/src/messages/automations.ts` `runRepeats(tx, now)`:
  - start automations with `next_run_at <= now()`, skipping (not advancing) one whose last run's message is still
    `sending`;
  - create the message with the automation's audience filter;
  - when a waited run finally starts, advance `next_run_at` to the **first due time after now** (analysis L6); finish
    after `ends_on`;
  - resume recomputes from now.

  Drivers and shops are allowed.
- [X] T032 [US4] back-office: the When section's **Repeat** options (every day / week on days / month on a date, time,
  start, optional end) and the automatic page showing the next run. Extend the tests.
- [X] T033 [US4] Extend `automations.container.test.ts`, repeats:
  - 4 simulated weeks, every due time once (SC-005);
  - waits while the previous send is sending;
  - pause then resume does not catch up;
  - finished after the end date;
  - edits apply to future runs only;
  - a marketing repeat in the night hold is held to 08:00 (through `notify`).

## Phase 7: User Story 5 - Greet the customer by name (P3)

**Goal**: `{first name}` in body text, filled in the inbox and email, the fallback on lock screens, never stored.

**Independent test**: Sam sees "Hi Sam"; a nameless customer sees "Hi there"; the phone shows "Hi there"; the title
refuses it.

- [X] T034 [US5] back-office composer: an **Insert first name** button, the fallback field (default "there"), the preview
  showing a sample name and the fallback, and the title refusal in words. Extend the editor tests.
- [X] T035 [US5] Container test across the stack (in `notify-message.container.test.ts` or new):
  - the stored body holds `{first name|there}` and no name;
  - the inbox read gives "Hi Sam" / "Hi there";
  - the email vars have the name;
  - the push text has the fallback;
  - driver and shop recipients get their names;
  - a grep-style check that no metric or log line in the path includes a filled body (FR-026).

## Phase 8: Polish & Cross-Cutting

- [X] T036 [P] Tours:
  - add AM (Automatic list) and AU (automatic message page) to `specs/107-backoffice-guided-tours/spec.md`'s inventory,
    then `apps/back-office/src/features/tours/tours.ts` (+ `data-tour` keys);
  - raise ME's version with steps for Email, First name and When;
  - run `tours.test.ts`.
- [X] T037 Goose up / down-to `20261112120000` / up on the local Postgres.
- [X] T038 Run and record:
  - shared, notifications, customer, admin, orders units and containers;
  - shared-types, email-kit, legal-content checks;
  - back-office, customer-web (vitest, build, depcruise);
  - customer app host tests and compiles;
  - gateway capacity (189 / 240), change-map, activity, notifications guards, `check-no-telemetry-pii.sh`.

  Note any failure that predates 115.
- [X] T039 [P] Docs:
  - `FEATURE-HISTORY.md` (a 115 entry with the deploy order: wordings approved → db-up → notifications → customer,
    admin-messages, edge-deploy-all → back-office, customer-web → app; and that the staff gateway at 240/300 is close to
    112's ~255 point for the third-gateway amendment, analysis L8);
  - `CLAUDE.md` (the feature line, and a ⚠ under Notifications if needed: "names are filled at read; the lock screen
    always gets the fallback");
  - `docs/notifications-backlog.md` (E11–E13 done by 115).
- [X] T040 [P] Memory: `messages-email-automation-115.md` + the `MEMORY.md` line.
- [X] T041 Walk the quickstart's local checks, mark this file [X], and hand off the operator steps.

## Dependencies

- Phase 1 → Phase 2 → stories.
- US1 and US2 ship together (email without unsubscribe is not lawful for marketing).
- US3 and US4 share the runner file (`notifications/src/messages/automations.ts`). Do US3 first (it creates the file and the worker hook), then US4.
- US5 needs Phase 2 only (T006–T008 do the filling), plus T034 for the composer.
- Polish after the stories.

## Parallel examples

- Setup: T002, T003 and T004 together.
- US1: T015–T017 (screens) beside the backend T010–T014.
- US2: T021 (web page) beside T019–T020.
- US3: T029 (back-office) beside T024–T028.

## Implementation strategy

1. **MVP = Phases 1–4 (US1 + US2)**: email with a lawful unsubscribe. Needs both wordings approved before a real offer goes
   out.
2. US3, then US4: automatic messages.
3. US5: the first name (its plumbing is in Phase 2 already; T034–T035 finish it).
4. Polish.

**Totals**: 42 tasks (T023b added after `/speckit-analyze`):

| Phase | Tasks |
|---|---|
| Setup | 5 |
| Foundational | 4 |
| US1 | 9 |
| US2 | 6 |
| US3 | 7 |
| US4 | 3 |
| US5 | 2 |
| Polish | 6 |
