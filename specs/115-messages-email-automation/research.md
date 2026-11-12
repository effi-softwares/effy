# Research: Messages That Do More (115)

Decisions made by reading the code on `dev` (2026-11-12): 109–112's notification record, preferences and messages, 038's
email kit, the SES deliverability consumer. The spec had no open questions. Format: Decision / Rationale / Alternatives.

## R1 - Email for messages goes through the existing record and drain

**Decision**:
- A message gains `email` (`message.email`, customers only).
- The messages worker passes `email` in `notify()`'s channels for customer recipients, so `notify()` writes one
  `notification_delivery` row with channel `email`, exactly as system notifications do. Consent and the switch already
  decide `skipped` for email (`channelAllowedSql`).
- ⚠ **The night hold and the limits do NOT cover email today** (amended after `/speckit-analyze` G1). `notify()`
  (`notify.ts` ~156–172) caps and holds only `channel = 'push'`. 115 changes `notify()` so they cover marketing email too:
  - a marketing email in [21:00, 08:00) is `pending` with `not_before` = next 08:00 (the drain already claims only
    `not_before <= now()`; the column's "push only" comment is updated);
  - the limits count marketing **notifications** (one per customer per message, whatever the channels), not pushes. When a
    customer is over a limit, both the push and the email delivery are `capped` and the inbox item stays. A customer gets
    at most the limit of marketing messages a day, however many channels each uses (FR-011);
  - container matrix tests in T018 hold all of it.
- The drain sends it with a new email-kit template, `message`. Its vars (title, body, picture, button label and link,
  unsubscribe link) come from the claimed delivery's own words (`d.title`, `d.body`, image, destination). No entity load is
  needed.

**Rationale**:
- One writer and one drain, as 109 ruled. 111's rules already cover email (`channelAllowedSql`).
- The drain already holds the words it claimed, so the email shows exactly what the inbox shows.

**Alternatives**:
- A separate campaign email sender reading `message`. Rejected: a second path around consent and limits.
- An external marketing platform. Rejected: it would be a second record of consent and a second backend.

## R2 - Marketing email consent: a switch plus the existing consent log

**Decision**:
- `notification-categories.ts`: offers and news `changeable` becomes `["push", "email"]`, defaults stay `email: false`.
  The settings screens on both clients render changeable channels from the policy, so the email switches appear.
- `customer_marketing_consent` (append-only) gains:
  - `channel text NOT NULL DEFAULT 'notifications'` (`notifications` | `email`);
  - `surface` gains `email` and `via` gains `email_link` / `one_click` (the unsubscribe page, a mail program's one-click);
  - nullable `message_id`, so a message's report can count its unsubscribes.
- Turning email ON for a category writes a consent row (`channel = 'email'`, answer yes, the wording version shown).
  Turning it OFF writes a "no" row. The switch row in `customer_notification_choice` is the one `notify()` reads.
- **The rule**, unchanged in shape: an offer or news email needs the category's notifications consent yes (111) AND the
  email switch on.
- A new consent wording, `marketing-email-2026-11` in `@effy/legal-content` `consent/`, is a **draft** for operator
  approval: "Email me Effy's offers and news. You can unsubscribe from any email."
- `PATCH /customer/v1/notification-preferences` requires the wording version when turning email on
  (`409 consent_wording_changed`, as 111 does).

⚠ 111's view `marketing_consent_current` must then read only `channel = 'notifications'` rows, or an email answer would
decide who gets offers at all (data-model.md).

**Rationale**:
- The law asks for consent evidence: who, when, how, in what words. 111's log already records exactly that.
- The switch row stays the one thing `notify()` asks, so the rule is not written twice.

**Alternatives**:
- Treat 111's yes as covering email. Rejected in the spec (assumption 1): the wording shown spoke of notifications.
- A separate email-consent table. Rejected: two consent logs to keep in step.

## R3 - Unsubscribe: a stored per-customer token, two public routes, one page

**Decision**:
- `customer.email_unsubscribe_token` (32 random bytes, base64url, unique, created on first marketing email). It is not
  derived from a secret, so nothing has to be seeded and a leaked token can be replaced.
- Two **public** routes on the shared gateway, `customer` service. **No rate limiter** (amended, U3): the edge has no shared
  one, and a 32-byte random token cannot be guessed, so the routes do one indexed lookup and nothing else for a wrong
  token:
  - `POST /customer/v1/email-unsubscribe` `{ token, messageId? }`: email for offers and news off. Writes choice rows and a
    consent "no" (`surface = email`, `via = email_link | one_click`). Idempotent.
  - `POST /customer/v1/email-unsubscribe/undo` `{ token }`: restores the switches to their state just before that
    unsubscribe, and writes consent yes rows (`surface = email`, `via = email_link`, the current email wording version).
  - An unknown token answers the same 200 shape with `ok: false`. Nothing about any account is revealed.
- Each marketing email carries:
  - the body link to customer-web `/email/unsubscribe?t=<token>&m=<messageId>`, a guest page that **posts to the route from
    the browser after it has loaded**, never during the server render, and offers Undo. Mail security scanners fetch
    links, and an unsubscribe on render would unsubscribe people who never tapped (amended, R1 risk);
  - the RFC 8058 headers `List-Unsubscribe: <https://edge-api.<zone>/customer/v1/email-unsubscribe?t=…&m=…>` and
    `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. The POST route also accepts the query-string form a mail program
    sends.
- Erasure (113): the token is NULLed with the rest of the customer row.
- ⚠ **Where the writes live (amended, I1)**: 111's `preferences.guard` allows only `shared/src/notifications/preferences.ts`
  to write choices and consent answers. Unsubscribe and undo are functions **in `preferences.ts`**
  (`unsubscribeFromEmail`, `undoEmailUnsubscribe`), so the consent rule has one home. `messages/unsubscribe.ts` only issues
  and resolves tokens (`ensureUnsubscribeToken`, `customerForToken`), which writes `customer.email_unsubscribe_token` and
  nothing else.
- **Undo** works for 7 days after the unsubscribe (amended into the spec, FR-005).

**Rationale**:
- Mail programs and Gmail/Yahoo bulk-sender rules expect one-click unsubscribe.
- The Spam Act requires a functional unsubscribe without sign-in, honoured within 5 working days. Here it takes effect at
  once.
- A stored token is the simplest revocable credential.

**Alternatives**:
- An HMAC token over the customer id. Rejected: a key to create and seed, and it cannot be revoked per customer.
- A sign-in page. Refused by the law's "no fee, no hurdles" spirit.

Gateway: shared **187 → 189/300**.

## R4 - Suppressed addresses come from the existing deliverability record

**Decision**:
- Before sending **any message email** (`customer_message`: marketing and service alike), the drain reads
  `email_delivery_status`. Its SES bounce and complaint consumer is already in `admin/src/deliverability`.
- `undeliverable` or `complained` → delivery `skipped` with error `suppressed`.
- The platform's system emails (order, points, account) keep today's behaviour (amended, I3; FR-008 now says the same).
- The customer page's Notifications panel shows "Message email: not sent - address bounces/complained" from the same
  table.

**Rationale**: the bounce and complaint record exists, and staff already repair it in back-office › Deliverability. A second
list would drift.

## R5 - The email template

**Decision**:
- A new email-kit template `message` (MJML, the 038 design). The subject is the message title, the preheader is the first
  line of the body with the first name replaced by the fallback (R8), then the picture, the body (paragraphs, no HTML from
  staff), and one button to the destination.
- The footer (marketing kinds only) has the sender line ("From Effy, <legal entity>" from `@effy/legal-content`
  identifiers) and `hello@effyshopping.com` (the approved customer address), then "You're getting this because you said yes
  to offers by email." and "Unsubscribe".
- Important and direct emails have no unsubscribe, since they are service messages.
- The destination link is the web form of the customer destination (109's closed list → customer-web path). 116 makes those
  links open the app.

## R6 - Automatic messages: a template plus runs, sent as ordinary messages

**Decision**:
- New table `message_automation`:
  - words, kind, audience filter, destination, picture, channels, name fallback;
  - `mode` (`trigger` | `repeat`);
  - for a trigger: `trigger_kind` (`not_ordered_days` | `cart_left_hours`) and `trigger_value`;
  - for a repeat: `repeat_every` (`day` | `week` | `month`), `repeat_days int[]` (ISO weekdays), `repeat_date int`,
    `repeat_time` (Effy clock), `starts_on`, `ends_on`;
  - `status` (`active` | `paused` | `finished`), `next_run_at`, `activated_at`, `version`, `created_by`.
- `message_automation_run` (append-only): `ran_at`, `matched`, `message_id`.
- `message_automation_event` (append-only), for the activity log.
- **Each run creates an ordinary `message` row** in status `scheduled` (send at = now), so sending, the per-message cap,
  stop, the report, the night hold and the limits are all 112's. `message.automation_id` links it back.
- ⚠ **Where the runner lives (amended, I2)**: 112's `messages.guard` allows only `admin/src/messages/repository.ts` to
  `INSERT INTO public.message`. The runner is worker-side, in `apis/edge-api/notifications/src/messages/automations.ts`,
  and its message insert goes in the worker's own `notifications/src/messages/repository.ts`, which already updates
  messages. The guard is changed to name it as the **second creator**, with the reason "automatic runs". The validation
  and normalising of words stays in one shared function, used by both admin and the worker.
- **Repeat**: the `messages` worker, each minute, starts automations whose `next_run_at <= now()`. It **skips** one whose
  previous run's message is still `sending`, leaving `next_run_at` alone, so the run waits rather than being lost (US4
  scenario 5). When the run does start, `next_run_at` advances to the **first due time after now** (amended, L6), so a
  waited run happens once and the next is on schedule, with nothing doubled and nothing skipped beyond that one wait. A
  paused automation's `next_run_at` is recomputed from now on resume, so nothing missed is sent (FR-019).
- **Trigger**: the same worker runs trigger automations on their cadence: `not_ordered_days` once a day at 07:00 Effy time,
  `cart_left_hours` hourly. Each run:
  1. inserts the matching customers into `message_automation_recipient (automation_id, customer_id, occurrence_key, run_id)`
     with a UNIQUE (automation_id, customer_id, occurrence_key), `ON CONFLICT DO NOTHING`;
  2. creates the message with audience `{ automationRun: <run id> }`, a new fixed audience fragment that selects that
     run's recipients intersected with the automation's own filter.
- **Occurrence keys**:
  - `not_ordered_days`: the id of the customer's last placed order. Once per stretch: a new order makes a new key (US3
    scenario 2).
  - `cart_left_hours`: the customer's last placed order id (or `none`), with the cart id. Removing a line or refilling the
    cart does **not** make a new key; only placing an order does (amended, U2; FR-015 says so). This never sends more
    often, and it needs no new cart column or second cart writer.
- **No backlog blast**: a trigger matches only customers whose moment (last order + N days, oldest line + N hours) is at or
  after `activated_at`. Activating a 30-day win-back does not send it at once to everyone who stopped ordering last year.
  **Changing the trigger kind or number resets `activated_at`** (amended, L7), so shortening N never sends to a backlog.
- **Erasure (amended, I4)**: 113 keeps the customer row, so the recipients' `ON DELETE CASCADE` never fires. 113's erasure
  deletes the customer's `message_automation_recipient` rows explicitly.
- **Kinds**: triggers are customer-only and offer or news only (both are commercial messages under the Spam Act, so
  consent applies). Repeats may be any kind and audience 112 allows.

**Rationale**:
- One sending path. Every guarantee 112 tested holds for automatic sends without new code.
- The recipients table is the "trigger record" the spec names, and the unique key is what makes "never twice" structural
  (SC-004).

**Alternatives**:
- An EventBridge schedule per automation. Rejected: Terraform per staff-made schedule, and the worker already runs each
  minute.
- Per-recipient sends outside `message`. Rejected: no report, no cap, no stop.

## R7 - Routes for automatic messages

(Paths amended, I6: under `/admin/v1/messages/automations…`, the prefix `docs/api/path-assignment.md` gives the
`admin-messages` stack.)

**Decision**: six staff routes in the `admin-messages` stack (staff gateway **234 → 240/300**, 80%):
- `GET /admin/v1/messages/automations` (list, `parseListQuery`)
- `POST /admin/v1/messages/automations`
- `GET /admin/v1/messages/automations/{id}` (with runs)
- `PATCH /admin/v1/messages/automations/{id}` (version-checked)
- `POST /admin/v1/messages/automations/{id}/state` (`pause` | `resume` | `end`)
- `GET /admin/v1/messages/automations/{id}/activity`

Admin and manager write; CSA reads. The audience-count and test-send routes from 112 are reused unchanged (their bodies
already carry the filter and words).

**Rationale**: no merged routes ("never merge routes to fit"). 240/300 is still under the 90% stop.
`docs/api/path-assignment.md` is updated with the new count.

## R8 - The first name: stored as a placeholder, filled in when read

**Decision**:
- The message body may contain `{first name}`. The composer and the admin service refuse it in the title (FR-023). A
  message also stores `name_fallback` (default `there`, ≤ 20 characters, no braces).
- `notify()` writes the body with the placeholder normalised to `{first name|<fallback>}`. **No name is stored in any
  notification row**, so erasure and retention need nothing new.
- The placeholder is filled in by ONE helper, `fillFirstName(text, firstName | null)` in `@effy/shared-types`:
  - inbox reads (`shared/src/notifications/inbox.ts`) fill it with the recipient's first name, else the fallback. The first
    name is the customer's `given_name`, or the first word of `driver.name` or `shop_staff.name` (amended, U1); no name
    means the fallback;
  - the email template fills it with the customer's given name;
  - **the push sender fills it with the fallback, always**: the lock screen shows "Hi there", never a name (FR-023,
    SC-006);
  - analytics and logs never see a filled body (FR-026).
- **Spec amendment**: FR-023 is reworded. The phone notification shows the fallback word in the placeholder's place.
  Refusing the placeholder whenever there is a phone notification would make it unusable, because the lock-screen body is
  the message body.

**Alternatives**:
- Write the filled body per recipient at `notify()`. Rejected: names stored in tens of thousands of rows, and the push
  would need a second body column.

## R9 - Back-office screens

**Decision**:
- **The composer** (112) gains:
  - an **Email** channel tickbox (customer audiences) with an email preview pane (a React rendering of the `message`
    template's layout, which approximates it; the real one comes from the test);
  - **the test (amended, I5)**: 112 tests through `notify()` to a picked customer account, so the switches would hide the
    email. The admin service instead **sends the test email itself**: `@effy/email-kit` `message` template, straight to
    the test account's address, recorded nowhere, with 112's prefix `Test: `. The `admin-messages` stack gains `ses:SendEmail`
    on the platform identity;
  - a **First name** insert button and a fallback field;
  - a **When** section: Send now / Send later / Repeat / When something happens.
- Choosing Repeat or a trigger saves an **automatic message** rather than a message.
- **Messages › Automatic** (`/messages/automatic`): a `DataTable` list with name, kind, when, status, last run, next run.
- **The automatic message page**: summary, runs (`StaticTable`, last 50), pause/resume/end, edit, the activity drawer
  (104), and each run linking to its message's report.
- **Reports** gain an Email section (amended, A1). These add up to the recipient count: sent, failed, held for the night
  (still pending), over the limit (`capped`), and not sent (no address, off, suppressed). **Unsubscribed** is shown beside
  them, outside the sum, since an unsubscriber was also sent.
- **Direct messages from the customer page** (112's "Send message") gain the Email tickbox too (amended, G4).
- **Withdraw** says "Emails already sent stay sent" when the message had email (amended, L1).
- **Tours** (106/107): new AM (Automatic list) and AU (automatic message page), words added to `specs/107` inventory first;
  ME (composer) raises its version for the new steps.
- The customer page's Notifications panel gains the marketing email line (R4).
- **Consent history (amended, G2)**: back-office's consent activity source (`apis/edge-api/orders/src/activity/consent.ts`)
  gains words for `channel = 'email'` ("Said yes to offers by email"), `surface = 'email'` ("from an email") and
  `via = 'email_link' | 'one_click'` ("unsubscribe link", "mail program's unsubscribe button"), so US2 scenario 5 reads
  right.

## R10 - Customer surfaces

**Decision**:
- **Settings**: the app's and website's notification settings show an Email switch under Offers and under News, from the
  policy.
  - Turning one on shows the email consent wording in the existing consent sheet (an `EffySheet` on the app, the inline
    panel on the website) and sends the version.
  - Turning it off needs no wording.
- **Unsubscribe page**: customer-web `/email/unsubscribe` (guest route, first-load rule: no radix, vaul or sonner). It
  posts the unsubscribe **after it loads in the browser** (R3), showing its own skeleton meanwhile (the 2026-10-29
  loading rule; `skeletons.guard`). It then shows "You won't get offers and news by email any more" and an Undo button,
  or "That link didn't work". It needs no sign-in and offers a link to settings for the signed-in.
- **The newsletter (039)** stays a separate double opt-in list, not tied to an account. Unsubscribing from a message email
  does not touch it (amended, G3).
- The customer app has no unsubscribe screen; email links open the website (until 116).

## R11 - Metrics, telemetry, alarms

- **Metrics**:
  - `MessageEmails{outcome}` from the drain;
  - `EmailUnsubscribes{source: link | one_click}`;
  - `AutomationRuns{mode, outcome}`;
  - `AutomationRecipients`.
- **Product events**:
  - customer-web: `email_unsubscribed`, `email_unsubscribe_undone`, `marketing_email_toggled{category, on}`;
  - customer app: `MarketingEmailToggled`.
- **No new alarm**: the `messages` worker's existing failure alarm covers automation runs, and the drain's covers emails.

## R12 - Proving it

**Container tests**:
- **The consent and channel matrix** (SC-003): every combination of category yes/no × email on/off × suppressed → row or
  `skipped`.
- **Unsubscribe**: by token, idempotent, undo, a wrong token changes nothing, `message_id` counted.
- **Triggers**:
  - once per occurrence over 7 simulated days (SC-004);
  - the reset after a new order and after the cart empties;
  - the no-backlog rule.
- **Repeats**:
  - every due time over a simulated 4 weeks, with no gap or double (SC-005);
  - waiting while the previous send is sending;
  - pause/resume not catching up.

**Unit tests**:
- `fillFirstName`: a name, none, the fallback, push always the fallback (SC-006);
- the next-run calculator across a daylight-saving change in `OPERATING_TZ`.

**Guards**:
- the email template has an unsubscribe for marketing kinds;
- the title placeholder is refused;
- `notifications.guard` (one writer) stays green.

**Report adds up** (SC-007): extended 112 report test with email.
