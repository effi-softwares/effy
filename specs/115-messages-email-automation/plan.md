# Implementation Plan: Messages That Do More

**Branch**: `dev` (no feature branch; the operator commits) | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/115-messages-email-automation/spec.md` (notifications backlog E11–E13)

## Summary

Three additions to 112's back-office messages, all through the existing one writer (`notify()`), drain and `messages`
worker:

- **Email (E11)**. A customer message can also go by email.
  - Offers and news go only to customers who said yes AND turned the new email switch on. The switch is recorded as
    consent, with new draft wording.
  - Service kinds go to every customer with an address. Bounced or complained addresses are skipped, using 038's
    deliverability record.
  - A new email-kit template, `message`, carries the sender line, the contact address, a body Unsubscribe link and RFC 8058
    one-click headers.
  - Unsubscribing uses a stored per-customer token and two public routes, needs no sign-in, takes effect at once, and can
    be undone from a guest page on customer-web.
- **Automatic messages (E12)**. A template, `message_automation`, runs on a trigger ("hasn't ordered for N days", "items
  left in the cart for N hours") or a repeat (daily, weekly, monthly on Effy's clock).
  - Each run creates an ordinary 112 message, so consent, limits, the night hold, the cap, stop and the report all apply
    unchanged.
  - A unique (automation, customer, occurrence) row makes "never twice" structural.
- **First name (E13)**. `{first name}` is stored as a placeholder, never as a name, and filled when read: the inbox and
  the email get the name, while the phone notification always gets the fallback ("Hi there").

Details: [research.md](research.md) (R1–R12), [data-model.md](data-model.md), [contracts/routes.md](contracts/routes.md),
[quickstart.md](quickstart.md).

## Technical Context

**Language/Version**:
- TypeScript 5 / Node 22 (edge-api Lambdas, Serverless v3);
- React 19 (back-office, customer-web on Next.js 16);
- Kotlin 2.4 / CMP 1.11 (customer app).

**Primary Dependencies**:
- `@effy/edge-shared/notifications` (`notify`, `inbox`, `messages/*`, `preferences`);
- `@effy/email-kit` (MJML templates, SES v2 send);
- `@effy/legal-content` (consent wording, identifiers);
- `@effy/shared-types` (`notification-categories.ts`, `messages.ts`, a new `message-automations.ts`);
- `@effy/web-kit` (data-table, activity-log, tour).

**Storage**: PostgreSQL 16, raw SQL, one Goose migration `20261113090000_messages_email_automation.sql`.
- New tables: `message_automation`, `_run`, `_recipient`, `_event`.
- New columns: `message.email` / `name_fallback` / `automation_id`; `customer.email_unsubscribe_token`;
  `customer_marketing_consent.channel` / `message_id` and widened CHECKs.
- Redefined view: `marketing_consent_current`.

**Testing**:
- vitest unit and guard tests;
- container tests (the local Postgres recipe);
- customer-web vitest and the first-load depcruise;
- customer app host tests;
- goose up / down / up;
- an email render test.

**Target Platform**: AWS Lambda (ap-southeast-2) behind the shared and staff gateways; SES v2; Amplify web; the Android
and iOS customer app.

**Project Type**: monorepo. Backend services touched:
- notifications (worker, runner, drain);
- customer (public unsubscribe routes);
- admin (`admin-messages` stack: automations, the test email);
- orders (the customer page's message-email line, consent history words);
- the shared library.

Two web apps and one mobile app.

**Performance Goals**:
- A 20,000-recipient message with email still writes in about 1 s per 1,000-recipient page (112's budget), plus one email
  row each.
- The drain's email rate is bounded by SES's account sending rate. The drain already batches.
- Trigger runs select from indexed columns (`order.placed_at`, `cart_item.added_at`).

**Constraints**:
- Staff gateway 234 → **240/300** (past 75%, under the 90% stop); shared gateway 187 → **189/300**.
- No new compute, schedule or Terraform: the `messages` worker already runs every minute.
- No name in any stored notification row, metric, log or lock screen.
- Both consent wordings must be approved before the first real marketing send.

**Scale/Scope**:

| Area | Change |
|---|---|
| Migration | 1 |
| Shared library | notify (email channel for messages, the placeholder normalisation), inbox (fill), messages worker logic (automations, triggers, the unsubscribe token), report |
| New routes | 8 (2 public, 6 staff) |
| back-office | composer, report, Automatic list and page, the customer panel line; 2 new tours, 1 raised |
| customer-web | settings email switches, the unsubscribe page |
| Customer app | settings email switches |
| Email-kit and legal-content | 1 template, 1 wording |

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. Spec-driven | spec → plan → tasks. FR-023 amended at planning (R8) with the reason recorded | PASS |
| II. Monorepo, shared contracts | The policy, `fillFirstName`, `nextRunAt`, the automation DTOs and the unsubscribe contract live in shared-types; Kotlin twins for the policy and the email wording; the email template in email-kit | PASS |
| III. Single serverless backend | Routes in `customer` (shared) and `admin-messages` (staff); runs in the existing `notifications` worker; no new compute; SES is already in use; money untouched | PASS |
| IV. Auth isolation | The two unsubscribe routes are public by design (token-authenticated by an unguessable 32-byte token, the same answer for a bad token, acting only after the page loads). Staff routes stay admin-pool with role checks (CSA read only) | PASS (public routes justified below) |
| V. Native-feel, consistent design | Console: `DataTable` / `StaticTable`, Settings patterns, shadcn, tours on every new page, skeletons. customer-web unsubscribe page: guest route under the first-load rule. App: the consent sheet is an `EffySheet` | PASS |
| VI. Layered architecture | handler → service → repository. One writer (`notify`) for deliveries. **Choices and consent stay written only by `preferences.ts`** (unsubscribe/undo live there, 111's guard unchanged). The automation writer lives in admin. The runner is worker-side and **creates messages through the worker repository, named as the second creator in 112's `messages.guard`** with its reason. Word validation is one shared function | PASS |
| VII. Observability | Metrics `MessageEmails`, `EmailUnsubscribes`, `AutomationRuns`, `AutomationRecipients`. Product events (PostHog): customer-web `email_unsubscribed`, `email_unsubscribe_undone`, `marketing_email_toggled`; app `MarketingEmailToggled`. Existing worker and drain alarms cover failures. No PII (no names, no addresses) in any metric, event or log | PASS |
| Real-world identifiers | The sender address is the existing configured SES identity. The footer uses the approved `hello@effyshopping.com` and the legal entity from `@effy/legal-content` identifiers, which are still placeholders and already fail `legal:check --release` | PASS |
| Live (071) | Automation changes announce `ops` `messages`; no timers | PASS |

**Post-design re-check**: PASS.
- Watch: 111's `marketing_consent_current` must read notification rows only (data-model), or email answers would change
  who gets offers. A container test holds it.
- Watch: the unsubscribe routes must not become an account oracle. The same 200 shape answers every token, and the website page posts only after loading (mail scanners prefetch links).

## Project Structure

### Documentation (this feature)

```text
specs/115-messages-email-automation/
├── plan.md  research.md  data-model.md  quickstart.md
├── contracts/routes.md
├── checklists/requirements.md
└── tasks.md   (/speckit-tasks)
```

### Source Code (repository root)

```text
db/migrations/20261113090000_messages_email_automation.sql            # NEW

packages/shared-types/src/
├── notification-categories.ts (+ fixture)      # offers/news email changeable
├── messages.ts                                 # email, nameFallback, FIRST_NAME_PLACEHOLDER, fillFirstName, report.email
├── message-automations.ts (+ test)             # NEW: DTOs, TRIGGERS, REPEAT_EVERY, nextRunAt
├── email-unsubscribe.ts                        # NEW
└── contracts regenerated (Dto.kt / CommerceDto.kt as affected)
packages/email-kit/src/templates/message.mjml + catalog.ts + render test   # NEW template
packages/legal-content/src/consent/marketing-email.json + generated        # NEW draft wording

apis/edge-api/shared/src/notifications/
├── notify.ts                     # messages: email channel; placeholder normalised; title refusal
├── inbox.ts                      # fill the placeholder with the recipient's first name
├── preferences.ts                # email switch writes consent rows; wording version; consent_required;
│                                 #   unsubscribeFromEmail / undoEmailUnsubscribe (the ONE writer of choices + consent)
├── messages/words.ts             # NEW: one validation/normalisation of message words (admin + worker)
├── messages/audience.ts          # + automationRun fragment
├── messages/report.ts            # + email partition, unsubscribes beside it
├── messages/unsubscribe.ts       # NEW: issue/resolve tokens only (writes customer.email_unsubscribe_token)
└── *.container.test.ts           # matrix, triggers, repeats, unsubscribe, view
apis/edge-api/notifications/src/
├── messages/automations.ts       # NEW: the runner - due repeats, trigger runs, recipients, run rows
├── messages/repository.ts        # + the automatic message insert (112's messages.guard names it, second creator)
├── messages/handler.ts           # run automations before sending due messages
└── worker/email-sender.ts + drain.ts   # message template, suppression, headers, push fills the fallback
apis/edge-api/customer/src/functions/email-unsubscribe-v1-post.ts, email-unsubscribe-undo-v1-post.ts  # NEW (public)
apis/edge-api/customer/serverless.yml     # the two public routes
apis/edge-api/admin/src/messages/automations/{service,repository,activity,list}.ts  # NEW
apis/edge-api/admin/src/functions/automations-*.ts (6) + serverless.messages.yml
apis/edge-api/admin/src/messages/service.ts   # email, nameFallback, the title refusal, test email sent directly (SES)
apis/edge-api/orders/src/activity/consent.ts  # email channel / surface / via words
apis/edge-api/orders/src/customers/           # the customer page's message-email (suppression) line
apis/edge-api/customer/src/erasure/repository.ts  # NULL the token, delete automation recipient rows

apps/back-office/src/features/messages/
├── composer (email tick + preview, first name insert + fallback, When section)
├── report (Email section)
├── automatic/ (list, page, queries, repo, words, tests)   # NEW
└── tours: AM, AU new; ME raised (specs/107 inventory first)
apps/back-office/src/features/customers/ (Notifications panel: marketing email line)
apps/customer-web/app/(account)/account/notifications/settings  # email switches + wording
apps/customer-web/app/email/unsubscribe/page.tsx (+ actions)    # NEW guest page
apps/customer-mobile/.../features/notifications/ (settings email switches, consent sheet)
docs/api/path-assignment.md (240/300, 189/300); FEATURE-HISTORY, CLAUDE.md, notifications-backlog (E11–E13 done)
```

**Structure Decision**: the existing services and packages. The runner lives in the shared messages module so the worker
stays thin, as 112 did. The automation routes join `admin-messages`, the stack that owns messages.

## Deploy order

1. Approve both consent wordings.
2. `db-up`.
3. `SERVICE=notifications`: the drain and worker understand the new rows first.
4. `SERVICE=customer`, `SERVICE=admin-messages`, `edge-deploy-all`.
5. back-office, customer-web, the customer app.

## Complexity Tracking

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| Two public, unauthenticated routes | The law requires unsubscribe without sign-in; mail programs POST one-click with no session | A sign-in step is not lawful for marketing email; an emailed code adds a hurdle the Spam Act forbids |
| Staff gateway to 240/300 | Six routes for a new managed object with its own lifecycle | Merging into message routes is prohibited ("never merge routes to fit"); a third gateway needs an amendment and is not yet needed (under 90%) |
