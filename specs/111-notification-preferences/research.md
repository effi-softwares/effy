# Research: Notification Preferences & Marketing Consent (111)

Each decision lists what was chosen, why, and what else was considered. Code references are to the tree on 2026-11-08.

## R1 - Where the rules run: inside `notify()`, at write time

**Decision**: `notify()` (the one writer since 109) applies every rule when it writes:
- the marketing consent check, which decides whether a notification row is written at all;
- the channel choices, which mark a delivery `skipped`;
- quiet hours, which set the delivery's `not_before`;
- the limits, which mark a delivery `capped`.

The drain re-checks consent and the push choice when it claims a held delivery (R4). Spec 4's fan-out also calls
`notify()` (backlog E3), so there is exactly one place where the rules live.

**Rationale**:
- 109 made `notify()` the only writer of `notification` and `notification_delivery`.
- Deciding at write time means the inbox, the push and the email all agree.
- The outcome is visible in the delivery row (`skipped` / `capped` / `not_before`), which is what spec 4's report counts
  (backlog E6).
- It is set-based SQL in the same CTE, so a 20,000-recipient page costs one statement, not 20,000 lookups.

**Alternatives**:
- *Filter in the drain only.* The inbox item would still be written for a customer with no consent (FR-011 forbids
  that), and the report could not tell "skipped" from "pending".
- *A rules service each sender calls first.* That is a second place to forget.

## R2 - Category policy declared once, in `@effy/shared-types`

**Decision**: a new module, `notification-categories.ts`, declares per audience × category:
- `required`, `marketing` and `importance`;
- `defaults: { push, email }`;
- `channels`, the channels a customer may change;
- `androidChannel`, `label`, and `reason` (the sentence shown when it is required).

The Kotlin twins (customer and driver apps) are pinned to `notification-categories.fixtures.json`. The edge library reads
the policy for the entry's category and passes it into `notify()`'s SQL as parameters. The database holds only the
person's choices and consent, never the policy.

**Rationale**:
- One fact, one source.
- The DB CHECK on `notification.category` already allows all ten categories (109).
- Keeping defaults out of SQL means a default change is a code deploy, not a migration.
- Absent choice rows mean "the default", so changing a default reaches everyone who never touched it.

**Alternatives**:
- *A `notification_category` table seeded by migration.* A second copy of the policy, needing a parity test, and a
  migration for every default change.

**Mapping check**: `notification-categories.test.ts` fails when:
- a catalogue type's category is not declared for its audience;
- an audience's declared categories differ from the spec's list (FR-001);
- a required category declares a changeable channel.

## R3 - Storage: current choices plus an append-only consent history

**Decision**: two new tables.

`customer_notification_choice`:
- primary key `(customer_id, category, channel)`, plus `enabled`, `changed_at` and `source`;
- one row only when the customer has changed something away from the default (FR-008);
- keyed by `customer_id` with `ON DELETE CASCADE`.

`customer_marketing_consent`:
- an append-only history: `id`, `customer_id`, `category` (offers | news), `granted`, `source`, `wording_version`,
  `created_at`;
- the current answer per category is the latest row (FR-010).

A SQL view, `public.marketing_consent_current`, uses `DISTINCT ON (customer_id, category)`. It is the one reader the
rules use. One writer module, `@effy/edge-shared/notifications` `preferences.ts`, writes both tables; a guard fails an
`INSERT`/`UPDATE`/`DELETE` on either table anywhere else.

**Why `customer_id`, not the sub**: the customer row is the account. Closure erasure (below) and staff reads join by id.
`notify()` already receives subs; it joins `public.customer` on `cognito_sub`, the index the customer service uses.

**Erasure**: 109's daily purge already deletes the notifications of a customer whose closure has passed `erase_after`. It
gains the same step for both new tables, so nothing about a closed account's choices survives erasure.

**Alternatives**:
- *Choices in a jsonb column on `customer`.* No per-category default semantics and no clean guard.
- *Full history of channel switches.* Not asked for; consent history is the legal record (spec FR-008, revised).

## R4 - Quiet hours: `not_before` on the delivery; the drain skips held rows

**Decision**: add `notification_delivery.not_before timestamptz` (NULL = now).
- `notify()` sets it for a **push** delivery of a marketing category when the Effy-clock time is in [21:00, 08:00). The
  value is the next 08:00 on Effy's clock.
- The drain's claim adds `AND (d.not_before IS NULL OR d.not_before <= now())`.
- The existing expiry check marks a held delivery `expired` when the notification's `expires_at` has passed (FR-018).
- The inbox item is written at once, as always.

**Re-check on release (FR-011)**: when the claim returns a delivery whose notification is marketing, it also returns
`allowed`, computed by the same SQL fragment `notify()` uses: consent is still yes and the push choice is still on. When
`allowed` is false, the drain records `skipped`.

**`pendingStats`** (the drain's age alarm) excludes `not_before > now()`. A promotion held overnight would otherwise page
the operator at 22:15.

**Effy clock**: computed in SQL with `OPERATING_TZ`, passed as a parameter (the operating-zone rule; no literal zone).

**Index**: the existing partial index `notification_delivery_pending_idx (priority, created_at) WHERE status = 'pending'`
still serves the claim. Held rows are few (marketing pushes only) and are filtered on the index scan.

**Alternatives**:
- *A separate scheduled release job.* Unnecessary; the drain already runs every minute.
- *Write the notification at 08:00.* The inbox would lag (the spec says it appears at once), and consent at send time
  would need the notification re-built later.

## R5 - Limits: counted in the same statement, serialised per send

**Decision**: a singleton `public.notification_settings` row holds `promo_push_per_day` (default 1) and
`promo_push_per_week` (default 3). Its CHECKs are `>= 0` and `week >= day`. It follows `points_settings`, with an
append-only `notification_settings_change` for the activity log.

For a marketing push, `notify()` counts the recipient's existing **push** deliveries of marketing categories, with status
in `pending | sent | no_device | muted` (a send that was attempted or is waiting):
- since today's 00:00 on Effy's clock (for the daily limit);
- in the last 7 × 24 h (for the weekly limit).

Over either limit → the delivery is written `capped` (FR-019).

**Concurrency**: a marketing `notify()` takes `pg_advisory_xact_lock(hashtext('notification:promo-limits'))` first.
Marketing sends are bulk and rare (spec 4 runs campaigns one page at a time), so serialising them costs nothing, and two
campaigns can never both pass a customer's limit (SC-006). System notifications never take the lock.

**Alternatives**:
- *A per-customer counter table.* A second fact to keep in step with the deliveries.
- *Count in the drain at send time.* Then the inbox and the report disagree about what was capped until the drain runs.

## R6 - The decision fragment (one definition used twice)

`preferences.ts` exports `channelAllowedSql(policy)`, which returns a SQL boolean expression over
`(customer_id, category, channel)`. In order (FR-017):
1. required → true;
2. marketing → `marketing_consent_current.granted` must be true, else the whole notification is not written (R1);
3. a choice row exists → `enabled`;
4. else → the policy default for that channel.

`notify()` uses it to drop recipients (marketing without consent) and to mark deliveries `skipped`. The drain's claim uses
it to re-judge held marketing pushes. Driver and shop categories are all required, so they skip the join entirely. The
policy says so, and the SQL is not emitted.

## R7 - Delivery statuses

`notification_delivery_status_check` gains:
- `skipped`: the person's choice, or consent withdrawn before a held push went out;
- `capped`: over the promotion limits.

Both are final, like `muted` (059's per-device mute). Held is not a status: it is `pending` with `not_before` in the
future, so nothing else in the drain changes.

## R8 - Routes and gateways

**Shared gateway, `customer` service** (185 → 187 of 300):
- `GET /customer/v1/notification-preferences` returns choices with defaults applied, the consent state per marketing
  category, `askForOffers`, and the current wording version.
- `PATCH /customer/v1/notification-preferences` takes `{ changes?: [{category, channel, enabled}], consent?: {offers?:
  bool, news?: bool}, source, wordingVersion? }`. One transaction, all or nothing:
  - it refuses a required category, an unknown category or channel, or a channel not changeable for that category;
  - consent needs `wordingVersion` equal to the current one (409 `consent_wording_changed` otherwise, so the client
    re-reads and shows the new words).

`askForOffers` = the customer has no consent rows **and** has at least one paid order. A customer whose first order came
before this ships is therefore asked on their next confirmation (spec Assumptions).

**Staff gateway, `orders` service** (213 → 218 of 300, under the 225 alarm). That service already serves back-office
customers and points settings:
- `GET /orders/v1/customers/{customerId}/notification-preferences`: current choices (read-only).
- `GET /orders/v1/customers/{customerId}/consent/activity`: consent history through `activityResponse` (104), opened in
  the `ActivityLogDrawer` from the customer page's More menu.
- `GET /orders/v1/notifications/settings`, `PUT /orders/v1/notifications/settings` (admin and manager), and
  `GET /orders/v1/notifications/settings/activity`.

**Driver and shop**: no route. Their categories are fixed and read from shared-types (FR-025).

**Alternatives**:
- *Put settings in `admin`.* Customers and points settings already live in `orders`; the back-office customer page
  already calls it.
- *Separate consent route.* One PATCH keeps a "turn Offers on" a single transaction (choice + consent row).

## R9 - Consent wording and the privacy policy (drafts for operator approval)

**Decision**: the wording lives in `@effy/legal-content` as `src/consent/marketing.json`, versioned. `build.mjs` emits it
into the generated TS (web, edge) and Kotlin (`LegalContent.kt`) beside the documents, so the ask, the settings line and
the server's current version are one source (FR-016).

The privacy policy gets `v2.md` (status current; v1 becomes superseded), extending the Marketing section.

**Draft wording, version `marketing-2026-11`** (awaiting approval; nothing ships until the operator approves it):

- Ask heading: **"Hear about offers from Effy?"**
- Ask body: "We'll send you the occasional offer and news about new products, as notifications in the app and in your
  inbox. Order updates come either way. You can stop at any time in Notifications settings."
- Buttons: **"Yes, tell me"** · **"Not now"**
- Settings, Offers: "Deals and discounts from Effy."
- Settings, News: "New products and seasonal picks from Effy."
- Settings footnote under Offers and News: "Effy sends these only if you've said yes. Turning one on means you agree to
  hear from us about it."
- Fixed category reasons:
  - Important: "Things you need to know, like a change to your delivery. These can't be turned off."
  - Support: "Replies from our team about your account or orders. These can't be turned off."
  - Driver Work: "Work messages can't be turned off - they're part of your job."
  - Driver Announcements: "Messages from Effy to every driver. These can't be turned off."
  - Shop: "These reach everyone at your shop, so nobody misses an order. Choose which ones buzz this device below."

**Privacy policy v2, Marketing section (draft)**:
> We send marketing - offers and news about new products - only if you have said yes in the Effy app or website, and we
> keep a record of when and how you agreed. Marketing may reach you as an app notification, in your Effy inbox and, if we
> start sending it, by email. You can stop it at any time in Notifications settings, or with "Stop offers like this" on
> any offer, without affecting the service messages you need, such as order updates, points, important notices about
> your delivery and replies from our support team. Turning on notifications on your phone is not, by itself, agreement to
> marketing. This is consistent with APP 7 and the *Spam Act 2003* (Cth).

**Version rule**: a wording change is a new `version`. Stored answers keep theirs. A client holding an old version gets
409 and re-reads.

## R10 - Where the ask appears

- **Customer app**: `ReceiptScreen` (the order-placed screen) shows an `EffySheet` once `askForOffers` is true. The
  customer app's rule is no centred dialogs. Closing the sheet = "Not now" (FR-013). After "Yes", if the phone has not yet
  decided on notifications, the existing permission request runs. The answer is recorded first (FR-014).
- **Customer website**: `app/checkout/complete` shows an inline panel (not a modal), so it costs guest routes nothing
  against the first-load rule. It is a client island posting through a Server Action that proxies the PATCH.
- **Asked once across surfaces**: `askForOffers` is computed on the server from the consent history, so an answer on one
  surface stops the other.

## R11 - Settings screens

- **Customer app**: a new `NotificationSettingsScreen` (`features/notifications/settings/…`, MVVM), reached from Account →
  "Notification settings" (a row in the settings group) and from a settings icon in the inbox top bar.
  - It has `EffySwitch` rows grouped by category, fixed rows with the reason, and the Offers and News rows with their
    footnote.
  - When the OS permission is off (an expect/actual `rememberTurnOnNotifications`, ported from the driver app), a notice
    at the top has an "Open settings" button.
  - It uses optimistic updates and rolls back on refusal.
- **Customer website**: `/account/notifications/settings`, linked from the inbox page header and the account menu. A
  server-rendered form with client switches, the same words.
- **Driver app**: Account's existing "Notifications" row gains a fixed list of the three categories with reasons (FR-025).
- **Shop console**: Settings → Notifications gains a "What you're told about" section listing the five categories as
  fixed. The 059 per-device switches stay. The page's guided tour gets one new step and its `version` is raised (106 rule;
  the words go in the spec's tour section, R14).
- **Back-office**:
  - the customer page shows a "Notifications" detail section (current choices) and "Consent activity" in its More menu
    (the 104 drawer);
  - Settings gets a "Notifications" link (under Business) to `/settings/notifications` (two numbers, the activity drawer,
    the 107 tour rule).

## R12 - Android channels

- **Server**: `toFcmMessage` sets `android.notification.channel_id` from the category's `androidChannel`.
- **Customer app**: creates the channels `orders` (HIGH), `points` (DEFAULT), `offers_news` (DEFAULT) and `important`
  (HIGH; Support is filed here). Channel names come from the shared labels.
- **Driver app**: creates `work` (HIGH), `announcements` (DEFAULT) and `important` (HIGH).
- Each app's `default_notification_channel_id` meta-data points at `orders` / `work`.
- **Old channels**: no installed builds exist (cleanup rule), so the old default channel is simply deleted on start.

## R13 - Promotion words must name Effy (FR-022)

For a marketing category, `notify()` refuses (throws, before writing) a title + body that does not contain "Effy",
case-insensitive. No marketing type exists yet: spec 4 adds them. The check is unit-tested with a fake marketing entry
through the policy, and the catalogue test fails a future marketing catalogue entry whose general words lack "Effy".

## R14 - Tours and telemetry

**Tours** (106/107 rule):
- the shop console Notifications settings tour gains a step for the new section;
- the new back-office `/settings/notifications` page gets a 2-step tour.

The words are in spec.md's "Guided tours" section, added by this plan, and are held by each console's `tours.test.ts`.

**Telemetry (FR-028)**, with no personal data:
- `offers_ask_shown`, `offers_ask_answered {answer, surface}`;
- `notification_setting_changed {category, channel, enabled, surface}`;
- `offers_stopped_from_inbox {category}`.

They are added to `docs/telemetry/platform-events.md` and each client's typed taxonomy.

## R15 - "Stop offers like this" (FR-024)

A tap on an offers or news inbox item always opens the detail first: an `EffySheet` in the app, the existing dialog on the
website. The detail has the words, a "See offer" button when there is a destination, and "Stop offers like this". The
stop is a PATCH with consent `{offers: false}`, source `inbox`, and an undo toast that re-grants with source `inbox`.

## R16 - What is unchanged

- 059's per-device `muted_types` (shop console) stays as it is, applied by the drain as `muted`.
- The website newsletter is unchanged (spec edge case).
- The order receipt (052) is unchanged (not a notification).
- iOS interruption levels are deferred.
