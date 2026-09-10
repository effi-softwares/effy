# Research: Shop Console — Today & Insights (058)

The external research the brief required (industry practice, webhook reliability, and cost at 10k and
500k orders/month, with sources) is the standalone deliverable
**[docs/insights-architecture.md](../../docs/insights-architecture.md)** (FR-030). This file records the
decisions that follow from it and from reading this codebase. Each decision gives what was chosen, why,
and what was rejected.

---

## R1 — Which path serves what (Principle III)

**Decision.**

| Concern | Path | Where |
|---|---|---|
| Today snapshot `GET /shop/v1/today` | Cold | `apis/edge-api/shop` |
| Insights `GET /shop/v1/insights?range=` | Cold | `apis/edge-api/shop` |
| Team activity `GET /shop/v1/team-activity` | Cold | `apis/edge-api/shop` |
| Batch pick lists `GET /shop/v1/pick-lists` | Cold | `apis/edge-api/shop` |
| Rollup job (every minute) + nightly reconciliation | Cold (scheduled) | `apis/edge-api/shop` |
| **Live stream `GET /v1/shop/live` (SSE pokes)** | **Hot — recorded exception** | `apis/core-api` |

**Rationale.** The shop console is an internal operator console, which is the cold path's job, and every
*read* stays there. The live stream is the one exception, and it is forced rather than chosen: the
HTTP API has a **30-second maximum integration timeout** (architecture doc [S15]), so a Lambda behind the
shared gateway cannot hold a stream, and `core-api` on Fargate is the platform's only long-running
process. It already verifies shop-pool tokens (057 US5), so no new pool wiring is needed. The stream
carries **no data** — only "something changed at your shop" — so no shop read moves to the hot path.

**Rejected.** Lambda response streaming (needs a function URL or REST API outside the shared gateway and
its per-pool authorizers; still capped per invocation). API Gateway WebSocket (a new stateful service
plus a connection table, and still needs a database listener — architecture doc §4.2). Serving the
snapshot itself over the stream from `core-api` (would move shop reads onto the hot path and duplicate
`edge-shop`'s gate and queries in Go).

⚠ `core-api/cmd/core-api/main.go` carries the comment "this line is the whole of the shop's reach into
core-api". This slice adds a second shop route, and that comment MUST be updated in the same change —
it is the kind of claim that stays true only while someone maintains it.

---

## R2 — Realtime transport: SSE pokes, snapshot refetch, polling fallback

**Decision.** `core-api` serves `text/event-stream`. Each event is a **poke** (`event: poke`, no data
beyond an opaque sequence number) or a **resync** (`event: resync` — "refetch, you may have missed
something"). On every poke the client invalidates the TanStack Query key `['shop','today']` (debounced
400 ms). On every (re)connect it refetches. While the stream is not open, the same query polls every
**30 s** with `If-None-Match`; while it is open, a **120 s** safety refetch runs anyway. The UI does not
branch on the mode (FR-028).

**Rationale.** Architecture doc §2 and §4: cheapest by an order of magnitude at 500k, reuses the ALB and
Fargate task that already exist, and the poke pattern makes backfill, ordering and exactly-once
properties of the snapshot rather than of the stream (§2.2). Every row still comes from a query, so a
simulated or not-yet-stored row is structurally impossible (FR-009).

**Rejected.** Pure polling at 5 s (≈$198/mo + a database resize at 500k); hosted realtime providers
($25–$110/mo at 500k and they still need the listener); `Last-Event-ID` resumption (it is exactly the
"assume continuity" the brief forbids).

---

## R3 — The stream's shape and limits

**Decision.**

- **Auth.** `Authorization: Bearer <shop access token>`, verified by `core-api`'s existing shop
  `PoolVerifier`. Then a gate — **active operator at an active shop** — resolved from `public.shop_staff`
  / `public.shop` by `cognito_sub`, the same predicate `edge-shop`'s `gate()` uses. Refused → `403`
  before any bytes are streamed. The stream subscribes to **that operator's shop only**; no shop id is
  accepted from the client.
- **Client.** `EventSource` cannot send headers (WHATWG, doc [S14]), so the client reads the stream with
  `fetch` + `ReadableStream` and a small, tested SSE parser in **`@effy/web-kit`** (`runtime/live.ts`)
  — shared so back-office can use it later (Principle II). No new dependency: the format is four line
  types.
- **Heartbeat.** A comment line every **20 s** (the module's ALB idle timeout is 120 s; 20 s also keeps
  intermediaries honest).
- **Bounded lifetime.** The server ends each stream after **15 minutes**; the client reconnects and so
  re-presents a fresh token and re-passes the gate. This bounds a deactivated operator's stream to
  15 minutes even with no poke (spec edge case). Their *data* stops sooner: any refetch hits
  `edge-shop`'s gate and fails closed.
- **Reconnect.** Capped exponential backoff with jitter (1 s → 30 s). Every successful connect begins
  with a `resync`.
- **Fan-out throttle.** At most one poke per shop per 500 ms, trailing edge (a 20-line pick burst is one
  refetch, not 20).
- **Abuse bound.** At most 5 concurrent streams per `sub`; a sixth closes the oldest.
- **Hidden tab.** The stream closes when the document is hidden for more than 60 s and reopens (with a
  resync) on return — the same bargain `refetchIntervalInBackground: false` made in 020 R8.
- **CORS.** `core-api`'s allowed origins must include the shop-web origin (057 needed it for the
  refund; verify `CORS_ALLOWED_ORIGINS` in the dev env).

---

## R4 — Refunds are dated on the day they are issued (spec amended)

**Decision.** A refund reduces revenue in the bucket of `refund.created_at` (shop timezone), not the
bucket of the sale. **FR-032 was amended** from "the bucket the order was paid in".

**Rationale.** Shopify's sales reports record reversals "as a negative number on the date the return was
processed" (doc [S1]). A reported past day then never changes because of something that happened later —
so a CSV exported yesterday still agrees with today's screen, and only a correction to the refund itself
(a later `failed`) reaches back. Dating by sale would make every historical bucket invalidatable by any
future refund, for a figure nobody reads that way.

**Rejected.** Sale-date attribution (the spec's first draft). Recorded in the spec's Clarifications as a
plan-phase amendment (Principle I: fix the earliest artifact).

---

## R5 — Rollup design

**Decision.** Two tables (data-model §2), recomputed from source per dirty bucket:

- `public.shop_sales_hour (shop_id, bucket_start, …)` — `bucket_start` is the UTC instant a local hour
  began in the shop's timezone (doc §1.3).
- `public.shop_product_sales_day (shop_id, local_date, product_id, …)`.
- `public.insights_dirty (shop_id, bucket_start)` — the work queue; `ON CONFLICT DO NOTHING`.
- `public.insights_state (shop_id, timezone, computed_at)` — the watermark and the timezone the rollups
  were built under.

**Job** (`insightsRollup`, every minute): claim up to 500 dirty rows `FOR UPDATE SKIP LOCKED`, recompute
each `(shop, hour)` from `order` / `order_item` / `refund` / `refund_line` / `fulfillment_event`,
recompute the product-day rows for each affected local date, upsert, delete the claimed rows, set
`computed_at = now()` for each touched shop — all in one transaction per shop. It also marks the
**current hour of every shop with activity in the last hour** dirty, so an idle shop's `computedAt` stays
honest. **Nightly** (`insightsReconcile`, 03:30 Melbourne): recompute the last 35 local days for every
shop, count rows it changed, emit `insights_reconcile_corrections` — non-zero is an alarm, because it
means a writer bypassed the dirty marks. A shop whose `shop.timezone` differs from
`insights_state.timezone` is rebuilt in full.

**Backfill.** The migration seeds `insights_dirty` with every `(shop, hour)` that has a paid order or a
refund, so the first job runs build history; the job processes 500 rows a minute, so dev's history
builds in minutes and prod's volume in well under an hour.

**Rejected.** Materialized views, incremental `+=` rollups, a columnar store, Timescale (doc §1.2).

---

## R6 — Postgres triggers: the platform's first, and what they may do

**Decision.** One migration adds `AFTER` row triggers whose functions do exactly two things:
`pg_notify('shop_ops', shop_id::text)` and `INSERT INTO public.insights_dirty … ON CONFLICT DO NOTHING`.
Nothing else — no business rules, no reads beyond resolving the shop, no writes to operational tables.

| Table | When | Poke | Dirty bucket |
|---|---|---|---|
| `shop_fulfillment` | INSERT; UPDATE OF `status` | ✅ | ✅ (status → `unfulfillable`/`withdrawn`: the hour of the change) |
| `fulfillment_item` | INSERT; UPDATE OF `gathered_quantity`, `unavailable_quantity` | ✅ | — |
| `product` | UPDATE OF `stock_on_hand`, `low_stock_threshold`, `stock_tracked`, `status` | ✅ | — |
| `order` | UPDATE OF `status` (→ `paid`, → `canceled`) | ✅ each shop on the order | ✅ each shop, hour of `placed_at` |
| `refund` | INSERT; UPDATE OF `status` | ✅ each shop with goods on the order | ✅ each such shop, hour of `refund.created_at` |
| `refund_proposal_dismissal` | INSERT | ✅ | — |

**Rationale.** Six services on two backends write these tables (doc §2.3). A call in application code
has to be remembered by every one of them now and every future one; a trigger cannot be forgotten, and
`NOTIFY` is transactional — delivered only if the change commits (doc [S17]). The rollup dirty mark has
the same many-writers problem, and it must land in the same transaction as the change or a crash between
them loses a correction.

**Constraints, enforced by a test** (`db/triggers.guard.test` in edge-shop's container suite): every
trigger function in `public` is listed in an allow-list with its two permitted statement kinds; a new
trigger, or a trigger doing anything else, fails the suite naming the function. A container test
proves the dirty mark lands atomically (a rolled-back refund leaves no mark and no poke).

**Cost to writers.** One index-backed insert and one in-memory notify per row changed. `FinalizeSucceeded`
gains roughly one dirty insert per shop on the order — measured in the container suite against the
existing payment test, and bounded by `SC-004`.

**Rejected.** Application-code pokes in every writer (the 054 failure mode); logical decoding / WAL
streaming (a replication slot and a consumer process for a signal that fits in `NOTIFY`); the unbuilt
SNS backbone (the right home for domain events, the wrong one for a UI invalidation hint — see R19).

---

## R7 — What each figure means (definitions the rollup implements)

All money is AUD, from stored amounts, never recomputed from prices. "Paid" means
`order.status IN ('paid','canceled')` — a cancelled order *was* paid; its cancellation is a refund.

| Figure | Definition |
|---|---|
| **Revenue** | Σ this shop's `order_item.line_subtotal_amount` on orders paid in the bucket (by `placed_at`) **minus** this shop's attributed refunds issued in the bucket (R4). Excludes delivery fee and order-level discount (FR-032). |
| **Orders** | Count of this shop's portions whose order was paid in the bucket. |
| **Average order value** | Gross goods ÷ orders, for the window. Gross, like Shopify's AOV — a refund issued today does not change the value of yesterday's orders. |
| **Refunds** | Σ refunds attributed to this shop, issued in the window, with `status IN ('submitted','succeeded')` (money on its way or gone). `submitting`, `failed`, `refused` are excluded. |
| Attribution | `item` refunds: Σ `refund_line.amount` on this shop's `order_item`s. `cancellation` refunds (no lines): this shop's goods on the order minus its already-counted item refunds, floored at 0. `goodwill` / `external`: **not attributed** — they have no lines, and are Effy's gesture, not the shop's goods. |
| **Can't supply** | Portions whose `fulfillment_event` records `to_status = 'unfulfillable'` in the window; delta = Σ unavailable units on them. |
| **Cancelled** | Portions whose `fulfillment_event` records `to_status = 'withdrawn'` in the window. |
| **Top products** | Per product: Σ units and Σ gross goods sold in the window, top 5 by gross goods; share bar = revenue ÷ the top row's. |
| **Ready for pickup** | *Live*, from the Today snapshot: portions in `ready_for_pickup`. |
| **Low stock SKUs** | *Live*, from the Today snapshot: tracked products at or below threshold; delta = how many are at 0. |

**Why events, not current status, for Can't supply / Cancelled**: `shop_fulfillment.state_changed_at`
is overwritten by later transitions, while `fulfillment_event` is append-only (020) — the rollup should
be recomputable from facts that do not move.

⚠ **Orders and Revenue use different "totals" from the Orders list on purpose.** A Live orders row shows
the order's `grand_total_amount` (the same number the Orders list shows — 057 A3), while Revenue counts
only this shop's goods. The Insights subtitles say "goods, AUD" so an operator is not left reconciling a
$80 order against a $30 revenue step. Recorded as a risk to watch in the walk.

---

## R8 — The Today snapshot and "one computed value" (FR-006)

**Decision.** `GET /shop/v1/today` returns one object whose `backlog` field —
`{ awaitingPick: { orders, units, oldestPaidAt } }` — is the only place those numbers are computed.
Awaiting pick = portions in `pending` or `received` (the Orders list's *Awaiting pick* tab — the same
`CASE WHEN sf.status IN ('pending','received') THEN 'new'` expression, imported, not retyped). Units =
Σ `order_item.quantity` on those portions. The Needs attention row, its unit figure, the open-items badge,
the glance cell, and both Insights cells render from this field of **one** cached query.
`useNavBadges` moves onto the same query, so the rail badge agrees too.

**Rationale.** The spec's strongest invariant is that these can never disagree; two queries, even of
the same rule, can disagree for a render. One field of one cache entry cannot.

---

## R9 — Comparisons are computed by the server (FR-024)

**Decision.** Every figure is `{ value, previous, change: { kind: 'pct' | 'abs' | 'none', amount },
basis }`, where `basis` is one of `same_weekday_last_week` / `previous_7_days` / `previous_30_days`.
The client turns that into "+12% vs last Monday" and never subtracts. `kind: 'none'` when the previous
value is zero or the comparison window predates the shop's first order, rendered as "Nothing to compare
yet" (spec edge case).

- **Today** compares with the same weekday last week **up to the same local time** — comparing a
  morning with a whole day would read as a decline every morning.
- Money and AOV are `pct`; counts are `abs` ("+4 vs last Monday"), as the mockup shows.

---

## R10 — Chart buckets

- **Today**: one bar per local hour from the earlier of 06:00 or the first hour with activity, to the
  current hour. DST days carry the extra/missing hour (R5).
- **7 days**: seven local days ending today.
- **30 days**: the ISO weeks (Monday start) intersecting the 30-day window, labelled `W35`; a partial
  first or last week is marked `partial: true` so the tooltip can say so.
- The final bucket is emphasised with the primary fill (the monochrome accent), others muted.

---

## R11 — Timezone storage and the city label

**Decision.** `public.shop.timezone text NOT NULL DEFAULT 'Australia/Melbourne'`. No editor in this
slice (back-office can set it later). The service validates it against `pg_timezone_names` on read and
falls back to the default with a logged warning rather than rendering a wrong day. The subtitle's city
is derived from the IANA name (`Australia/Melbourne` → "Melbourne"). The weekday and date are formatted
with `Intl.DateTimeFormat('en-AU', { timeZone })` in the browser from the **server's** `now` and the
shop's timezone, so a client clock in another zone cannot shift the day.

---

## R12 — Needs attention items

| Kind | Source | Detail line | Action → | Age for "Oldest item waiting" |
|---|---|---|---|---|
| Awaiting pick | R8 backlog | "{units} units to pack · oldest {age}" | `Pick` → `/orders?tab=new` | oldest `placed_at` |
| Out of stock | tracked products, on hand 0, `status='active'` | "{n} sold in the last 7 days, 0 on hand" (or "0 on hand") | `Restock` → product | last `stock_movement` for it |
| Below reorder point | tracked, on hand ≤ threshold, > 0 | "{on hand} on hand, {d} days of cover" (cover omitted without sales) | `Review` → product | last `stock_movement` |
| Refund to approve | 055's derived proposals, **this shop's lines only**, managers only | "{order number} · {amount}" | `Approve` → that order | the portion's `state_changed_at` |

**Days of cover** = `floor(on_hand ÷ (units sold in the last 7 days ÷ 7))`, from `stock_movement` rows
with `reason = 'order_paid'`.

**The proposal rule is promoted, not copied.** `proposedRefunds()` lives in `edge-orders`; its SQL moves
to `@effy/edge-shared` as a function with an optional shop scope, and both services call it (Principle
II — the same move 028 made with the presign helper, and edge-orders' suite passing unmodified is the
proof it changed nothing).

Ordering: awaiting pick first, then out of stock, then refunds, then low stock; each kind oldest first.
Capped at 8 rows with "+{n} more" in the footer's `Open queue →`.

---

## R13 — Quick actions and the header buttons

| Row | Implementation |
|---|---|
| New product | navigate `/catalog/new` (the 057 wizard route) |
| Print pick lists | `GET /shop/v1/pick-lists` (awaiting-pick portions, ≤ 100, oldest first) → one print window with one page per order, via the **same renderer** as the order detail's "Print pick list" (extracted from `OrderDetailScreen.tsx` to `features/fulfillment/pickList.ts`); toast "{n} pick lists sent to printer" once the print window opens. Unavailable when the backlog is 0. |
| Receive stock | toast "Pick a product to receive stock into" → `/catalog` |
| Open the attention queue | `/orders?attention=at_risk&sort=placed&dir=asc` — URL state, **not** a saved-views row (057 FR-026) |
| Export orders | the Orders list's existing CSV export with its default filters |
| Open insights | `/insights` |

The mockup's `New order`, `Discount code`, `Message a customer` and both dialogs are **not built**
(FR-011); a source guard (`today-refusals.guard.test.ts`) reads `features/today/` and fails naming the
file if any of the three labels, or the strings "orders@effy.shop" / "New discount code" / "Message a
customer", appear in non-comment source — word-bounded, over comment-stripped text (the lesson from
057's FR-012 guard, which let `<RotateCcw />Capture payment` through).

---

## R14 — Team activity

**Decision.** `GET /shop/v1/team-activity` returns the newest 50 entries from the last 14 days, merged
from `fulfillment_event` (state changes, picks, notes, tags), `stock_movement` (`actor_kind='shop'`,
joined to `shop_staff` by `actor_sub = cognito_sub`), and `refund` (`actor_kind='shop'`). Every entry is
scoped to this shop. The actor is the staff member's name; `system` and `back_office` actors render as
**"Effy"** — a shop is not told which Effy employee acted (the same boundary 023 FR-018 draws for
customers, applied to staff). A departed staff member (`actor_staff_id` NULL) renders as "A former team
member" — 020's comment: NULL means "the person is gone", never "nobody did it".

---

## R15 — Design and the colour law (FR-031)

| Mockup | Built as |
|---|---|
| `--warning-soft` / `--warning` count badge | `bg-muted` + foreground, mono |
| Warning tone dots | foreground dot for warning, `--destructive` dot for out of stock (a non-text marker of an actual problem), muted for others |
| `New` badge: success-soft fill, success text | secondary badge with a **success dot** — the success colour stays a non-text indicator (constitution Principle V: 4.00:1) |
| Newest row: success-soft background | `bg-muted` |
| Pulsing success dot | kept (non-text); pulse disabled under `prefers-reduced-motion` |
| Deltas "in a semantic colour" | muted text with ▲ / ▼ / – glyph; direction is in the glyph and the sign, never in colour alone |
| "SEK incl. VAT" | "Goods · AUD" |
| Geist, radii, spacing | the 057 shop token layer (`shop.css`) — unchanged |

**Components.** shadcn `Sheet`, `Button`, `Badge`, `Tabs` (segmented range control) from
`@effy/design-system/ui`. The two dialogs the brief lists are not built (FR-011), so `Dialog` and
`Select` are not needed. Bars are plain `div`s, as the mockup draws them — no chart library, and so no
`--chart-*` palette use.

**Principle V "no card layouts"** — see plan Complexity Tracking.

---

## R16 — Insights CSV export

**Decision.** Client-side, from the payload on screen (FR-015 "the figures shown"): one section per
strip, both chart series, and top products, with the window and `computedAt` in a header row. No new
route. A `Blob` download — shop-web is a normal SPA, not a sandboxed artifact.

---

## R17 — Freshness targets and how they are met

| Target | Mechanism |
|---|---|
| SC-002 live: new order on Today ≤ 10 s p95 | commit → NOTIFY (ms) → core-api → SSE (ms) → debounced refetch (400 ms) → Lambda (≤ 1 s warm) |
| SC-002 fallback ≤ 30 s | 30 s polling while the stream is down |
| SC-004 Insights ≤ 1.5 s p95 | one Lambda, three indexed rollup reads (≤ 2,900 hour rows + ≤ 5 product rows) |
| SC-004 ≤ 5 min behind | 1-minute job + ≤ 500 buckets/run; alarm when the oldest dirty row is > 4 min old |

---

## R18 — Telemetry (Principle VII)

- **PostHog** (shop-web consoles are on-by-default since 050): `today_viewed`, `today_attention_acted`
  (`kind`), `quick_action_used` (`action`), `insights_viewed` (`range`), `insights_range_changed`,
  `insights_drilled` (`metric`), `insights_exported`. No PII; no order numbers.
- **Metrics** (`core-api` Prometheus): `shop_live_streams` (gauge), `shop_live_pokes_total`,
  `shop_live_listener_reconnects_total`. Low-cardinality — **no shop label**.
- **Structured logs / CloudWatch** (edge-shop): `insights.rollup` (buckets, duration, backlog age),
  `insights.reconcile` (corrections).
- **Alarms** (Terraform, existing alerts SNS): rollup backlog age > 4 min; reconcile corrections > 0;
  rollup Lambda errors.

---

## R19 — Relationship to the event backbone (Principle VI)

The poke is **not** a domain event and must not become one: it carries a shop id, has no envelope, and
no business process may consume it. Principle VI's "one event language … to the shared topic" governs
domain events, and this slice publishes none. When the SNS backbone lands, the triggers stay as a UI
invalidation mechanism. Recorded in Complexity Tracking so a later reader does not mistake `shop_ops`
for a second bus.

---

## R20 — Shop-mobile parity

shop-mobile gets neither screen in this slice. The shop audience's parity register
(`docs/audiences/shop-capabilities.md`) records Today and Insights as web-only, outstanding on mobile,
with the reason: the tablet app's home is the pick queue, and a mobile client would need a native SSE
client (or the polling fallback) — its own slice.
