# Research: Notification Inboxes (110)

Decisions for [plan.md](plan.md). Each one names what was chosen, why, and what else was considered. Facts about the
codebase were read on 2026-11-08 on branch `110-notification-inboxes` (spec 109 committed, Stage A deployed to dev).

## R1 - Five inbox routes per audience, one factory

**Decision**: Each audience's own service gets five routes on the shared gateway, all built by one factory in
`@effy/edge-shared/notifications` (`makeInboxHandlers(audience)`), as 109 did for the read route:

| Route | Does |
|---|---|
| `GET /{aud}/v1/notifications?filter=&category=&cursor=` | one page of the inbox |
| `GET /{aud}/v1/notifications/unseen-count` | the bell |
| `POST /{aud}/v1/notifications/seen` `{before}` | opening the inbox clears the count |
| `POST /{aud}/v1/notifications/read-all` `{before}` | mark all read |
| `PATCH /{aud}/v1/notifications/{id}` `{archived}` | archive, and undo |

The existing `POST …/{id}/read` (109) stays and is the "tap an item" action.

The shared gateway goes from **170 to 185 of 300 (62%)**, under the 75% alarm. Measured with
`gateway-capacity.contract.test.ts` on 2026-11-08 (customer 26, driver 24, shop 54).

**Rationale**: one factory means one ownership rule and one set of tests for three audiences. Archive and undo are one
resource change (`archived: true|false`), not two verbs, which is the natural REST shape and not a merge made to fit.

**Alternatives**: separate `POST …/archive` and `DELETE …/archive` (backlog C1) cost 3 more routes for no benefit. Folding
the count into the list response alone would make every screen with a bell load a page of items.

## R2 - Ordering, paging and pinned items

**Decision**:
- **Order**: newest first, by `(created_at DESC, id DESC)`.
- **Paging**: keyset paging with an opaque cursor (base64 of `created_at|id`), 30 per page and 20 for the shop
  side panel (`limit`, capped at 50).
- **Pinned items**: returned **separately** as `pinned[]`, on the first page only, and left out of `items` on every
  page. An item is pinned when it is `importance = 'important'`, unread and has `pinned_until > now()`. Once it is read
  or its pin ends, it takes its normal place by date.

**Rationale**: putting pinned items in the keyset order would break the cursor, which is ordered by time. Sending them
apart keeps paging exact (SC-005: no item lost or repeated across 1,000).

**Alternatives**: offset paging repeats or skips items when new ones arrive at the top. A sort key that combines
pinned state with time breaks when a pin ends between two pages.

## R3 - Filters and the categories offered

**Decision**:
- `filter=all|unread`, where unread means `read_at IS NULL`.
- `category=<one of the audience's inbox categories>`; anything else is 400. Shop categories: orders, stock, products,
  announcements, important. Customer categories: orders, points, offers, news, important, support. The driver
  inbox takes no category.
- The **first page** also returns `categories`: the categories that have at least one listed item (not archived, not
  ended), from one `GROUP BY` on the same index.
  - The customer app and website offer only those (spec edge case).
  - The shop console always shows its five, because operators expect a fixed filter bar.

**Rationale**: the server knows what exists, so clients never offer a filter that is always empty.

## R4 - Seen, unseen count and their index

**Decision**:
- **Unseen**: `seen_at IS NULL AND archived_at IS NULL AND (expires_at IS NULL OR expires_at > now())`.
- **Seen**: `POST …/seen {before}` sets `seen_at = now()` for that person's unseen items created at or before `before`.
  `before` is the newest `createdAt` the client has shown; the server caps it at now. **Mark all read** uses the same
  rule and sets `read_at` and `seen_at`.
- **New partial index**: `notification_unseen_idx (recipient_sub, audience) WHERE seen_at IS NULL AND archived_at IS NULL`.
  The count reads only unseen rows, however long the history.

**Rationale**: a client-supplied cut-off makes "items that arrive afterwards stay unread / unseen" exact (FR-014). The
alternative, server time at the moment of the request, would mark read an item that arrived between loading the list
and pressing the button, so the person never saw it.

## R5 - Archive and undo

**Decision**:
- `PATCH {archived: true}` sets `archived_at`; `{archived: false}` clears it. Read and seen are untouched, so undo
  restores the item exactly.
- The about-5-second undo window lives on the client (snackbar / toast). The server accepts un-archiving at any time,
  which is harmless.
- Another person's id, or an id from another audience, gets 404.
- An item already removed by retention also gets 404; the client ignores a 404 on undo (spec edge case).

## R6 - The live `inbox` kind and announcing after commit

**Decision**:

1. **The kind**: `"inbox"` joins `LIVE_KINDS` and its Kotlin twin (`packages/mobile-kit/.../LiveKind.kt`, pinned by
   `live.test.ts`). `LiveChange` gains `inbox` for the customer, driver and shop scopes.

2. **Who hears it**:
   - **Customer**: their own channel (the `sub`).
   - **Driver**: their own channel (the driver's id).
   - **Shop**: the shop's channel, so every operator of that shop is told and each re-reads **their own** count.

   Per-person shop channels were rejected because they would need a new namespace and authorizer rule. The update
   carries one word and no content, so an operator learns only that someone at their shop has a new notification.

3. **When it is sent**: `notify()` runs inside the change's transaction (109) and must announce only after commit.
   `lib/db` gains `afterCommit(tx, fn)`:
   - `withTransaction` and `transactorFor` keep a per-client list, run it after `COMMIT`, and drop it on `ROLLBACK`.
   - When `tx` is not an open transaction (`pooled`, autocommit, e.g. `queueExpiryWarnings(pooled, …)`), the callback
     runs as soon as the statement returns.
   - Every transaction in the services is opened by these two helpers; the only hand-written `BEGIN`s are in two `ops`
     scripts that never notify.

4. **Other devices**: the inbox actions (seen, read, read-all, archive) also announce `inbox`, so a person's other
   devices update (FR-015).

5. **Guard**: `customer-announce.guard.test.ts` names `notifications/notify.ts` and `notifications/inbox.ts` as the
   two new places that may build a customer's update; each announces only to the person's own channel and carries
   only `inbox`.

**Alternatives**:
- Announcing at each of the ~12 call sites: many edits, and the recipients would have to be passed up through
  repository layers. A forgotten site would be silent.
- Announcing from the drain worker every minute: misses SC-003 (5 s) and is a timer in disguise.
- Postgres `LISTEN/NOTIFY`: needs a persistent listener, which is always-on compute (constitution III).

## R7 - How clients stay current

**Decision**: each surface treats `inbox` as a signal to re-read, as with every other kind (071):
- **Customer and driver apps**: an app-level `InboxBadge` store re-reads the count on `inbox`, when the app comes to
  the front, and after any inbox action. An open inbox also reloads its first page.
- **Shop console**: `inbox` invalidates `["shop","inbox"]` (`features/live/routes.ts`), covering the count, the side
  panel and the page.
- **Customer website**: the bell island re-reads the count, and the notifications page calls `router.refresh()`.

No timers (`check-no-refresh-timers.sh`).

**Push as a backstop**: when a push arrives while the app is open, the apps already handle it in the foreground (050
follow-up), and that handler also re-reads the count.

## R8 - The app-icon badge

**Decision**:
- The drain's batch claim computes each recipient's unseen count (a lateral count on `notification_unseen_idx`) and
  puts it in the push: APNs `aps.badge` and Android `notification.notification_count`.
- **Clearing**: opening the inbox calls a platform `clearAppBadge()` driver:
  - iOS: `setBadgeCount(0)`;
  - Android: cancel the app's own shown notifications, which removes the launcher dot.
- **Shop console**: the Badging API (`navigator.setAppBadge(n)`) where an installed console supports it, and nothing
  where it doesn't.

**Note**: iOS only once Apple pushes work (paid account, `docs/observability-apple-blockers.md`).

## R9 - "Out for delivery"

**Decision**: in `driver/src/work/load.ts`, in the same transaction, after drops move to `out_for_delivery`:
- find the distinct orders on the moved drops whose `order.delivery_type = 'effy'`;
- call `notify({type: "order_out_for_delivery", subject: {entityId: orderId}, dedupeScope: orderId, channels: ["push"]})`.

The dedupe key makes it once per order, however many loads or parcels (FR-029). Courier orders never ride a delivery
round, and the type check makes that explicit.

The words already exist in the catalogue ("Out for delivery" / "Your order is on the way."). No email: there is no
template, and the spec asks for push and inbox only.

**Alternative**: sending when the round starts (`driver_round.status → in_progress`) is the same moment in this flow,
but it would need the orders found again.

## R10 - "Points about to expire" as a push

**Decision**: `queueExpiryWarnings` asks for `["push", "email"]` instead of `["email"]`. The destination (`points`)
and words already exist, and the dedupe scope (the expiry date) keeps it once.

## R11 - The driver catch-up notice

**Decision**:
- **New type**: `driver_runs_today`, category `work`, importance `important`, destination `today`. No push, because
  the driver is holding the phone; inbox only.
- **When it is checked**: the driver app registers its device on every sign-in and start, so the check runs in
  `POST /driver/v1/devices`, after registering.
- **Condition**:
  1. some `run_assigned` notification for this driver created today on Effy's clock has a push delivery with status
     `no_device`; and
  2. the driver has N > 0 rounds today that are still theirs (planned or in progress).
- **Effect**: `notify` with `dedupeScope = <Effy date>`, so at most once per driver per day (FR-031), and
  `pinnedUntil` = the end of that Effy day.
- **Words**: "You have 2 runs today" / "Open Today to see what's first."

**Rationale**: `no_device` is exactly "no phone of theirs could be told" (seen on 2026-11-07), and registration is
exactly "signed in on a phone". No timer, no new route.

## R12 - Words that carry a number

**Decision**:
- A catalogue entry's `title` and `body` may be a function of the subject. `NotificationSubject` gains
  `count?: number`.
- Only `driver_runs_today` uses it ("1 run" / "N runs").
- The words are still fixed at creation (109 A4).

## R13 - Category labels and icons on the clients

**Decision**: one `INBOX_CATEGORIES` map in `@effy/shared-types` (category → label, plus which audiences may filter
by it), mirrored by a Kotlin `InboxCategory` in each app and pinned by `notification-inbox.fixtures.json`, as
`notification-destinations` is.

Icons are each surface's own (Lucide names agreed in the fixture). An unknown category gets a generic bell and no
filter chip.

## R14 - The item on the wire; items with no known destination

**Decision**: the list item is
`{id, type, category, importance, title, body, destination, createdAt, readAt?, pinnedUntil?, expiresAt?, endsLabel?}`.
- `destination` is the stored object; clients parse it with 109's lenient parser.
- **No known destination**: an item whose destination does not parse for that client (an unknown or future kind)
  opens a **detail view** with the full text (FR-013). Every system type has a destination today, so the detail view
  serves future kinds and long texts.

## R15 - "Ends …" only where it means something

**Decision**:
- `endsLabel` is filled by the server ("Ends Sun", "Ends 5 pm", on Effy's clock) for the categories offers, news,
  announcements and important.
- System reminders that expire for housekeeping (`run_opens_soon`) leave the list silently at their end time, with
  no label.

**Rationale**: "Ends 9:45 am" on "Your run opens soon" reads as nonsense. The rule refines FR-004 without changing
what is listed.

## R16 - Customer app inbox

**Decision**:
- **Screen**: `InboxScreen` + `InboxViewModel` + `InboxRepository` (`features/notifications/`) replace
  `NotificationsScreen`.
- **The bell**: already in every header through `LocalOpenNotifications` (`EffyFrame`). It gains the count from
  `LocalInboxCount`, fed by the app-level badge store (R7). A guest tap goes through the existing deferred sign-in,
  then the inbox.
- **List**: grouped Today / Yesterday / Earlier on `OPERATING_TZ`, with a chip row (All, Unread and the categories
  present).
- **Archive**: swipe, through a new kit row `EffySwipeRow` (`scripts/mobile-guard.sh` bars raw Material controls the
  kit replaces), with undo on the shell snackbar.
- **Detail view**: an `EffySheet`, never a centred dialog.
- **Settings**: the old "Notification settings" row (the phone's settings) becomes a settings icon in the inbox app
  bar until spec 3.
- **Account**: the shortcut keeps opening the same inbox.

## R17 - Driver app inbox

**Decision**:
- **The bell**: on the Today header (top-right), with the count. Today is where a driver starts, and Account is
  rarely opened.
- **Screen**: `InboxScreen` is pushed on the Today stack.
- **List**: All / Unread only, with swipe to archive and undo through the existing snackbar.
- **Taps**: `run` destinations reuse 109's `openFromPush` path, with its "Today if not yours" fallback.

## R18 - Shop console inbox

**Decision**:
- **The bell**: `NotificationBell` in `headerActions` (`routes/app.tsx`), beside `SoundChip`, with the count.
- **Side panel**: the shadcn right Drawer (floating, the overlay rule), holding the first page of 20 and "See all".
- **Page**: `routes/notifications.tsx`. Filter and category live in validated search params (the URL is the state).
  The list scrolls on with `useInfiniteQuery`, Mark all read sits in the page head, and archive is a row action with
  undo in a toast.
- **Loading**: rows in the page's own shape (`PanelSkeleton` / own row skeleton).
- **Guards**: an inbox is a feed, not a list of records, so it is a named exception in `list-screens.guard.test.ts`.
- **Tour**: `notifications` in `features/tours/tours.ts`. Its words go in 106's Tour Inventory, the source
  `tours.test.ts` reads, and in this spec's tour section.
- **Taps**: through `shopPathFor` (109), with the read recorded.

## R19 - Customer website inbox

**Decision**:
- **The bell**: the header chrome is rendered once for everyone, so the bell is a client island.
  - It asks `/api/notifications/unseen-count` (a route handler through the existing proxy). A guest gets 204 and no
    count.
  - When signed in, it opens the live channel (reusing `@effy/web-kit/live`, as `LiveRefresh` does) and re-reads on
    `inbox`.
- **Page**: `/account/notifications`.
  - The server renders the first page; a client island loads more and handles archive, undo, mark all read and taps.
  - Its actions run through Server Actions or `app/api/notifications/*` handlers, using the session cookie.
  - Filters live in the address.
- **Taps**: through a new `customerWebPathFor(destination)` in `@effy/shared-types`, beside `shopPathFor`, pinned by
  the destinations fixtures:

  | Destination | Path |
  |---|---|
  | home | `/` |
  | orders | `/orders` |
  | order | `/orders/{id}` |
  | points | `/account/points` |
  | product | `/product/{id}` |
  | aisle | `/search?category=` |
  | search | `/search?q=` |
  | sale | `/offers` |

- **Guards**: `/account` is already an account route. `dependency-cruiser.first-load.cjs` must stay green; the bell
  island loads the channel client only after a signed-in answer.

## R20 - Analytics

**Decision**: new events, documented in `docs/telemetry/platform-events.md`. None carries personal data.

| Event | Fields |
|---|---|
| `inbox_opened` | `{surface}` |
| `inbox_item_opened` | `{type, category, fallback}` |
| `inbox_item_archived` | `{type, category}` |
| `inbox_archive_undone` | `{type, category}` |
| `inbox_marked_all_read` | `{}` |

109's `notification_opened` stays for push taps.

## R21 - Effy's clock for grouping

**Decision**: clients group by date on `OPERATING_TZ` (`@effy/shared-types` on the web; the apps' build-time value),
so "Today" means Effy's today, as everywhere else.

## R22 - One writer per kind of write, guarded

**Decision**:
- **`inbox.ts`**: the list, count, seen, read-all and archive.
- **`notifications.guard.test.ts`**: a notification's state may now change in `read.ts` and `inbox.ts`.
- **`notify.ts`**: stays the only creator, and gains `pinnedUntil`.
