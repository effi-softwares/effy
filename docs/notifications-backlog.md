# Effy Notifications - Backlog

> **Status (2026-11-12): every item is built or closed.** Specs 109–116 built it (116 last: B7, C6, D7); F8, C8 and C9 were
> closed (decision 7). The iPhone halves of B7 and D7 are built and switched off until the paid Apple account - the
> steps are in `docs/observability-apple-blockers.md`, "After paying". 113–116 are not all deployed or walked yet; see
> FEATURE-HISTORY.md.

Written 2026-11-07, after mobile push was finished (050 follow-up). This backlog covers three things:
- staff in back-office sending their own messages (promotions, announcements, important notices,
  messages to one person or to a group);
- an inbox for customers, drivers and shops;
- a notification that opens the right screen in the app, not just the app.

The backlog is meant to be cut into specs (proposed order at the end). Specs carry no technology; the
"where" column here is for planning only.

**Priority:** P0 = the feature does not work without it · P1 = needed before real users rely on it ·
P2 = expected by users, can follow · P3 = later.
**Size:** S ≤ ½ day · M ≈ 1–2 days · L ≈ 3+ days.
**Where:** `DB` migration · `BE` `apis/edge-api/<service>` · `CUST-APP` `apps/customer-mobile` ·
`DRV-APP` `apps/driver-mobile` · `CW` `apps/customer-web` · `SW` `apps/shop-web` · `BO` `apps/back-office` ·
`PKG` a shared package (`@effy/shared-types`, `@effy/web-kit`, …).

---

## 1. What exists today

### Backend
| Piece | Where | What it does |
|---|---|---|
| Outbox | `public.notification_request` | One row per recipient, **per channel** (`push` / `email`). The status is pending → sent / skipped / failed. Payload: `entityId` + `deepLink` only. Unique `dedupe_key`. **No retention**: rows are never removed. |
| Types | `notifications/src/worker/copy.ts` + a DB `CHECK` list + `shared/src/lib/notification-types.ts` (shop labels) | **23 fixed types.** Each type's words are fixed in code. No type can carry words written by staff. |
| Drain | `notifications` worker, `rate(1 minute)`, batch 100 | Claims pending rows, finds the person's device tokens, sends one at a time through FCM HTTP v1, and prunes dead tokens. With the most it claims per minute (100), sending to all customers would take hours. |
| Tokens | `public.device_token` | Per device: audience, platform, `fcm_token`, `last_seen_at`. Shop web rows also have `muted_types` (059, **per device**). |
| Producers | `finalize.ts`, `order-completion.ts`, `points/ledger.ts`, `consignment.ts`, `override.ts`, `shop fulfillments`, `shop attention`, `catalog review`, `fleet driver-push.ts` | Each writes rows in the same transaction as its change. Every one of them is **about one person and one thing that happened**. |
| Live channel | `@effy/edge-shared/live`, `LIVE_KINDS` | Tells every app "something of this kind changed". There is no notifications kind. |

### Messages sent today
- **Customer** (push, some also email): `order_paid`, `order_ready`, `order_delivered`, `order_with_courier`, `order_delivery_changed`, `points_credited`. `points_expiring` goes by email only.
  - `order_out_for_delivery` has its words written, but **nothing sends it**.
- **Driver** (push): `run_assigned`, `run_opens_soon`, `run_changed`, `run_withdrawn`.
- **Shop** (web push): `shop_new_order`, 4 attention types and 6 product review/handling types.

### Clients
| Client | Push | Tap → screen | Inbox | Preferences |
|---|---|---|---|---|
| Customer app | ✅ Android · iOS waits for Apple account | Only `effy://order[/id]` and `effy://points` (`pushDestination`). Signed out → the tap is dropped. | ❌ The screen is an empty state ("You're all caught up"), reached from the Home bell and Account | Opens the phone's settings only |
| Driver app | ✅ Android · iOS waits | `run_*` → that run, if Today still has it; otherwise Today | ❌ | "Notifications are off" row only |
| Shop web | ✅ web push (service worker) | `webPath` → console route | ❌ (push and sound only) | ✅ Per device: on/off, sound, and each type muted separately |
| Customer web | ❌ | - | ❌ | ❌ |
| Back-office | ❌ (it only sends) | - | - | - |

### Things that are wrong or stale now
- `order_ready` tells customers "ready for **handoff**", which is internal wording (`next-implementation-candidates.md` #6).
- `order_out_for_delivery` is dead: it has words but nothing ever sends it.
- `next-implementation-candidates.md` #4 (a "fixture-backed" inbox) and #8 (no iOS bridge) are out of date.
- There is **no marketing consent** anywhere: no column, no screen, no wording. A promotional push
  cannot be sent lawfully until there is one (§2.5).

---

## 2. What good notification systems do (research)

Sources are listed at the end. Summary:

1. **An inbox item is separate from its delivery.** Knock, Novu, Courier and SuprSend all keep one
   durable *message* per recipient. Push, email and the inbox are **channels** of that message, each with
   its own outcome. Effy's `notification_request` mixes the two: it is a delivery row with no lasting
   record behind it.
2. **Three states: seen, read and archived.**
   - *Seen*: the inbox was opened with the item on screen. This drives the badge, which clears as soon
     as the bell is opened.
   - *Read*: the person opened or acted on the item. This drives the unread dot.
   - *Archived*: removed from the main list, but still retrievable.
   Marking an item read also marks it seen. Novu adds **snooze**; Courier adds **pinned** items (shown on
   top) and **actions** (buttons on the item).
3. **Inbox features people expect:** a bell with a count; a list grouped by day; All / Unread tabs or
   category filters; mark all read; swipe or hover to archive; a detail view for long announcements; an
   image; one main button; expiry for time-limited offers; live updates (no refresh needed); state kept
   in step across devices.
4. **Preferences are by category × channel**, with three kinds of category:
   - *required*: cannot be turned off (security, the order you placed);
   - *on unless turned off*;
   - *off unless turned on* (marketing).
   A global "no push" is separate from turning off one category. Operator suppression overrides everything.
5. **Marketing needs its own explicit opt-in.**
   - Apple's App Review Guideline **4.5.4**: no promotional push unless the user opted in through
     consent wording in the app, with an in-app opt-out. Allowing the phone's notifications is **not**
     consent.
   - Australian lawyers (Allens, Ashurst) say the ACMA has treated push notifications as electronic
     messages (under the Interactive Gambling Act) and is likely to do the same under the **Spam Act**.
     That law requires consent, identifying the sender, and a way to unsubscribe.
6. **Android channels per category** (Order updates / Offers / Important). An app can't change a
   channel's importance after creating it, and the user controls each channel. Promotions use DEFAULT
   importance, never HIGH. With too few channels, users block everything.
7. **iOS interruption levels.**
   - *time-sensitive*: breaks through Focus. Needs a capability, which needs the paid account. Use it
     only for things that matter right now.
   - *critical*: needs Apple's approval. Not for us.
   - *passive*: for promotions.
8. **Campaign safeguards:**
   - quiet hours in local time (for example 10pm–7am) for anything that isn't urgent;
   - a frequency cap (for example at most 1 promotion a day and 3 a week);
   - preferences and consent checked **at send time**, not when the campaign is written;
   - an audience count before sending, a test send to yourself, scheduling, cancelling.
9. **Taps that open a screen:** treat the link as an intent and route it through **one router**. The
   router checks sign-in, account, version and whether the item still exists:
   - it holds the link through a cold start or sign-in;
   - it falls back to something useful when the item is gone;
   - it counts an "open" only when the screen actually showed.
10. **Sending to many people at once.** FCM topics send to everyone in one call. They can't respect each
    person's consent on the server and leave no per-person inbox record. Sending per person, with up to
    500 tokens per call (`sendEach`), is the standard way when there's an inbox.

---

## 3. How it maps to Effy (the shape this backlog builds)

```
 back-office "Messages"             system events (order paid, run assigned, …)
        │  campaign + targeting               │  (unchanged producers)
        ▼                                     ▼
   fan-out worker ──────────────►  public.notification  (ONE per recipient: the inbox item)
   (expands the audience,           category, importance, title/body, image, destination,
    applies consent, quiet hours,   seen/read/archived/pinned, expires_at, campaign_id
    frequency cap at send time)             │
                                            ▼
                                  public.notification_delivery (per channel: push, email)
                                            │   = today's notification_request, re-pointed
                                            ▼
                                  drain → FCM (sendEach ≤500) / SES
                                            │
                    ┌───────────────────────┼─────────────────────────┐
                 customer app + web     driver app               shop-web
                 inbox · bell · router  inbox · bell · router    inbox drawer · bell · router
```

**Decisions this backlog assumes** (each has its own item so it can be changed):
- **One inbox item per person and message**, written for system events *and* campaigns. Push and email
  are deliveries of it.
- **One destination vocabulary** (`{kind, id?}`) in `@effy/shared-types` with a Kotlin twin, pinned to
  fixtures in the same way as `effy-windows`, `delivery-type` and `promotion-skins`. It replaces the
  `deepLink` / `webPath` strings. There are no installed builds yet, so they can simply be removed (no
  compatibility fields, as the cleanup rule says). Customer kinds reuse 108's banner link kinds
  (`search`, `sale`, `category`, `product`).
- **Categories, not types, are what people control.** System types each map to exactly one category.
- **Customers: marketing is off until opted in.** Order updates and important notices always reach the
  inbox. Push for them can be turned off, but they still land in the inbox.
- **Drivers and shops are staff.** Their work and important categories are required. Promotions don't
  apply to them.
- **Shop web keeps 059's per-device choices for push** (a counter tablet versus a manager's phone was a
  deliberate decision). The inbox is per person.
- **Sending to many people stays within the constitution:** a scheduled Lambda that fans out in batches,
  and the drain loops until its time budget is used. No queue service or always-on compute is needed at
  today's scale. Add SQS only if the volume ever requires it.
- **Quiet hours use the operating time zone** (`OPERATING_TZ`). Effy has one zone per environment, so
  there is no per-person time zone.

---

## Epic A - The notification record (foundation) · P0

> **In spec 109** (`specs/109-notification-record/`, built 2026-11-07): A1–A6 and A8. A7 (live `inbox` kind) moved to
> spec 2 with the inbox it serves; A9 stays later. A1 leaves out `image_key`, `pinned_until` and `campaign_id` until a
> spec needs them.

| ID | Pri | Where | Size | Item | Done when |
|---|---|---|---|---|---|
| A1 | P0 | DB | M | **`public.notification`, the inbox item.** Columns: `recipient_sub`, `audience`, `category`, `type`, `importance` (`normal` / `important`), `title`, `body`, `image_key`, `destination jsonb`, `seen_at`, `read_at`, `archived_at`, `pinned_until`, `expires_at`, `source` (`system` / `campaign` / `direct`), `campaign_id`, `dedupe_key`, `created_at`. Index on (recipient, audience, created_at desc) where not archived. | Every system notification produces one row; a duplicate event produces none. |
| A2 | P0 | DB, BE | M | **Turn `notification_request` into `notification_delivery`** (FK to `notification`, `channel`, status, attempts, error). The drain reads its words from the parent row. Writers must not save a delivery without its item. | The existing 23 types still push and email exactly as before; `copy.test.ts` and `drain.test.ts` pass. |
| A3 | P0 | BE (shared) | M | **One writer**: `@effy/edge-shared/notifications` `notify(tx, {recipient, audience, type, entityId, channels})`. Move the 9 producers to it. Add a guard test that fails any `INSERT INTO public.notification(_delivery)` anywhere else, in the same style as `consignment.guard`. | Producers call one function; the guard is proven by breaking it. |
| A4 | P0 | BE | S | **Store the words at write time.** System items are written from `copy.ts` when created, so the inbox shows what the push said even if `copy.ts` changes later. | Editing `copy.ts` doesn't rewrite old inbox items. |
| A5 | P1 | BE, DB | S | **Retention.** Purge inbox items older than N days (proposal: customers 180, drivers and shops 90), plus deliveries older than 30 days. Run it as part of an existing schedule. | The tables stay bounded; a container test covers the cut-off. |
| A6 | P1 | BE | S | **Customer account deletion removes their inbox items and device tokens** (the delete-account flow). | Nothing is left for a deleted `sub`. |
| A7 | (110, done) P1 | PKG, BE | S | **Live kind `inbox`** added to `LIVE_KINDS` (and its Kotlin twin), announced to the recipient's own channel after `notify` commits. | A new item updates the badge in an open app with no timer (`check-no-refresh-timers.sh` stays green). |
| A8 | P1 | BE (notifications) | M | **Throughput.** The FCM sender uses `sendEach` (≤500 per call). The drain keeps claiming until about 50s of its 60s budget is used. Raise the batch size. Emit a metric for the backlog. | 20,000 pending pushes clear in under 10 minutes in a load test. |
| A9 | P2 | BE | S | **(113, done)** **Prune old tokens.** Drop `device_token` rows not seen for 270 days, matching FCM's own expiry. Refresh `last_seen_at` on every app start (customer and driver already re-register). | No pushes are sent to long-dead tokens. |

## Epic B - One destination vocabulary and router (tap → the right screen) · P0

> **In spec 109**: B1–B6. B7 (universal links) stays later.

| ID | Pri | Where | Size | Item | Done when |
|---|---|---|---|---|---|
| B1 | P0 | PKG | M | **`Destination` in `@effy/shared-types`**: a closed union per audience.<br>• **Customer:** `order{id}`, `orders`, `points`, `product{id}`, `category{id}`, `search{q}`, `sale`, `notification{id}` (open the item itself), `help{slug}`, `url{https}` (Effy's own domains only).<br>• **Driver:** `today`, `run{id}`, `account`, `notification{id}`.<br>• **Shop:** `queue{fulfilmentId?}`, `order{id}`, `product{id}`, `catalog`, `insights`, `settings{section}`, `notification{id}`.<br>Pinned by `destinations.fixtures.json` with Kotlin twins and a test. | One list; TS and Kotlin agree; an unknown kind is ignored, never a crash. |
| B2 | P0 | BE | S | **Push data carries `notificationId` + `destination`** (JSON string), replacing `deepLink` / `webPath`. `copy.ts` gives each system type a destination builder. | Each of the 23 types has a destination; a test fails any type without one. |
| B3 | P0 | CUST-APP | M | **The customer router** replaces `pushDestination`. It handles every customer kind.<br>• **Held through sign-in:** a tap while signed out is kept, then followed once signed in. Today the tap is dropped.<br>• **Held through a cold start:** followed once the shell is ready.<br>• **Gone →** the nearest parent screen plus a sheet saying what happened (order not found → Orders; product off sale → its aisle).<br>The inbox, the push and future banners all use it. | Host tests cover every kind, signed out, cold start and a missing item; tapping each customer push opens its screen. |
| B4 | P0 | DRV-APP | S | **The driver router.** Generalise DriverShell's `run_*` handling to the closed list, keep its "Today if not yours" fallback, and add `notification{id}`. | Each driver kind is tested. |
| B5 | P1 | SW | S | **The shop router.** The service worker and `useNotificationNavigation` map a destination to a console route through one function in `@effy/web-kit`. | Every shop type opens the same route as today. |
| B6 | P1 | CUST-APP, DRV-APP, SW | S | **A tap marks the item read and seen** (`POST …/notifications/{id}/read`). Analytics records `NotificationOpened{type, category, campaignId?}` **after** the screen shows. | Opening a push clears its unread dot everywhere. |
| B7 | (116, done; iPhone switched on after paying) P3 | CUST-APP, CW | L | **Universal / App Links** (`https://effyshopping.com/...` opens the app). Not needed for push, but useful for email and SMS. Needs the paid Apple account. | A link in an email opens the app screen. |

## Epic C - Inboxes · P0/P1

> **In spec 110** (`specs/110-notification-inboxes/`, built 2026-11-08): C1–C7, plus A7, F2, F6, F7 and F9. C1 became five
> routes per audience (archive and undo are one `PATCH`); C5 needed no list-screens exception (the feed draws no table);
> C6's iOS badge waits on the paid Apple account.

Shared rules: the loading state draws the inbox's own shape (CLAUDE.md skeleton rule), there are no
centred dialogs on the customer app (`EffySheet`), and nothing refreshes on a timer.

| ID | Pri | Where | Size | Item | Done when |
|---|---|---|---|---|---|
| C1 | P0 | BE (customer, driver, shop) | M | **Inbox routes per audience** on the shared gateway. `GET /{aud}/v1/notifications?cursor&filter=all/unread&category`, `GET …/unseen-count`, `POST …/seen` (everything up to now), `POST …/{id}/read`, `POST …/read-all`, `POST …/{id}/archive`, `DELETE …/{id}/archive` (undo). Cursor paging; expired items are left out. That's 3 × about 7 routes; check `make gateway-usage` first. | Container tests per audience; a token from one pool is refused by another. |
| C2 | P0 | CUST-APP | L | **Customer inbox** replaces the empty `NotificationsScreen`.<br>• Home bell with the unseen count.<br>• List grouped Today / Yesterday / Earlier, with an icon per category, an unread dot and an optional thumbnail.<br>• Pinned important items on top.<br>• All / Unread, plus category chips (Orders, Offers, News).<br>• Swipe to archive, with undo. Mark all read.<br>• Tap → B3 router.<br>• No destination → a detail screen (image, full text, one button).<br>• Empty state stays. Live via A7. | Matches its design (`docs/reference-screens` to be drawn); host tests for the ViewModel. |
| C3 | P1 | CW | L | **Customer web inbox.** A header bell with the count, and `/account/notifications` (same list, filters, archive, detail). Uses the session cookie through the storefront's server; the live channel refreshes the count. | Parity with C2, except swipe. |
| C4 | P0 | DRV-APP | M | **Driver inbox.** A bell on Today with the count (or an Account row; design decides). List, unread, pinned important, tap → B4, mark all read. No category chips: drivers have 3 categories at most. | A driver sees "Run assigned" and an announcement from back-office in the list. |
| C5 | P1 | SW | L | **Shop inbox.** A bell in the console header opens a right Drawer (shadcn, floating, per the overlay rule), plus a `/notifications` page. Filters: category, unread. Mark all read; archive. Tap → B5. Needs a guided tour (106 rule) and a named exception in `list-screens.guard` (an inbox is a feed, not a DataTable). | The tour passes `tours.guard`; Drawer and page both work. |
| C6 | (116, done) P2 | CUST-APP, DRV-APP | S | **The app icon badge equals the unseen count** (iOS `badge` in the APNs payload; Android launcher dot via the channel). Cleared on `seen`. | The icon shows 3 after 3 new items and 0 after the inbox is opened. |
| C7 | P2 | all inboxes | S | **Expiry and pinning shown properly.** An offer shows "Ends Sun"; an expired item disappears; an important item stays pinned until it's read or `pinned_until` passes. | Tested with a clock. |
| C8 | Closed: not needed (decision 7) | BO | M | **Back-office staff inbox** (system alerts: a campaign finished, a send failed). Deferred: E9 is dropped, so nothing needs it yet. | - |
| C9 | Closed: not needed (decision 7) | all | M | **Snooze** (Novu-style). Only if shops ask for it. | - |

## Epic D - Categories, preferences and consent · P0 for promotions

In spec 111 ([specs/111-notification-preferences](../specs/111-notification-preferences/spec.md)); D7 (iOS levels) waits for the paid Apple account.

| ID | Pri | Where | Size | Item | Done when |
|---|---|---|---|---|---|
| D1 | (111, done) P0 | PKG, BE | S | **Categories per audience**, one list in `@effy/shared-types` with a Kotlin twin. Each category has a default, a `required` flag and an importance.<br>• **Customer:** `orders` (required in the inbox; push on), `points` (on), `offers` (**off until opted in**), `news` (on; product news that is not a sale, so it still counts as marketing → see D3), `important` (required: outages, changes to their delivery), `support` (required: a direct message about their account or order).<br>• **Driver:** `work`, `announcements`, `important` (all required).<br>• **Shop:** `orders`, `stock`, `products`, `announcements`, `important` (the first three hold today's 11 types). | Every type maps to exactly one category (test). |
| D2 | (111, done) P0 | DB, BE (customer) | M | **Customer preferences**: `customer_notification_preference (customer_id, category, channel, enabled, changed_at, source)`. `GET/PATCH /customer/v1/notification-preferences`. Required categories refuse being turned off. Checked by `notify` and fan-out at **send time**. | Turning Offers push off stops the next promotion push; it still lands in the inbox only if the inbox for Offers is on. |
| D3 | (111, done) P0 | DB, BE, CUST-APP, CW | M | **Marketing consent record**: when, where (app / web / checkout), and which wording version, for `offers` and `news`. Opt-in only through Effy's own wording (Apple 4.5.4); never assumed from the OS permission. Each opt-out is logged too. | No promotional push, email or inbox item reaches a customer without a consent row (test plus guard). |
| D4 | (111, done) P0 | CUST-APP, CW | M | **Customer "Notifications" settings**: a switch per category × channel (push, email, and inbox where it isn't required), with plain wording and a link to the phone's settings if the OS permission is off. A one-time opt-in sheet for offers after the first order (not at first launch). | A shopper can see and change every choice; required categories show as fixed with a reason. |
| D5 | (111, done) P0 | 045 (legal) | S | **Consent wording and privacy policy lines** for promotional push and email (authored prose, spec 045). The sender is identified in every promotion ("Effy"); unsubscribe is one tap from the inbox item (D4 link). | Legal text published; the opt-in sheet uses it word for word. |
| D6 | (111, done) P1 | CUST-APP, DRV-APP | S | **Android channels per category**:<br>• customer: Order updates (HIGH), Offers & news (DEFAULT), Important (HIGH);<br>• driver: Work (HIGH), Announcements (DEFAULT), Important (HIGH).<br>The server sets `android.notification.channel_id` from the category. | Settings → Apps → Effy lists the channels; muting Offers there doesn't mute orders. |
| D7 | (116, built; switched on after paying) P1 | BE | S | **iOS interruption level by importance.** Important → `time-sensitive` (add the capability with the entitlement step in `observability-apple-blockers.md`); offers → `passive`. Never `critical`. | The payload carries the right level (a sender test). |
| D8 | (111, done) P2 | DRV-APP, SW | S | **Driver and shop settings show categories as fixed** ("Work messages can't be turned off - they're part of your job") and keep the device on/off. Shop web keeps 059's per-device type mutes for push. | No silent dead ends. |
| D9 | (111, done) P1 | BE | S | **Quiet hours** for `offers` and `news`: none sent between 21:00 and 08:00 in `OPERATING_TZ`; held until 08:00. Important, work and orders ignore it. | A test with the clock at 22:00. |
| D10 | (111, done) P1 | BE | S | **Frequency cap** for promotions per customer: at most 1 a day and 3 a week, configurable in back-office settings. Over the cap → inbox only, no push. | A test; the campaign report counts how many were capped. |

## Epic E - Back-office messages (campaigns) · P0/P1

| ID | Pri | Where | Size | Item | Done when |
|---|---|---|---|---|---|
| E1 | (112, done) P0 | DB | M | **`public.campaign`**: kind (`promotion` / `announcement` / `important` / `direct`), audiences (one or more of customer, driver, shop), targeting (jsonb, validated), title and body (length-checked; the lock-screen line is limited), image, destination per audience, channels (inbox ± push ± email later), `send_at`, `expires_at`, `pinned`, status (draft → scheduled → sending → sent / cancelled / withdrawn), `created_by`, `approved_by`, counts. Append-only `campaign_event` for the activity log. | Migration plus check constraints; a promotion can only target customers. |
| E2 | (112, done) P0 | BE (admin, staff gateway) | L | **Campaign routes**: list (`parseListQuery`), create / edit draft, `POST …/audience-count`, `POST …/test` (send to me), schedule, cancel, withdraw (archives everyone's inbox item; a push already shown can't be recalled, and the screen says so), report. Activity via `activityResponse` (104). Roles: admin and manager send to many people; `csa` sends `direct` only. | Container tests; the guard refuses a promotion with no consent filter. |
| E3 | (112, done) P0 | BE (notifications) | L | **Fan-out worker**: picks campaigns that are due, expands the targeting into recipients in pages of 1,000, then for each recipient applies required / preferences / consent (D2, D3), quiet hours (D9) and the cap (D10). It writes `notification` and `notification_delivery` rows through A3 `notify`. It can resume after a crash (cursor kept on the campaign) and never writes twice (`dedupe_key = campaign:{id}:{sub}`). | A 20,000-recipient campaign completes; killing it halfway and re-running it gives no duplicates. |
| E4 | (112, done) P0 | BE | M | **Targeting, version 1:**<br>• **Customers:** all; chosen people (search or CSV of emails); by postcode or coverage group; ordered in the last N days / never ordered; has a points balance; app users only (has a push token).<br>• **Drivers:** all; on duty now; with work today; on a **collection** run today; on a **delivery** run today; by clearance (function × area); chosen people.<br>• **Shops:** all active; chosen shops; by role (`shop_manager` / everyone).<br>Each filter is a reviewed SQL fragment, never free SQL. | The audience count matches a hand query for each filter (container tests). |
| E5 | (112, done) P0 | BO | L | **Messages area**:<br>• List: a DataTable with status, audience, kind, sent, opened %.<br>• Composer with live previews: lock-screen push (iOS and Android), inbox row and detail; character counters.<br>• Audience builder with a live count.<br>• Destination picker: reuses 108's link picker for customers, plus driver and shop destinations.<br>• Image upload: media bucket, public prefix, `publicImageUrl`.<br>• Schedule, test send, confirm sheet ("Send to 4,212 customers?").<br>• Guided tour (107 rule). | Tours, list and skeleton guards pass; a manager can send a promotion end to end in dev. |
| E6 | (112, done) P1 | BO, BE | M | **Report per message**: recipients, inbox delivered, push sent / failed / no token / muted / capped / held for quiet hours, seen, opened (B6), button tapped, archived. Data comes from `notification` and `notification_delivery` states; no extra tracking. | The numbers add up to the recipient count. |
| E7 | (112, done) P1 | BO | M | **Message one person from where staff already are**: a "Send message" action on the back-office customer, driver and shop pages. It creates a `direct` campaign with that one recipient (support category; no consent needed, because it isn't marketing). | A CSA can message a customer about their order and see it in the customer's page activity. |
| E8 | (112, done) P1 | BE, BO | S | **Templates / duplicate**: start a new message from a previous one. | - |
| E9 | Dropped (decision 5) | BE, BO | M | ~~**Approval for big sends**~~: a campaign to more than N people, or any `important` one, needs a second admin to approve (four-eyes). | A manager's send waits for approval. |
| E10 | (112, done) P2 | BE | S | **Safeguards**:<br>• the server refuses a promotion whose body has no sender ("Effy") or that targets drivers or shops;<br>• "all customers" needs an extra typed confirmation;<br>• a hard cap per campaign (configurable);<br>• a kill switch that stops a sending campaign. | Each refusal is tested. |
| E11 | P3 | BE, BO | L | **Email as a campaign channel** (marketing email with the unsubscribe link and postal address; the Spam Act). Builds on email-kit. | ✅ 115 |
| E12 | P3 | BE, BO | M | **Recurring and triggered messages** ("didn't order for 30 days", "points expire in 7 days" as push). Only after E6 shows what works. | ✅ 115 |
| E13 | P3 | BO | S | **Personalisation tokens** (`{first_name}`) for the inbox only, never on the lock screen (the telemetry and lock-screen no-PII rules). | ✅ 115 |

## Epic F - Fix, improve or remove in what exists

| ID | Pri | Where | Size | Item | Done when |
|---|---|---|---|---|---|
| F1 | P1 | BE (notifications) | S | **(109, done)** **Rewrite `order_ready` for customers**: "Your order is packed" / "Your order is packed and on its way to our hub", with no "handoff". | The words are reviewed; `copy.test.ts` is updated. |
| F2 | (110, done) P1 | BE (fleet / driver) | M | **Wire up `order_out_for_delivery`** (decide: wire it or remove it). Proposal: send it when the delivery round the order is on **starts**, once per order, Effy delivery only. "Out for delivery" is already one of the 9 package status words. | A customer gets "Out for delivery" when the driver leaves the hub. |
| F3 | P1 | BE | S | **(109, done)** **Remove `deepLink` / `webPath` / `entityInLink`** after B2, plus the string parsing in `pushDestination` and `PushOpen`. | Grep finds none. |
| F4 | P1 | DB | S | **(109, done)** **Type list in one place.** Today the DB `CHECK`, `copy.ts` and `notification-types.ts` each list types. Keep the CHECK, add a test that the three agree, and make campaigns one type (`message`) so staff sends never need a migration. | One test fails when the three lists disagree. |
| F5 | (114, done) P2 | docs | S | **Update stale docs**: `next-implementation-candidates.md` (#4, #6, #8), `customer-capabilities.md` (Notifications row), `observability-apple-blockers.md` (adds the time-sensitive capability step from D7). | - |
| F6 | (110, done) P2 | CUST-APP | S | **Remove the `NotificationsScreen` empty-state-only code** once C2 lands (Account shortcut and Home bell point at the inbox). | - |
| F7 | (110, done) P2 | BE | S | **`points_expiring` as push too** (it's email-only today). Category `points`. | - |
| F8 | Closed: not doing (decision 7) | CW | L | **Web push for customers** (service worker on the storefront). Low value until there are real web shoppers; iOS needs a home-screen PWA. Probably *not doing*: the inbox covers the web. | Decide; record it. |
| F9 | (110, done) P2 | BE | S | **A driver who signs in late gets the work notifications they missed.** Today a `run_assigned` made before the driver's first sign-in is skipped (`no_token`, seen 2026-11-07). With A1 it is in their inbox anyway; also show a pinned "You have N runs today" when they first sign in on a new phone. | A new phone shows the morning's assignments. |

---

## Proposed spec order

| # | Spec (working title) | Items | Why this order |
|---|---|---|---|
| 1 | **Notification record & destinations** | A1–A8, B1–B6, F1, F3, F4 | Everything else writes or reads these. Delivers taps that open the right screen for every existing push. |
| 2 | **Inboxes** | C1–C7, F2, F6, F7, F9 | Uses spec 1. Existing system notifications fill the inboxes right away; no campaigns needed to prove it. |
| 3 | **Notification preferences & marketing consent** | D1–D10, legal D5 (via 045) | Must land **before** any promotion is sent. |
| 4 | **Back-office messages** | E1–E10 | Uses 1–3. Can ship **announcements and important messages to drivers and shops first** (no consent needed), then customers. |
| 5 | Later | A9, B7, C8, C9, E11–E13, F8 | When the numbers ask for it. |

If speed matters more than order: spec 4 for **drivers and shops only** can follow spec 2, because staff
messages need no marketing consent. Customer promotions wait for spec 3.

## Decisions (answered by the operator, 2026-11-12)

7. **The rest of the backlog.** F8 (web push for customers) is **not doing**: the website inbox and email cover it, and
   iPhone web push only works from the home screen. C8 (back-office staff inbox) and C9 (snooze) are **closed as not
   needed** - reopen when a shop asks for snooze or staff need alerts. What remains is built in two specs:
   **115** - email as a campaign channel, triggered and recurring messages, `{first_name}` in inbox items (E11–E13);
   **116** - email links open the app, iOS urgency levels and the app-icon badge (B7, D7, C6's iOS part; Android now,
   iOS switched on after the paid Apple account). Both built 2026-11-12: the backlog is complete.

## Decisions (answered by the operator, 2026-11-08)

1. **Customer marketing default: OFF until the customer opts in, and the apps ASK them to opt in.** Spec 3 builds the ask: a
   clear in-app prompt (not the OS permission dialog alone), a yes recorded with when and where, and a way to say no again.
   No promotion goes to a customer who has not said yes.
2. **Customers can turn off push for order updates; the item always stays in the inbox.** Only the push channel is muted.
3. **Retention: customers 180 days, drivers and shops 90 days** (delivery records 30 days), as spec 109 built.
4. **`order_out_for_delivery` is wired**, sent when the driver starts the delivery round (spec 2).
5. **Admin and manager may send to many people; CSA may not. No second approval** (E9 dropped for now).
6. **Shop push choices stay per device** (059); the inbox is per person.

---

## Sources

- Knock - in-app feeds and seen/read/archived states: <https://docs.knock.app/integrations/in-app/feeds>
- Novu - Inbox, snooze, preferences: <https://docs.novu.co/platform/inbox>, <https://docs.novu.co/platform/inbox/features/snooze>
- Courier - Inbox behaviour (pinned, actions, archive): <https://www.courier.com/docs/in-app/how-the-inbox-behaves.md>; preferences (required / opt-in / opt-out topics): <https://www.courier.com/docs/platform/preferences/intro>
- SuprSend - preference centre and "can't unsubscribe" categories: <https://docs.suprsend.com/docs/preferences>; iOS inbox seen/read: <https://docs.suprsend.com/docs/ios-inbox>
- Apple App Review Guideline 4.5.4 (promotional push needs explicit in-app opt-in and opt-out): <https://www.macrumors.com/2020/03/04/apple-shares-updated-app-store-guidelines/>, <https://developer.apple.com/app-store/review/guidelines/>
- Push notifications and the Spam Act (Australia): <https://www.allens.com.au/insights-news/insights/2025/10/Push-notifications-links-and-compliance-lessons-for-all-businesses-from-ACMAs-recent-investigations/>, <https://www.ashurst.com/en/insights/acma-goes-ham-on-spam-is-your-business-in-breach-of-the-spam-act>
- Android notification channels: <https://developer.android.com/training/notify-user/channels>; promotional versus transactional channels: <https://www.braze.com/resources/articles/android-o-push-notifications-channels>
- iOS interruption levels (time-sensitive, critical): <https://developer.apple.com/videos/play/wwdc2021/10091>, <https://developer.apple.com/design/human-interface-guidelines/managing-notifications>
- FCM sending (500 tokens per multicast; topics): <https://firebase.google.com/docs/cloud-messaging/send-message>
- Quiet hours, frequency capping, send-time preference checks: <https://knock.app/manuals/push-notifications/building-a-preference-system>, <https://help.moengage.com/hc/en-us/articles/213902323-Send-campaign-in-recipient-s-time-zone>
- Deep-link routing (hold through sign-in, fall back when content is gone): <https://www.devpath.com/courses/mobile-system-design/deep-linking-and-universal-links-in-mobile-applications>, <https://appstorys.com/blog-Deep-Linking-Push-Notifications-Guide>
