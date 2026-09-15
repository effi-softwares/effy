# Tasks: Shop Console — Today & Insights (058)

**Input**: Design documents from `/specs/058-shop-today-insights/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md), and the
research deliverable [docs/insights-architecture.md](../../docs/insights-architecture.md) (FR-030 —
already written; no task re-opens it).

**Tests**: INCLUDED, and not optional here. Every slice on this platform ships with unit tests, a
container test against the real migrations where SQL is involved, and a **negative proof** (the guard
is broken on purpose to prove it fires). 039 shipped four live defects with a fully green suite, so
tests are the floor, not the ceiling — the quickstart walk is what actually signs this off.

**Organization**: by user story, in spec priority order. Each story is a working increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelisable — different files, no dependency on an unfinished task
- **[Story]**: US1…US5 from [spec.md](spec.md); setup, foundational and polish carry no story label

## Path Conventions

Monorepo (plan.md § Project Structure): `db/migrations/`, `packages/*/src/`,
`apis/edge-api/*/src/`, `apis/core-api/internal/`, `apps/shop-web/src/`.

---

## Phase 1: Setup

**Purpose**: know what is already broken before touching anything, and create the folders every later
phase writes into.

- [X] T001 Record the pre-existing baseline in `specs/058-shop-today-insights/BASELINE.md`: run `pnpm -r typecheck`, `pnpm -r test` (note the package count, not just "pass" — 029), `make core-test`, and `CONTAINER_TESTS=1 pnpm --filter @effy/edge-shop test`, and write down every failure that exists at HEAD (053 and 054 both record pre-existing red gates; this slice must not be blamed for them, and must not hide behind them)
- [X] T002 [P] Create the empty slice folders: `apis/edge-api/shop/src/{today,insights,team-activity,pick-lists,db}/`, `apps/shop-web/src/features/{today,insights}/`, `apis/core-api/internal/features/shoplive/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the migration, the shared contracts and the two promotions every story below depends on.

**⚠️ CRITICAL**: no user story starts until T012 is green.

- [X] T003 Create the migration `db/migrations/<ts>_shop_insights.sql` (`make db-new NAME=shop_insights`) with `public.shop.timezone text NOT NULL DEFAULT 'Australia/Melbourne'` and the `public.shop_local_hour(ts timestamptz, tz text) RETURNS timestamptz IMMUTABLE` function — the one bucketing rule the triggers, the job and the reads all call (data-model §1, §3)
- [X] T004 Add the four tables to the same migration — `public.shop_sales_hour`, `public.shop_product_sales_day`, `public.insights_dirty`, `public.insights_state` — with the PKs, FK indexes, `CHECK (>= 0)` constraints and a `COMMENT ON TABLE` for each saying why it exists (data-model §2)
- [X] T005 Add the six trigger functions and their `AFTER` triggers to the same migration (`shop_ops_poke_portion`, `shop_ops_poke_item`, `shop_ops_poke_product`, `shop_ops_order_status`, `shop_ops_refund`, `shop_ops_poke_dismissal`), each doing **only** `pg_notify('shop_ops', <shop_id>)` and/or an `ON CONFLICT DO NOTHING` insert into `insights_dirty` (data-model §3, research R6)
- [X] T006 Add the backfill to the same migration: seed `insights_dirty` with every `(shop, hour)` that has a paid order or a refund, so the first job runs build history (research R5); write the `-- +goose Down` half
- [X] T007 [P] Add the DTOs in `packages/shared-types/src/shop-insights.ts` (`ShopTodayDTO`, `ShopAttentionItemDTO`, `ShopLiveOrderDTO`, `ShopInsightsDTO`, `InsightsFigureDTO`, `ShopTeamActivityDTO`, `ShopPickListsDTO`) exactly as `contracts/shop-today-insights.contract.md` defines them, money as decimal strings and counts as `WireInt`, and export them from `packages/shared-types/src/index.ts`
- [X] T008 [P] Promote 055's refund-proposal rule to `apis/edge-api/shared/src/lib/refund-proposals.ts` with an optional shop scope (`order_item.shop_id`), and make `apis/edge-api/orders/src/orders/refunds.ts` call it instead of holding its own SQL (Principle II, research R12)
- [X] T009 Run `pnpm --filter @effy/edge-orders test` and confirm it passes **unmodified** — the proof the promotion in T008 changed no behaviour (the same proof 028 used for the presign helper)
- [X] T010 [P] Extract the pick-list renderer from `apps/shop-web/src/features/fulfillment/OrderDetailScreen.tsx` into `apps/shop-web/src/features/fulfillment/pickList.ts`, and have the order detail import it — one renderer, two call sites (the batch print in US4 is the second)
- [X] T011 Write the trigger allow-list guard `apis/edge-api/shop/src/db/triggers.guard.test.ts`: enumerate every trigger function in `public` and fail naming any function that is not in the allow-list or that performs a statement other than `pg_notify` / the dirty insert (research R6)
- [X] T012 Container test `apis/edge-api/shop/src/db/triggers.container.test.ts` against the real migrations: a committed refund writes exactly one dirty row and one poke; a **rolled-back** refund writes neither; a 20-line pick in one transaction collapses to one poke (Postgres dedupes identical payloads)

**Checkpoint**: schema, contracts and both promotions are in place and proven.

---

## Phase 3: User Story 1 — What needs doing right now (Priority: P1) 🎯 MVP

**Goal**: Today replaces the dashboard and answers "what needs me?" — the pick backlog, out-of-stock and
low-stock products, and refunds waiting on a manager — each with a button that opens the thing that
resolves it.

**Independent Test**: seed a shop with two orders awaiting pick (five units), one tracked product at 0 on
hand and one below threshold; open the console and confirm the figures agree everywhere, each button
lands correctly, and picking one order moves every figure together (within the 30 s fallback, which is
all this story has until US2).

⚠ **The glance strip is deliberately NOT in this story.** Three of its four cells are analytics, and
FR-014 requires them to equal Insights' Today values — which cannot be true before the rollups exist
(FR-026). It is built in US3, from the same query Insights uses. US1's backlog figures are visible in
Needs attention and on the nav badge, and that is where their agreement is tested.

### Implementation for User Story 1

- [X] T013 [P] [US1] Define the domain types in `apis/edge-api/shop/src/today/types.ts` (backlog, attention item kinds, live row) — nothing wire-shaped escapes the handler (Principle VI)
- [X] T014 [US1] Implement `apis/edge-api/shop/src/today/repository.ts` in raw SQL: the awaiting-pick backlog (`pending`/`received`, Σ `order_item.quantity`, oldest `COALESCE(placed_at, created_at)`), ready-for-pickup, out-of-stock and low-stock products with units sold in the last 7 days from `stock_movement` (`reason='order_paid'`), and the five most recently paid portions — reusing the Orders list's own tab expression rather than retyping it (research R8, R12)
- [X] T015 [US1] Implement `apis/edge-api/shop/src/today/service.ts`: compose the snapshot, order the attention list (awaiting pick → out of stock → refunds → low stock, oldest first within each kind), cap it at 8 with `attentionMore`, compute `oldestWaitingAt`, and include refund proposals **only** for `shop_manager` via the promoted rule from T008 (FR-004d, research R12)
- [X] T016 [US1] Add the handler `apis/edge-api/shop/src/functions/today-v1-get.ts` plus the `GET /shop/v1/today` route in `apis/edge-api/shop/serverless.yml`, behind the shop authorizer, with `ETag` + `Cache-Control: private, no-cache` and `304` on `If-None-Match` (contract § `GET /shop/v1/today`)
- [X] T017 [P] [US1] Unit tests in `apis/edge-api/shop/src/today/service.test.ts`: attention ordering, the 8-item cap, manager-only proposals, days-of-cover omitted when a product has no recorded sales
- [X] T018 [US1] Container tests in `apis/edge-api/shop/src/today/repository.container.test.ts` against the real migrations: backlog counts and units, oldest-paid instant, shop scoping (another shop's portions never appear), and the five-most-recent ordering
- [X] T019 [P] [US1] Add `todayQuery` in `apps/shop-web/src/features/today/queries.ts` — 30 s `refetchInterval` with `refetchIntervalInBackground: false` (the fallback path; US2 makes it live), keyed `['shop','today']`
- [X] T020 [P] [US1] Add `apps/shop-web/src/features/today/model.ts`: the Part A copy builders verbatim ("{n} orders awaiting pick", "{units} units to pack · oldest {age}", "Cleared items drop off automatically", "Showing the five most recent orders"), the age formatter, and the relative-time formatter ("Just now" / "1 min ago" / "{n} min ago")
- [X] T021 [US1] Build `apps/shop-web/src/features/today/TodayScreen.tsx`: the header with title `Today`, the derived "{weekday} {d} {month} · {city}" subtitle (from the snapshot's `now` + `timezone` via `Intl.DateTimeFormat('en-AU')`, research R11), and the three header buttons in order (`Quick actions`, `Team activity`, `Print pick lists` — wired in US4), inside the priority-row grid that collapses to one column under 1100px
- [X] T022 [P] [US1] Build `apps/shop-web/src/features/today/NeedsAttention.tsx`: header with subtitle + count badge (`bg-muted`, mono — no warning hue, research R15), one row per item with a tone dot, title, detail and a verb-specific 30px outline button (`Pick` / `Restock` / `Review` / `Approve`) that navigates to the resolving screen, and the footer band with `Open queue →`
- [X] T023 [P] [US1] Build `apps/shop-web/src/features/today/LiveOrders.tsx`: the pulsing success dot (non-text, disabled under `prefers-reduced-motion`), `Updating as orders arrive`, `All orders →`, rows of order number / customer / meta / total, and the footer band — rendering from the snapshot only; every row opens that order's detail (FR-009)
- [X] T024 [US1] Show the calm steady state when `attention` is empty, reusing `apps/shop-web/src/features/dashboard/EmptyState.tsx`'s copy and moving it to `features/today/` (FR-007, 057 FR-008)
- [X] T025 [US1] Point `/` at `TodayScreen` in `apps/shop-web/src/routes/app.tsx`, rename the nav item "Dashboard" → "Today" in `apps/shop-web/src/components/layout/nav.ts`, move `useNavBadges` onto `todayQuery`'s `backlog.awaitingPick.orders`, and delete `apps/shop-web/src/features/dashboard/` (its two screens are superseded)
- [X] T026 [P] [US1] Tests in `apps/shop-web/src/features/today/__tests__/today.test.tsx`: the FR-006 agreement test (the Needs attention title, its unit figure, the badge and the nav badge all render from one query field), Part A copy verbatim, the steady state, each button's destination, and the manager/staff difference for the refund row
- [X] T027 [US1] Negative proof for FR-006: render the glance-equivalent figure from a second query, confirm the agreement test fails, then revert (quickstart §1)

**Checkpoint**: the console lands on a working Today that tells an operator what needs doing, refreshed every 30 s.

---

## Phase 4: User Story 2 — New orders appear as they are paid (Priority: P1)

**Goal**: an order paid while Today is open shows up within seconds, its relative time ages on its own,
and a dropped connection heals by rebuilding from stored state rather than assuming continuity.

**Independent Test**: with Today open, complete a Stripe test checkout containing this shop's product;
the row appears within 10 s carrying `New`, the marker clears after 60 s, the label ages without a
reload, and cutting the network for two minutes then restoring it shows every order paid in the gap,
once each.

### Implementation for User Story 2

- [X] T028 [P] [US2] Implement `apis/core-api/internal/features/shoplive/listener.go`: one dedicated pgx connection running `LISTEN shop_ops` with `WaitForNotification`, capped exponential backoff on error, and a broadcast of `resync` to every subscriber after any reconnect (research R3, architecture doc §2.3)
- [X] T029 [P] [US2] Implement `apis/core-api/internal/features/shoplive/hub.go`: subscribers keyed by shop id, non-blocking per-subscriber send (a slow client is dropped, not waited on), a 500 ms trailing-edge throttle per shop, and a cap of 5 concurrent streams per `sub`
- [X] T030 [US2] Implement `apis/core-api/internal/features/shoplive/gate.go`: resolve the shop from `shop_staff.cognito_sub`, require operator `status='active'` at a shop with `status='active'`, refuse with a uniform `403` before any bytes are streamed — the shop id never comes from the request
- [X] T031 [US2] Implement `apis/core-api/internal/features/shoplive/handler.go`: `GET /v1/shop/live` as `text/event-stream` with `retry: 3000`, a `resync` first, `: hb` every 20 s, `data: {}` on every event, and a 15-minute server-side close that forces re-authentication (contract `shop-live-stream.contract.md`)
- [X] T032 [US2] Register the route in `apis/core-api/cmd/core-api/main.go` behind the existing shop `PoolVerifier`, start the listener at boot (a listener that cannot connect answers `503` so clients fall back), and ⚠ update the comment that claims the refund route is "the whole of the shop's reach into core-api" — it is now two (research R1)
- [X] T033 [P] [US2] Add the Prometheus metrics `shop_live_streams` (gauge), `shop_live_pokes_total` and `shop_live_listener_reconnects_total` — no shop label (Principle VII, low cardinality)
- [X] T034 [P] [US2] Go tests `apis/core-api/internal/features/shoplive/{hub,handler}_test.go`: throttling collapses a burst, a dropped-slow-subscriber never blocks the hub, the per-sub cap closes the oldest, the handler emits `resync` first and heartbeats on schedule, and every frame's payload is exactly `{}`
- [X] T035 [US2] Go container test `apis/core-api/internal/features/shoplive/listener_container_test.go`: a committed change to `shop_fulfillment` reaches a subscriber for that shop and no other; killing the listener's connection produces a `resync` on recovery
- [X] T036 [P] [US2] Build the SSE reader `packages/web-kit/src/runtime/live.ts`: `fetch` + `ReadableStream` with an `Authorization` header (`EventSource` cannot send one — research R3), a small SSE parser, capped backoff with jitter, a 45 s stall timer, close-when-hidden-60 s, and full cleanup on abort; export it from `packages/web-kit/src/index.ts`
- [X] T037 [P] [US2] Tests `packages/web-kit/src/runtime/live.test.ts`: parsing events/comments/multi-line frames, reconnect with backoff, the stall timer firing, and that abort leaves no timer or reader open
- [X] T038 [US2] Add `apps/shop-web/src/features/today/useShopLive.ts`: subscribe on mount, invalidate `['shop','today']` on `poke` (debounced 400 ms) and on `resync`, drop `todayQuery`'s 30 s interval to a 120 s safety refetch while the stream is open and restore it when it is not, and tear everything down on unmount (FR-028, FR-029)
- [X] T039 [P] [US2] Add `apps/shop-web/src/features/today/useNow.ts`: a ~15 s render tick so relative times age without new data, cleared on unmount (FR-029)
- [X] T040 [US2] Wire the ageing rules into `LiveOrders.tsx`: the `New` marker only under 60 s (a secondary badge with a success **dot**, never green text — research R15), the newest arrival on `bg-muted`, and the meta line "{relative time} · {n} items · {delivery method}"
- [X] T041 [P] [US2] Tests in `apps/shop-web/src/features/today/__tests__/live.test.tsx`: the marker clears at 60 s, labels advance on the tick, a poke triggers exactly one refetch for a burst, a reconnect refetches rather than replaying, and the UI is identical in live and fallback modes
- [X] T042 [US2] Negative proof: unmount Today with the stream open and the tick running, and assert (via spies) that no interval and no reader survive — then break the cleanup on purpose to confirm the test fails (FR-029, quickstart §1)

**Checkpoint**: Today is live, and behaves identically when the stream is unavailable.

---

## Phase 5: User Story 3 — How the shop is performing (Priority: P2)

**Goal**: Insights answers one range control with revenue, orders, average order value, refunds and top
products, each stating what it compares with, plus twin bar charts — all from prepared figures, never a
scan of raw orders.

**Independent Test**: seed known paid orders across 60 days (including a daylight-saving changeover and a
refund issued days after its sale); for each range every figure matches a hand calculation in the shop's
timezone, every delta states its basis, and the insights repository never names `order` or `order_item`.

### Implementation for User Story 3

- [X] T043 [P] [US3] Build the pure window module `apis/edge-api/shop/src/insights/window.ts`: range → `[from,to)` in the shop's timezone, the comparison window (today = same weekday last week **up to the same local time**), and bucketing into hours / local days / ISO weeks (Monday start) with `partial` flags (research R9, R10)
- [X] T044 [P] [US3] Unit tests `apis/edge-api/shop/src/insights/window.test.ts` — the heaviest pure-test surface in the slice: DST changeover days give 25 and 23 hour buckets, a half-hour zone (`Australia/Adelaide`) buckets at :30 UTC, week boundaries land on Monday, and the today-comparison truncates to the current local time
- [X] T045 [US3] Implement `apis/edge-api/shop/src/insights/rollup.ts`: claim up to 500 `insights_dirty` rows `FOR UPDATE SKIP LOCKED`, recompute each `(shop, hour)` **from source** (gross goods, orders, units, refunds by the day issued, refunded orders, can't-supply and cancelled from `fulfillment_event`), recompute affected product-days, upsert, delete the claimed rows and advance `insights_state.computed_at` — one transaction per shop, idempotent by construction (research R5, R7)
- [X] T046 [US3] Implement `apis/edge-api/shop/src/insights/reconcile.ts`: nightly recompute of the last 35 local days per shop, counting corrections (non-zero means a writer bypassed the dirty marks), plus a full rebuild for any shop whose `shop.timezone` no longer matches `insights_state.timezone`
- [X] T047 [US3] Add the two scheduled functions to `apis/edge-api/shop/serverless.yml` — `insightsRollup` on `rate(1 minute)` and `insightsReconcile` on a nightly cron (03:30 Melbourne) — with handlers in `apis/edge-api/shop/src/functions/`
- [X] T048 [US3] Implement `apis/edge-api/shop/src/insights/repository.ts` + `service.ts`: read both windows from `shop_sales_hour`, build both series, read top 5 from `shop_product_sales_day` joined to `product` (name, SKU, presigned thumbnail), and compute every `change` server-side with its `basis` (FR-024) — **rollups only** (FR-026)
- [X] T049 [US3] Add the handler `apis/edge-api/shop/src/functions/insights-v1-get.ts` and the `GET /shop/v1/insights` route in `serverless.yml`, validating `range` and refusing anything else with a `400` naming `errors.range`
- [X] T050 [P] [US3] Guard `apis/edge-api/shop/src/insights/rollup-only.guard.test.ts`: fail naming the file if the insights repository references `public.order`, `order_item` or any other raw commerce table outside comments (FR-026)
- [X] T051 [US3] Container tests `apis/edge-api/shop/src/insights/repository.container.test.ts`: figures match hand calculations for all three ranges; a refund lands in the bucket of the day it was issued and leaves the sale's day unchanged (research R4); a refund that later fails reverses; running the rollup twice, late, or out of order gives identical rows; goodwill and external refunds are not attributed to any shop
- [X] T052 [P] [US3] Add `insightsQuery(range)` in `apps/shop-web/src/features/insights/queries.ts` and the delta/window copy builders in `apps/shop-web/src/features/insights/model.ts` ("+9% vs previous week", "Revenue, 7 days", "26 August – 1 September · compared with the previous week", "updated a moment ago") — the client formats, never subtracts (FR-024)
- [X] T053 [US3] Build `apps/shop-web/src/routes/insights.tsx` and `apps/shop-web/src/features/insights/InsightsScreen.tsx`: the range-reflecting title, the window + comparison + freshness subtitle, the segmented `Today / 7 days / 30 days` control and `Export CSV`; add the Insights nav item in `components/layout/nav.ts`
- [X] T054 [P] [US3] Build `apps/shop-web/src/features/insights/MetricStrip.tsx` — one clipped bordered container, five cells divided by left rules (three columns under 1240px, two on mobile): Revenue, Orders, Average order value, and **Awaiting pick + Unfulfilled units read from `todayQuery`** so they are identical to Today's (FR-006, FR-017)
- [X] T055 [P] [US3] Build `apps/shop-web/src/features/insights/SecondaryStrip.tsx` — five clickable cells (Refunds, Can't supply, Low stock SKUs, Cancelled, Ready for pickup per FR-034), each drilling through to its filtered Orders tab or the Catalog's low-stock view, with the container clipped so no cell rule dangles
- [X] T056 [P] [US3] Build `apps/shop-web/src/features/insights/BarChart.tsx` — 170px bars, 4px gaps, muted fill with the final bucket in primary, mono axis labels, nowrap subtitles ("{window} · Goods · AUD" / "{window} · paid orders") so the twin headers align; plain `div`s, no chart library and no `--chart-*` token
- [X] T057 [P] [US3] Build `apps/shop-web/src/features/insights/TopProducts.tsx` — max-width ~760px, 30px thumbnail, name, mono SKU, share bar with unit count, right-aligned revenue, `Catalog →`, rows opening product detail, and the subtitle "By revenue, {today | last 7 days | last 30 days}" (a period label, never the bucket label)
- [X] T058 [US3] Build the glance strip `apps/shop-web/src/features/today/TodayGlance.tsx` and mount it on Today: Revenue today, Orders today and Average order value from `insightsQuery('today')` — the same cache Insights reads, which is what makes FR-014 true by construction — plus Awaiting pick with "{units} units to pack" from `todayQuery`, and `Full insights →`
- [X] T059 [P] [US3] Add `apps/shop-web/src/features/insights/exportCsv.ts` — a client-side Blob built from the payload on screen, with the window and `computedAt` in a header row (research R16)
- [X] T060 [P] [US3] Tests `apps/shop-web/src/features/insights/__tests__/insights.test.tsx`: switching ranges changes every figure and both subtitles together, the Top products subtitle never shows a bucket label, the two fulfilment cells equal Today's, every delta states its basis, an empty shop renders zeros with a plain "no sales in this window", and no delta relies on colour alone
- [X] T061 [US3] Negative proof for FR-026: add `FROM public.order_item` to the insights repository, confirm the T050 guard fails naming the file, then revert

**Checkpoint**: Insights answers all three ranges from rollups, and Today's glance agrees with it.

---

## Phase 6: User Story 4 — Start any common task from one place (Priority: P2)

**Goal**: `Quick actions` opens the sheet of everything an operator starts from the console, and
`Print pick lists` prints one list per waiting order.

**Independent Test**: open the sheet, trigger each of the six rows, and confirm each ends where FR-010
says; with four orders waiting, the header button prints four lists and toasts "4 pick lists sent to
printer"; with none waiting it is unavailable and says why.

### Implementation for User Story 4

- [X] T062 [P] [US4] Implement `apis/edge-api/shop/src/pick-lists/{repository,service}.ts` — every awaiting-pick portion, oldest first, ≤ 100 with a `more` count, carrying lines and **no money** (020's pick-document rule)
- [X] T063 [US4] Add the handler `apis/edge-api/shop/src/functions/pick-lists-v1-get.ts` and the `GET /shop/v1/pick-lists` route in `serverless.yml`
- [X] T064 [US4] Build `apps/shop-web/src/features/today/QuickActionsSheet.tsx` — a ~440px full-height right `Sheet` titled `Quick actions` / "Everything you start from here.", no footer, three labelled groups of rows (26px muted tile + mono glyph, 13.5px title, 12.5px muted description, `›` chevron, separated by top rules), with the six built rows and their Part A copy verbatim
- [X] T065 [US4] Wire the six actions: `New product` → `/catalog/new`; `Print pick lists` → the batch print + toast; `Receive stock` → toast "Pick a product to receive stock into" then `/catalog`; `Open the attention queue` → `/orders?attention=at_risk&sort=placed&dir=asc` (URL state, never the saved-views row 057 removed); `Export orders` → the Orders list's existing CSV; `Open insights` → `/insights` (FR-010, research R13)
- [X] T066 [US4] Implement the batch print in `apps/shop-web/src/features/today/printPickLists.ts` using the T010 renderer — one print window, one page per order — and wire the header's primary `Print pick lists` button, disabled with a reason when the backlog is 0 (FR-013)
- [X] T067 [P] [US4] Write the refusals guard `apps/shop-web/src/features/today/today-refusals.guard.test.ts`: word-bounded phrases over comment-stripped source under `features/today/`, failing and naming the file for `New order`, `Discount code`, `Message a customer`, `New discount code` or `orders@effy.shop` (FR-011)
- [X] T068 [US4] Negative proof for T067: inject `<Plus />Message a customer` into a component, confirm the guard fails naming the file, then revert — ⚠ 057's equivalent guard let `<RotateCcw />Capture payment` through, so prove this one with an adjacent glyph and no delimiter
- [X] T069 [P] [US4] Tests `apps/shop-web/src/features/today/__tests__/quick-actions.test.tsx`: exactly six rows in the right groups, each destination and toast, the print count and its message, and the disabled state with its reason

**Checkpoint**: every task an operator starts is one click from Today, and the three impossible ones cannot come back.

---

## Phase 7: User Story 5 — What the team has done (Priority: P3)

**Goal**: `Team activity` gathers the accountability the platform already records into one newest-first
list.

**Independent Test**: have two staff members pick, note and adjust stock; the sheet lists each action
with the right person, in order, with nothing from another shop.

### Implementation for User Story 5

- [X] T070 [P] [US5] Implement `apis/edge-api/shop/src/team-activity/{types,repository,service}.ts`: the newest 50 of the last 14 days, merged from `fulfillment_event`, `stock_movement` (`actor_kind='shop'`, joined to `shop_staff` on `actor_sub = cognito_sub`) and `refund` (`actor_kind='shop'`), scoped to this shop; `system`/`back_office` actors render as **Effy** and a departed staff member as a former team member — never blank (research R14)
- [X] T071 [US5] Add the handler `apis/edge-api/shop/src/functions/team-activity-v1-get.ts` and the `GET /shop/v1/team-activity` route in `serverless.yml`
- [X] T072 [P] [US5] Unit + container tests for the merge: ordering across all three sources, shop scoping, the Effy attribution, and that no back-office staff name ever crosses the wire
- [X] T073 [US5] Build `apps/shop-web/src/features/today/TeamActivitySheet.tsx` — right `Sheet` titled `Team activity` / "Everything the team has done, newest first.", rows of a 5px tone dot over "{what}" and "{when} · {who}" — and wire the header button plus `teamActivityQuery` in `features/today/queries.ts`

**Checkpoint**: all five stories work independently.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T074 [P] Add the PostHog events through the shared taxonomy: `today_viewed`, `today_attention_acted` (`kind`), `quick_action_used` (`action`), `insights_viewed` (`range`), `insights_range_changed`, `insights_drilled` (`metric`), `insights_exported` — no PII, no order numbers (research R18)
- [X] T075 [P] Add the three CloudWatch alarms in `infra/envs/dev/` routed to the existing alerts SNS topic: rollup backlog age > 4 min, nightly reconcile corrections > 0, rollup Lambda errors; `terraform validate` + `fmt`
- [X] T076 [P] Add the structured logs `insights.rollup` (buckets, duration, backlog age) and `insights.reconcile` (corrections) in the two scheduled functions
- [X] T077 [P] Record §058 in `docs/audiences/shop-capabilities.md`: Today and Insights are web-only, outstanding on shop-mobile, with the reason (research R20)
- [X] T078 [P] Update the Active feature section of `CLAUDE.md` for 058 — what was built, the recorded exceptions (hot-path stream, first triggers, the poke that is not the event backbone), and what is open for the operator
- [X] T079 Run the full verification sweep from `quickstart.md` §1 and record the counts: `pnpm -r typecheck`, `pnpm -r test` (count reporting packages), `CONTAINER_TESTS=1` edge-shop, edge-orders unmodified, `make core-test FULL=1`, `tokens:check` **unchanged**, `check-shop-theme`, `check-component-shape`, `check-no-emerald`, `check-no-jade`
- [X] T080 Execute the remaining negative proofs in `quickstart.md` §1 by breaking each thing once and reverting: the trigger allow-list, the atomic dirty mark, DST bucketing, the half-hour zone, and "the stream carries no data"
- [X] T081 Re-read every new screen's source (`apps/shop-web/src/features/today/*.tsx`, `apps/shop-web/src/features/insights/*.tsx`) for the defects a DOM assertion cannot see (039's four): phone-width layout under 1100px and 768px, contrast in both appearances, the hierarchy of the primary action, and any hue that crept in
- [X] T082 Write `specs/058-shop-today-insights/SIGNOFF.md` — what is machine-verified, what is not, and the operator's ordered deploy list from `plan.md` § Operator steps (⚠ `make db-up` → `edge-deploy SERVICE=shop` → `SERVICE=orders` → `core-image-push && core-deploy` → `make apply` → push shop-web), followed by the `quickstart.md` §3 walks W1–W13

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: needs Setup — **blocks every story**. T003→T006 are one file, strictly sequential; T007/T008/T010 are parallel; T009 needs T008; T011/T012 need T005
- **US1 (Phase 3)**: needs Foundational. The MVP
- **US2 (Phase 4)**: needs US1 (it makes US1's snapshot live). T028–T035 (Go) and T036–T037 (web-kit) are parallel tracks that meet at T038
- **US3 (Phase 5)**: needs Foundational; independent of US2. T058 (the glance) needs T048 and US1's `TodayScreen`
- **US4 (Phase 6)**: needs US1 (the header and sheet live on Today); T066 needs T010
- **US5 (Phase 7)**: needs US1 (the header button); otherwise independent
- **Polish (Phase 8)**: needs every story you intend to ship

### Within Each Story

Types → repository → service → handler/route → tests → client query → components → screen wiring →
negative proof. SQL work is proven by a container test before the UI is built on it.

### Parallel Opportunities

- Phase 2: T007, T008 and T010 together (three packages, no overlap)
- US1: T013/T017 with T019/T020; T022 and T023 are separate components
- US2: the whole Go track (T028, T029, T033, T034) against the whole web-kit track (T036, T037)
- US3: T043/T044 (pure, no dependencies) can start with Phase 2; T054–T057 and T059 are five separate components
- Polish: T074–T078 are five independent files

---

## Parallel Example: User Story 3

```
# After T048 lands, five component tasks run at once:
T054  MetricStrip.tsx
T055  SecondaryStrip.tsx
T056  BarChart.tsx
T057  TopProducts.tsx
T059  exportCsv.ts
```

---

## Implementation Strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US1).** That is a console whose home screen answers "what needs
doing now" from live data, refreshed every 30 seconds — strictly better than the dashboard it replaces,
and shippable on its own.

**Then, in order of what each adds:**

1. **US2** — the reason to leave the console open. Also the slice's only hot-path change, so it carries
   the deploy ordering risk; land it while the fallback is proven to work without it.
2. **US3** — the analytics half, and the only part that needs the rollups to have run. Its first deploy
   is the one to watch: the migration's backfill marks build history over the first few minutes.
3. **US4**, then **US5** — convenience over capability.

**What not to do**: do not build the glance strip before US3 (FR-014 cannot be met), do not let Insights
touch raw orders to "get it working" (FR-026, guarded), and do not ship any of it as done until a person
has walked `quickstart.md` §3 — 039 shipped four live defects with a fully green suite.
