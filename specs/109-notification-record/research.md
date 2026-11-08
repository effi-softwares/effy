# Research: Notification Record & Destinations (109)

Each decision below gives what was chosen, why, and what else was considered. Facts about the code were read on
2026-11-07.

## R1 - Two tables: the notification and its deliveries

**Decision**: `public.notification` holds one row per person per thing they were told: the inbox item. Each
`public.notification_delivery` row is one channel of it (`push` or `email`), with `UNIQUE (notification_id, channel)`
and `ON DELETE CASCADE`.

**Rationale**: FR-001 and FR-004. Knock, Novu, Courier and SuprSend all keep the message and its channel attempts
apart. Today `notification_request` is a delivery with no message behind it: an order delivery writes two unrelated
rows (`order_delivered:push:…` and `order_delivered:email:…`), and nothing could show them as one item.

**Alternatives**:
- *Add inbox columns to `notification_request`*: rejected. The push row and the email row would both need seen/read
  state, and a person with no device has nowhere to keep their item.
- *An inbox projection written by the drain after sending*: rejected. It loses the item when no channel delivers
  (FR-006) and is a second writer.

## R2 - Expand, then contract (two migrations)

**Decision**:
- **Stage A** (this feature's migration) adds the two tables and leaves `notification_request` in place.
- The `notifications` worker drains **both** tables until Stage B: its existing code drains the old one, unchanged,
  and is renamed `legacy`.
- Every writer moves to the new tables.
- **Stage B** is a later migration, applied after one full deploy with no pending legacy rows. It drops
  `notification_request` and the legacy drain. It is a separate task with its own deploy note, in the same way as
  094's Stage C.

**Rationale**: the writers run inside payment, delivery and catalogue transactions in **eight** services (commerce,
orders, fleet, driver, shop, catalog, customer, admin), all bundling `@effy/edge-shared`. Dropping the table in the
same migration would make every payment fail between the migration and the last deploy. The never-edit-a-committed-
migration rule also favours two forward migrations.

**Alternatives**:
- *A trigger copying old rows into new tables*: rejected. 096 chose "no trigger" for a one-writer rule, and a
  trigger is a hidden second writer.
- *Deploy everything in one window and accept failures*: rejected. Payments.

## R3 - One writer: `@effy/edge-shared/notifications`

**Decision**: a new sub-path export `@effy/edge-shared/notifications`:
- `notify(tx, input)` is the only code that inserts into `notification` or `notification_delivery`. It takes:
  audience, type, a list of recipients (`{sub, email?}`), `entityId`, destination, `dedupeScope`, channels, and
  optional `expiresAt` and `priority`.
- It inserts every recipient's notification in one statement (`unnest`, `ON CONFLICT (dedupe_key) DO NOTHING
  RETURNING`), then the deliveries **only for the rows it actually inserted**. A repeat therefore creates no
  delivery (FR-005).
- `notifications.guard.test.ts` fails any `INSERT INTO public.notification` or `notification_delivery` outside
  `notify.ts`, in the same style as `consignment.guard.test.ts` and `authoring.guard.test.ts`.

The nine writers today are `finalize.ts` (via `outbox.ts appendNotification`), `order-completion.ts`, `ledger.ts`,
`warnings.ts`, `override.ts`, `consignment.ts`, shop `fulfillments/repository.ts`, shop `attention/repository.ts`,
catalog `review/repository.ts`, and fleet `driver-push.ts`. That is ten call sites in nine modules. The set-based
ones (all active staff of a shop, push + email) first select their recipients in the same transaction, then call
`notify`.

**Rationale**: FR-009. Words, category and destination are decided in one place, and the one-writer pattern is the
repo's standard defence against a second, drifting path.

**Alternatives**:
- *A SQL function `public.notify(...)`*, which would keep the `INSERT … SELECT` shape: rejected. The words and
  destinations live in TypeScript (R4), and a SQL copy of them would be a second source.

## R4 - Words written when the notification is created; the catalogue moves to the shared library

**Decision**: `notifications/src/worker/copy.ts` moves to `@effy/edge-shared/notifications/catalogue.ts`. For each
type it holds the title, body, category, tag, group and `destinationFor(entity)`. `notify` writes the title and body
into the row, and the drain sends the row's words, never the catalogue's (FR-003). The worker keeps only the
FCM/email shaping. The email still renders from `entity_id` at send time, as today: emails are templates, and FR-003
is about the words of the notification.

**Rationale**: the writers live in eight services and the words must be known where the row is written. One
catalogue keeps one source of truth.

## R5 - The destination vocabulary: `@effy/shared-types` plus Kotlin twins pinned to fixtures

**Decision**: `packages/shared-types/src/notification-destinations.ts` defines a closed union per audience (see
[contracts/destinations.md](contracts/destinations.md)), a lenient parser (unknown kind or bad field → `null`) and,
for the shop, `shopPathFor(destination)`.

`notification-destinations.fixtures.json` lists wire values and their expected results (parsed value or null; shop
path). The Kotlin twins are:
- `core/push/Destination.kt` in the customer app;
- `core/push/Destination.kt` in the driver app.

Each has a commonTest that embeds a copy of the fixtures, and `notification-destinations.test.ts` fails when a copy
differs from the source. This is the `delivery-type` / `effy-windows` pattern.

**Rationale**: FR-010 and FR-016. This is the same discipline the repo already uses for three other vocabularies,
and it makes "a new kind added in one place only" fail a test.

**Customer kinds reuse 108's banner targets**: `search`, `sale`, `aisle` (108's `category`, which is a category key)
and `product`. Mapping them onto the app's existing `BannerTarget` routing keeps one way of opening each.

## R6 - What the push carries: `notificationId` + `destination`, nothing derived

**Decision**: FCM `data` = `type`, `notificationId`, `destination` (compact JSON), `title`, `body`, `tag`, `group`.
`deepLink`, `webPath`, `entityId` and `entityInLink` are removed (F3). The shop service worker turns `destination`
into a path with `shopPathFor`. The apps parse it with their twin.

**Rationale**: there are no installed builds outside the team (CLAUDE.md, "no compatibility fields"). The derived
strings were two encodings of one fact. The data block stays well under FCM's 4 KB.

## R7 - Opening a notification: navigate first when signed in, verify first when held

**Decision**:
- **Signed in**: the router opens the push's destination at once. The destination screen loads through the
  signed-in person's own API, so another person's order or run is a 404 and falls back (FR-015). It then calls
  `POST /{audience}/v1/notifications/{id}/read` in the background. This keeps a driver's tap working on a weak
  signal.
- **Signed out**: the router keeps `{notificationId, destination}` **in memory only**. After sign-in it calls the
  read route **first**:
  - 200: open the destination the server returns (the stored one);
  - 404, the notification is not this person's: drop it and show nothing (FR-014);
  - network failure: drop it, because ownership can't be checked.
  - If the app is killed before sign-in, the memory is gone and the tap is dropped. That is the spec's "closed first".
- **Shop console**: the service worker posts `{path, notificationId}`. The console calls the read route after
  navigating, or, if the session redirected to sign-in, after sign-in, with the same 404 → home rule.
- **Several notifications grouped into one banner** (the shop console's "3 new orders to pick") carry no single id.
  Clicking one opens the queue and marks nothing read. The inbox (spec 2) is where those are read.

**Rationale**: FR-012 to FR-017 without putting any account id in the push payload. The server's existing per-pool
authorizer is the ownership check.

**Alternatives**:
- *Carry the recipient's sub in the push and compare it on the device*: rejected. It is an identifier on a lock-screen
  payload, and the server check is stronger.
- *Always verify before navigating*: rejected for signed-in use. It costs a round trip on every tap and fails offline
  for drivers.

## R8 - Fallbacks live at the destination screen, not in the router

**Decision**: the router opens the screen. A screen whose subject is gone does the fallback:
- **Customer order detail**: a 404 pops to Orders and shows "That order isn't available."
- **Driver run** (DriverShell's existing rule): not in Today → Today.
- **Shop `/orders/$fulfillmentId`**: a 404 goes to `/orders` with a toast.
- **Shop `/catalog/$productId`**: a 404 goes to `/catalog` with a toast.
- **Customer product**: off sale → the aisle carried in the destination, if any, otherwise Home.

**Rationale**: the same screen is reached from lists too, and today a stale link there shows an error. One behaviour
fixes both. A router that checked existence first would need a read per kind.

## R9 - Read state recorded through one route per audience

**Decision**: one route in each audience's own service: `POST /customer/v1/notifications/{id}/read`,
`/driver/v1/…` and `/shop/v1/…`. All call `markRead(sub, audience, id)` in the shared module:
`UPDATE … SET read_at = COALESCE(read_at, now()), seen_at = COALESCE(seen_at, now()) WHERE id = $1 AND recipient_sub
= $2 AND audience = $3 RETURNING destination, read_at`. A row → 200 `{destination, readAt}`, none → 404.

**Gateway**: the shared gateway is at 167/300 (`gateway-capacity.contract.test.ts`, 2026-11-07), and +3 is
well within it. Spec 2 adds the rest of the inbox routes beside these.

## R10 - Throughput: batch claims, `sendEach`, a time budget, and a priority

**Decision**:
- The drain claims up to 500 pending deliveries at a time
  (`ORDER BY priority, created_at FOR UPDATE SKIP LOCKED`).
- It loads their recipients' tokens in one query (`subject_sub = ANY($1)`).
- It builds one FCM message per token and sends them with `sendEach` in chunks of ≤500.
- It loops until about 15 s remain of its 60 s.
- Deliveries carry `priority smallint` (0 = immediate, the default for everything in this feature; 1 = bulk, for
  spec 4), so a single notification never waits behind a bulk send (FR-020).

**Rationale**: today one row at a time, 100 a minute, is 3+ hours for 20,000 (backlog A8). At about 0.5–1.5 s per
500-message `sendEach` call, one invocation sends 10,000+, so 20,000 clears in 2–3 minutes. That leaves room for
FR-019 without a queue service or always-on compute (constitution III).

**Verification**: a unit test with a stub sender that takes a simulated 1.5 s per 500-message call and a fake clock
must clear 20,000 deliveries within 10 simulated invocations. A container test checks the claim order (priority
first, then age) and `SKIP LOCKED` (two concurrent drains never claim one row). A real load test is not run: 20,000
real pushes need 20,000 real devices.

**Alternatives**:
- *SQS fan-out*: deferred until the volume needs it.
- *FCM topics*: no per-person record or consent check (backlog §2.10).

## R11 - Expiry

**Decision**: `notification.expires_at` (nullable). The drain marks a pending delivery `expired` without sending when
`expires_at <= now()` (FR-007). In this feature, only `run_opens_soon` sets it, to the round's opening time. The
shop console's 10-minute web-push TTL stays, because that is about FCM's own queue, not ours.

## R12 - Retention and account deletion

**Decision**: a new scheduled function in the `notifications` stack, `notificationPurge`, runs at `rate(1 day)` and
deletes in batches of 5,000:
- customer notifications older than 180 days, driver and shop notifications older than 90 days (deliveries go with
  them through the cascade);
- deliveries older than 30 days on their own;
- legacy `notification_request` rows older than 30 days, until Stage B.

**Account deletion** (FR-025): an account is closed first (`customer_closure_request`, with a grace period) and erased
after `erase_after`. **No erasure job exists today**: nothing reads `erase_after`. This feature does two things:
- `closeAccount` deletes the customer's `device_token` rows in the same transaction (the closure already signs out
  every session, so no push should go to that person);
- `notificationPurge` deletes every notification addressed to a customer whose live closure request has passed
  `erase_after`.

The general erasure job stays a separate gap. It is recorded in FEATURE-HISTORY, not built here.

## R13 - Categories and importance fixed now

**Decision**: the `category` and `importance` columns exist from Stage A, each with a CHECK.
- **Customer:** `orders` for every `order_*` type, `points` for `points_*`.
- **Driver:** `work`.
- **Shop:** `orders` (`shop_new_order`, `shop_awaiting_pick`, `shop_refund_proposed`), `stock` (`shop_out_of_stock`,
  `shop_low_stock`) and `products` (the six product types).

Every type in this feature has `importance = 'normal'`. The CHECK already allows the categories spec 3 adds (`offers`,
`news`, `important`, `support`, `announcements`), so spec 3 needs no migration for them.

## R14 - Telemetry (constitution VII)

**Decision**:
- **Product event** `notification_opened` keeps its name and gains `{ type, fallback: boolean }`. It is captured
  **after** the destination (or its fallback) has shown (FR-018). Update `docs/telemetry/platform-events.md` and both
  apps' drift tests. Shop-web's `notif_opened` gains `fallback`.
- **Metrics** (EMF, `Effy/Notifications`): `NotificationDeliveriesPending` and `NotificationOldestPendingSeconds`,
  emitted at the end of every drain, plus `NotificationsPurged`.
- **Alarm**: `notification_backlog_stale`, raised when the oldest pending delivery is more than 300 s old for 3
  minutes in a row (FR-022). Terraform in `infra/envs/dev/notifications.tf`, applied by the operator.

No PII: ids and types only.

## R15 - One list of types (F4)

**Decision**: the type list exists in three places: the DB CHECK, the catalogue's keys, and `ShopNotificationType`.
They are kept as they are, with one test (`notification-types.contract.test.ts`) that reads the latest migration's
CHECK and fails if the three sets differ. Spec 4 adds one type (`message`) for words written by staff, so staff
sends never need a migration.

## R16 - Customer wording (F1)

**Decision**: `order_ready` becomes "Your order is packed" / "It will be on its way to you soon." `copy.test.ts`
(moved with the catalogue) gains a check that no customer title or body contains: handoff, hub, fulfil(l)ment,
package, parcel, run, shop.
