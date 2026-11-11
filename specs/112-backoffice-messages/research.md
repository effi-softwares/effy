# Research: Back-Office Messages (112)

Each decision below has a rationale and the alternatives that were rejected. All file and table names were read from
the tree on 2026-11-11.

## R1. A message reaches people through `notify()`, as three new notification types

**Decision**:
- Add three catalogue types: `customer_message`, `driver_message` and `shop_message`. Each has its audience, a tag and
  group for the shop console's coalescing, and the audience's home as its default destination.
- `NotifyInput` gains an optional `message` field: `{ messageId: string | null; source: 'campaign' | 'direct';
  category; importance; title; body; destination; imageUrl: string | null }`.
  - When `message` is present, the row takes its words, category, importance, destination and picture from it, and
    `message_id` and `source` are written.
  - `notify()` throws when `message` is given for a non-message type, when it is missing for a message type, or when the
    category is not one of that audience's (`policyFor` already throws).
- The dedupe scope is the message id, so the key is `customer_message:{sub}:{messageId}`. A resumed page can never write
  a second row for anyone (FR-013).
- Everything 111 does happens unchanged, because it is the same statement:
  - consent for offers and news (no row for anyone without a current yes);
  - channel choices, written `skipped`;
  - the limits, written `capped`;
  - the night hold, with `not_before` set to 08:00;
  - the Effy-name refusal;
  - announcing `inbox` after commit.

**Rationale**:
- 109's guard allows one writer of `notification` and `notification_delivery`. A second writer for messages would also
  need its own copy of 111's rules, and the rules must exist exactly once.
- 109 F4 reserved this ("make campaigns one type so staff sends never need a migration"). One type per audience is
  needed, because a catalogue entry has exactly one audience and the drain looks up the tag by type.

**Alternatives**:
- *One `message` type with the audience taken from the input*: this breaks the one-audience-per-entry invariant that the
  drain, the policy test and the Kotlin fixtures rely on.
- *Using the test seam `options.entry`*: it is documented as test-only and skips the type CHECK's meaning.

## R2. The routes live in a new `admin-messages` stack on the staff gateway

**Decision**:
- Add `apis/edge-api/admin/serverless.messages.yml`, deployed as `SERVICE=admin-messages`. It follows the
  `admin-promotions` pattern: the same directory, its own CloudFormation stack, listed in `listStacks()`, and in the
  Makefile's `EDGE_STACK_*` map and `EDGE_ALL_SERVICES`.
- It has 13 routes (see [contracts/messages-api.md](contracts/messages-api.md)): list, create, get, edit, audience count,
  picture upload, test, send, cancel, stop, withdraw, activity, and messages received.
- **Duplicate needs no route.** The client reads the message and creates a draft with `fromMessageId`, which writes a
  "duplicated from" event.
- The per-message limit rides the existing `PUT /orders/v1/notifications/settings` (111), so no new route is needed.

**Gateway capacity**:
- The staff gateway goes from **218 to 231 of 300 (77%)**, which crosses the 75% warning. Per
  [docs/api/path-assignment.md](../../docs/api/path-assignment.md), the plan must decide now what moves before 90%
  (270).
- **Decision recorded for the operator**: the next relief is moving `catalog` and `inventory-staff` (45 routes) to a
  third gateway. That needs a constitution amendment first, raised when the staff gateway passes about 255.
- Nothing moves in this feature, and no route is merged to fit.

**Alternatives**:
- *One action route `POST /messages/{id}/{action}`*: this is merging routes to fit, which the rule forbids.
- *Adding to `admin/serverless.yml`*: that stack already has 53 functions and is near its CloudFormation resource limit,
  which is why `admin-promotions` was split off.
- *Putting the routes in `orders`*: messages are not about orders or customers alone; the admin service owns promotions,
  staff and shops.

## R3. Sending is a route-less scheduled function in the `notifications` service

**Decision**:
- Add a new function `messages` (`src/messages/handler.ts`) on `rate(1 minute)`, beside the drain and the purge. Each
  pass works through these steps in order, within a 12-minute budget (the timeout is 15 minutes):
  1. **Due**: messages `scheduled` with `send_at <= now()` move to `sending`, after the size check (R12).
  2. **Pages**: for each `sending` message (`FOR UPDATE SKIP LOCKED`, so two passes never share one), it runs pages of
     1,000 recipients. **Each page is one transaction**:
     - re-lock the message row and confirm it is still `sending`, which is how Stop takes effect within one page;
     - expand the next 1,000 people of one audience after `cursor_sub`, ordered by `sub` (R4);
     - call `notify()`;
     - add the page's matched count to `message_audience.matched_count`;
     - advance `cursor_audience` and `cursor_sub`.

     When every audience is exhausted, the message becomes `sent` with `sent_at`.
  3. **Withdrawals to announce**: for withdrawn messages with `withdraw_announced_at IS NULL`, announce `inbox` to their
     recipients in pages of 1,000, then stamp the message.
  4. **Back-office live**: announce `{scope: "ops", kind: "messages"}` after any status or progress change, so the
     message page and list re-read (no timer).
- Because the cursor and the rows commit together, a crash loses at most one page's work and never repeats it. The
  dedupe key (R1) is a second guard against a repeat.

**Rationale**:
- Constitution III: no queue or compute is added. A scheduled Lambda is the platform's pattern (drain, purge,
  `gatewayUsage`).
- A 20,000-person message is 20 pages of one statement each, finishing in well under a minute (SC-002 asks for 10
  minutes).
- A page of 1,000 is what `notify()` already handles: one statement and one `announceInbox` of up to 1,000 channels.

**Alternatives**:
- *SQS fan-out*: a new queue for something a cursor already does.
- *Sending inside the send route*: the gateway's 29-second limit, and no resume.
- *Step Functions*: new infrastructure for no gain.

## R4. Audiences are fixed filters, each a reviewed SQL fragment

**Decision**:
- Add a shared module, `@effy/edge-shared/notifications` `messages/audience.ts`. Both the count route and the sending
  worker use it.
- `parseAudience(audience, json)` validates a closed shape and refuses an unknown key (`400 invalid_audience`).
- `audienceSql(audience, filter)` returns one SQL statement with parameters, never text from the client. It selects
  `sub` (and `email`, for completeness) for the active people that match. Filters combine with AND.

**Customers** (`public.customer`, not closed, with a `cognito_sub`):

| Filter | Shape | Meaning |
|---|---|---|
| (none) | `{}` | every customer |
| `people` | up to 5,000 customer ids | chosen by hand or from a file of emails |
| `postcodes` | up to 500 postcodes | has a saved address (`customer_address`) in one of them |
| `groups` | coverage group ids | has a saved address in a postcode on those groups' lists (`delivery_zone_postcode`) |
| `orderedWithinDays` | 1–365 | has a paid order placed in the last N days |
| `neverOrdered` | `true` | has no paid order |
| `hasPoints` | `true` | `public.points_usable(customer) > 0` |
| `appUsers` | `true` | has an active `device_token` for the customer audience |

**Drivers** (`public.driver`, `status = 'active'`):

| Filter | Meaning |
|---|---|
| (none) | all active drivers |
| `onDuty` | an open duty session, using fleet's `ON_DUTY_EXISTS` fragment, moved to shared so there is one copy |
| `workToday` | a round or collection run assigned for today on Effy's clock |
| `collectionToday` / `deliveryToday` | a collection run, or a delivery round, today |
| `clearance` | `{function, zoneId \| null}` matches a `driver_zone_capability` row |
| `people` | chosen driver ids |

**Shops** (`public.shop`, `status = 'active'`, through `shop_staff` with `status = 'active'`):

| Filter | Meaning |
|---|---|
| (none) | every active staff member of every active shop |
| `shops` | chosen shop ids |
| `managersOnly` | only staff with the `shop_manager` role |

- **Counting** wraps the same statement in `count(DISTINCT sub)`. For offers and news it also counts those with
  `consentGrantedSql` for the kind's category (111), so "match" and "said yes" come from one query.
- **Emails from a file**: the client parses the CSV and sends up to 5,000 emails to the count route with `resolve`. The
  route answers the customer ids it found, plus how many were not found and how many were repeated. The draft then
  stores the ids, never the emails.
- **Guard** `messages.guard.test.ts`: no route builds audience SQL outside `audience.ts`, and every filter key in the
  shared-types shape has a fragment and a container test.

**Rationale**:
- FR-008 says "fixed filters", and backlog E4 says "never free SQL". One module serves both count and send, so the
  count is a true estimate of what will be sent.

**Alternatives**:
- *Storing the resolved recipient list at schedule time*: FR-010 says the audience is worked out at send time.
- *A filter DSL*: more power than the spec asks for, and harder to review.

## R5. The kinds and their filing are one declaration in shared-types

**Decision**:
- New `packages/shared-types/src/messages.ts` declares `MESSAGE_KINDS`. For each kind it gives the audiences allowed and
  the category and importance per audience:

| Kind | customer | driver | shop |
|---|---|---|---|
| `announcement` | – | announcements | announcements |
| `important` | important (important) | important (important) | important (important) |
| `offer` | offers | – | – |
| `news` | news | – | – |
| `direct` | support | work | announcements |

- It also declares the words limits (title 60, text 500), the lock-screen preview lengths, `MESSAGE_STATUSES`, the
  filter shapes and the DTOs.
- The admin service, the worker and back-office all read it. A test checks that it agrees with the migration's CHECKs
  and with 111's category policy, so every category named exists for its audience.
- **Important messages** are pinned (110) until read, or until their end time, else for 7 days.

**Rationale**: two sources for one fact is the defect pattern this repository guards against.

## R6. Storage: `message`, `message_audience`, `message_event`, plus two notification columns

See [data-model.md](data-model.md).
- The chosen people are kept in the filter's JSON (an id array, at most 5,000). That is enough for "people" and avoids a
  join table.
- `notification` gains `message_id` and `image_url`.
- `notification_settings` gains `max_recipients_per_message`.

**Alternatives**:
- *A `message_recipient` table written at send*: it duplicates `notification.message_id` and costs 20,000 extra rows a
  message.

## R7. Editing, sending and stopping are guarded by the row, with a version for edits

**Decision**:
- `message.version` increments on each edit. A `PUT` with a stale `version` gives `409 message_changed`.
- Status changes run under `SELECT … FOR UPDATE`:

```text
draft ──send(now)──▶ sending ──▶ sent ──withdraw──▶ withdrawn
  │                   │  └─stop──▶ stopped ──withdraw──▶ withdrawn
  │                   └─withdraw──▶ withdrawn          (stops and withdraws)
  └─send(at)──▶ scheduled ──(due)──▶ sending
                  │  └─cancel──▶ cancelled
                  └─(too many people at send)──▶ not_sent
draft / scheduled ──edit──▶ (same status, version+1)
```

- **Nothing is deleted**, drafts included: an unsent draft stays a draft and the list can filter it out, so the activity
  log stays complete.
- Edits are allowed only in `draft` and `scheduled`. Any other state gives `409 message_not_editable`.

## R8. Withdrawing ends everyone's item at once; the worker tells open inboxes

**Decision**:
- The withdraw route runs one transaction: set the message to `withdrawn` with `withdrawn_by`, and call shared
  `withdrawMessageItems(tx, messageId)`. That sets `expires_at = now()` on the message's notifications that have not
  ended.
- The inbox's `LISTED` rule already hides an ended item, so it is gone from every inbox on the next read.
- The drain already abandons a delivery whose notification has ended (`expired`). Queued and night-held pushes are
  never sent, and nothing new writes delivery outcomes.
- The worker's withdrawal step (R3) announces `inbox` to the recipients in pages, so open screens re-read within a
  minute. The spec's SC-006 and FR-019 say this.
- `withdrawMessageItems` lives in `shared/src/notifications/messages/withdraw.ts`. 109's guard list of `UPDATE
  public.notification` writers gains this one file.

**Alternatives**:
- *Archiving everyone's items (`archived_at`)*: archived means the person's own choice and is undoable from their side;
  a withdrawal is Effy's.
- *A new delivery status `withdrawn`*: it would need a third writer of delivery outcomes, when `expired` already says
  "not sent, it ended".
- *Announcing 20,000 channels from the route*: the gateway's 29-second limit.

## R9. Pictures go in the existing public `promotions/` prefix

**Decision**:
- `POST /admin/v1/messages/{id}/picture` answers a presigned PUT, using the existing `presignUpload`, for the key
  `promotions/messages-{id}/{uuid}.{ext}`. It takes JPEG, PNG or WebP up to 5 MB, like promotion pictures.
- The message stores the key. Readers build the address only with `publicImageUrl`, and the media worker makes WebP
  copies as for any public picture.
- `image_url` is written on each notification when the message is sent (the address, not the key), so the inbox and
  the push need no join.
- **The push**:
  - FCM `notification.image` is set, so Android shows it expanded.
  - iOS would need a notification service extension, which waits for the paid Apple account. Until then iOS shows the
    picture in the inbox only.

**Rationale**:
- `PUBLIC_MEDIA_PREFIXES` mirrors `local.public_media_prefixes` in `media.tf`. A new prefix would mean a Terraform change
  and a guard change for a picture that is equally public.

**Alternative**: a `messages/` prefix. It is cleaner by name, but costs an `apply` and two lists edited in step.

## R10. Destinations reuse 109's lists; the customer picker reuses 108's

**Decision**:
- A message stores one destination per audience, as 109's JSON. `parseDestination(audience, …)` must accept it, or the
  route gives `400 invalid_destination`.
- **Pickers**:

| Audience | Destinations offered |
|---|---|
| customer | Home, Orders, Points, plus 108's `LinkPicker` (search → `search{query}`, sale → `sale`, aisle → `aisle{aisleKey,title}`, product → `product{productId}`); a direct message may also choose one of that customer's orders (`order{orderId}`) |
| driver | Today, Account |
| shop | Order queue, Catalogue |

- `LinkPicker` moves from `features/promotions/components/` to `components/link-picker/`, used by both. A small adapter
  maps a banner link to a customer destination.

## R11. Every inbox opens a message as a detail with its picture

**Decision**:
- `InboxItemDTO` gains `imageUrl: string | null`. It is required and nullable, with no compatibility field, because all
  four clients ship together.
- On all four surfaces (customer app, customer website, driver app, shop console), a `*_message` item opens a detail
  view: picture, title, full text, and a button to its destination ("Open").
  - It never jumps straight to the destination, because the words are the point of the message.
- The customer surfaces already have 111's detail for offers and news ("See offer", "Stop offers like this"). It is
  generalised: offers and news keep "Stop … like this", and the button reads "See offer" or "Open".
- Telemetry: the existing `inbox_item_opened {type, category}` and `notification_opened {type}` already carry
  `customer_message` and the others. No new event is needed (FR-034).

## R12. Safeguards are enforced on the server, with the client mirroring them

**Decision**:
- **Kind and audience**: checked against `MESSAGE_KINDS` on create, edit and send (`400 invalid_message`).
- **Naming Effy**: offer and news are refused on send, schedule and test unless the title or text matches `/effy/i`
  (`400 message_must_name_effy`). `notify()` throws as the backstop.
- **Per-message limit**: `notification_settings.max_recipients_per_message` (default 20,000, CHECK 1–200,000).
  - On send or schedule, a count above it gives `409 too_many_recipients`.
  - At the due moment, the worker counts again. Over the limit, the message becomes `not_sent` with
    `not_sent_reason = 'too_many_recipients'`, and an event is written.
  - Only administrators may change the limit. `orders` refuses a manager's change to that field with `403 forbidden`,
    while still allowing their change to the promotion limits.
- **Confirmations**:
  - Send carries `confirmCount`, the number shown. If the true count now differs by more than 5%, the route gives
    `409 audience_changed` with the new count, and the sheet asks again.
  - A customer audience with no filter also needs `typedCount`, equal to the count.
- **Important reminder**: client wording only (FR-022).

## R13. Roles

- **`canManageMessages(sub)`**: admin or manager. It is needed for every kind except `direct`, and for stop, withdraw
  and the large-audience routes.
- **`isActiveStaff(sub)`**: any active staff, CSA included. It may:
  - read the list, a message, its activity, and messages received;
  - create and send a `direct` message to exactly one person.

  A CSA cannot schedule a direct message (it is sent now), stop or withdraw any message, or create another kind
  (`403 forbidden`).
- These follow `promotions/authz.ts` (decided from `admin.staff`).

## R14. A test send is a real notification to one chosen account, not counted

**Decision**:
- `POST /admin/v1/messages/{id}/test` takes `{ audience, personId }`: a customer id, a driver id, or a shop staff id.
- It calls `notify()` with every rule applied and:
  - `message.messageId = null`, so it is not in the report;
  - dedupe scope `test:{messageId}:{uuid}`, so repeat tests arrive;
  - a title prefixed "Test: ".
- It answers what happened: `delivered`, or `not_delivered` with the reason (`no_consent`, the channel turned off, no
  phone signed in, …). The outcome comes from the rows `notify()` wrote and the push delivery once drained; the
  response says "queued" for the push.
- The last account picked is remembered in the browser (try/catch `localStorage`, a convenience only).

## R15. The report is computed from rows, then frozen before the purge

**Decision**:
- `GET /admin/v1/messages/{id}` returns the report per audience and in total, from `notification` (with `message_id`)
  and `notification_delivery` (the push channel), grouped by status. It also returns `seen_at`, `read_at` and
  `archived_at` counts, and `matched_count` from `message_audience`. The partial index
  `notification_message_idx (message_id) WHERE message_id IS NOT NULL` keeps this fast.
- The report lines (FR-023):

| Line | How it is counted |
|---|---|
| for | `matched_count` (people the filters matched while sending) |
| reached | notifications written |
| no yes | for − reached (offer and news only; 0 otherwise) |
| push sent / no phone / failed / muted / turned off / over the limit | delivery status `sent` / `no_device` / `failed` / `muted` / `skipped` / `capped` |
| held for the night | `pending` with `not_before` > now |
| waiting | other `pending` |
| not sent: withdrawn or ended | `expired` |
| seen, opened, archived | timestamps on the notifications |

- **Freezing**: delivery rows are purged at 30 days and notifications at 90 or 180. The daily purge first writes
  `message_audience.report` (jsonb) and `report_frozen_at` for messages sent 29 or more days ago that are not frozen.
  After that the route returns the frozen numbers. Engagement after day 29 is not counted, and the page says "Final
  numbers as of {date}".

**Alternatives**:
- *Counters updated by the drain*: a second writer of outcomes, and a drift risk.

## R16. A person's page lists the messages they received

**Decision**:
- `GET /admin/v1/messages/received?audience=customer|driver|shop&id=…` is an `activityResponse` (104) over a new source,
  `messages-received`. It reads notifications with `message_id`, joined to `message`, for:
  - the customer's `cognito_sub`;
  - the driver's;
  - all staff of the shop (where `shop` is the audience).
- Each row: the message title and kind, when it arrived, opened or not, and the sender.
- It is opened from **More → Messages received** on the customer, driver and shop pages, beside **Send message**.

## R17. Back-office screens, tours and live updates

- **Navigation**: People › **Messages** (`/messages`), with the `Send` icon, visible to every role.
- **Pages**:
  - `/messages`: a `DataTable` over `parseListQuery`. Sort: created, sent, title, then id. Filters: kind, audience,
    status.
  - `/messages/new` and `/messages/$id/edit`: the composer, with the previews beside the form from 1280px and below it
    under that.
  - `/messages/$id`: the report, actions, activity and duplicate.
- **Send message** on a person page opens a `Dialog` (shadcn, the responsive dialog) with the direct-message form. It
  sends at once after the confirmation.
- **Tours**:
  - `ML`, `ME` and `MS` are new.
  - `CN` goes to version 2, with words from the spec.
  - `codes.ts` gains the three codes.
  - The tour count goes 53 → 56. The 107 inventory in `specs/107-backoffice-guided-tours/spec.md` is updated.
- **Live**: a new ops kind `messages` is added to `LiveChange` and mapped to the messages query keys in
  `features/live/routes.ts` (with its test). The live authorizer does not check kinds, so it needs no change.
- **Skeletons**: `TableSkeleton` for the list, `DetailPageSkeleton` for the message, and the composer's own form shape.
