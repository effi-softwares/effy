# Implementation Plan: Shop Console — Today & Insights

**Branch**: `058-shop-today-insights` (work happens on `dev`; nothing committed by Claude) | **Date**: 2026-09-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/058-shop-today-insights/spec.md`

## Summary

Replace the shop console's dashboard with **Today** (what needs doing now: Needs attention, Live orders,
a glance strip, Quick actions and Team activity sheets) and add **Insights** (a range-driven analytics
page: two metric strips, twin bar charts, top products), both built to the Claude Design mockup's markup
with Effy's model mapped onto it (spec § Source Design).

Research first, as the brief required: **[docs/insights-architecture.md](../../docs/insights-architecture.md)**
compares how production consoles serve analytics and realtime feeds, webhook reliability practice, and
concrete monthly costs at 10k and 500k orders/month. It concludes:

- **Insights** reads **Postgres rollup tables** keyed by `(shop, local-hour start)` and
  `(shop, local date, product)`, recomputed from source for dirty buckets every minute by a scheduled
  cold-path Lambda and reconciled nightly. **No edge runtime and no CDN cache** — every operator and the
  database are in Sydney, and the payload is private per shop.
- **Today** is a snapshot read on the cold path, made live by **Server-Sent Events from `core-api`**
  carrying content-free *pokes*, which come from **Postgres triggers** via `LISTEN/NOTIFY`. Backfill is
  "refetch the snapshot" on every (re)connect; the fallback is 30 s polling with `ETag`.
- Cost: **≈ $0/month at 10k orders, ≈ $13–14/month at 500k**, with no new vendor or AWS service. The
  hosted realtime options cost $25–$110 at 500k and still need the same database listener.

## Technical Context

**Language/Version**: TypeScript 5 / Node 22 (edge-shop Lambdas, shop-web, shared packages); Go 1.25
(`core-api`); PostgreSQL 16 SQL (one Goose migration)

**Primary Dependencies**: React 19, TanStack Router/Query/Store, shadcn/ui via `@effy/design-system/ui`
(`Sheet`, `Button`, `Badge`, `Tabs`), `@effy/web-kit` (gains `runtime/live.ts`), `@effy/shared-types`
(gains `shop-insights.ts`), `@effy/edge-shared` (gains the promoted refund-proposal rule); Gin + pgx/v5
(`core-api` — pgx's `WaitForNotification` for `LISTEN`). **No new third-party dependency** anywhere.

**Storage**: PostgreSQL 16 — `shop.timezone` column; `shop_sales_hour`, `shop_product_sales_day`,
`insights_dirty`, `insights_state`; six trigger functions + `shop_local_hour()` (data-model.md)

**Testing**: Vitest (shop-web, edge-shop incl. `CONTAINER_TESTS=1` against the real migrations,
web-kit, edge-shared, edge-orders unmodified); Go `testing` (+ container tests for the listener);
source guards (refusals, rollup-only reads, trigger allow-list)

**Target Platform**: shop-web (Vite SPA on Amplify `WEB`), AWS Lambda arm64 (`ap-southeast-2`),
`core-api` on Fargate behind the ALB

**Project Type**: web console + two backends (monorepo slice)

**Performance Goals**: new paid order on Today ≤ 10 s p95 live, ≤ 30 s on fallback (SC-002); Insights
≤ 1.5 s p95 at 500k orders/month and ≤ 5 min behind the records (SC-004)

**Constraints**: Insights never reads `order`/`order_item` (FR-026); Today never reads rollups for its
backlog figures (FR-025); stream carries no data; colour law (no warning hue, success never as text);
no client timers after unmount (FR-029)

**Scale/Scope**: 10k–500k orders/month; 15–250 shops; 30–500 concurrent console tabs; 2 screens, 2
sheets, 4 cold-path routes + 2 scheduled functions, 1 hot-path route, 1 migration

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — still passes, with the
exceptions recorded under Complexity Tracking.*

| Principle | Status | How |
|---|---|---|
| **I. Spec-driven** | ✅ | Spec → research → this plan. A plan-phase finding (refund dating) was fixed **in the spec** (FR-032 amended, recorded in Clarifications), not patched in code. |
| **II. Shared contracts** | ✅ | DTOs in `@effy/shared-types/shop-insights.ts`; the SSE client in `@effy/web-kit`; 055's refund-proposal rule **promoted** to `@effy/edge-shared` and consumed by both `edge-orders` and `edge-shop` (edge-orders' suite unmodified = proof); the pick-list renderer extracted once and used by order detail and the batch print; `shop_local_hour()` is one SQL function used by triggers, job and reads. |
| **III. Dual-path** | ⚠ exception | All reads + the rollup job on the **cold path** (`edge-shop`) — internal operator console. The **live stream on `core-api`** is a recorded exception (research R1): a stream outlives the HTTP API's 30 s integration timeout, and Fargate is the only long-running process. It carries no data. |
| **IV. Auth isolation** | ✅ | Cold routes behind the shop authorizer; the stream behind `core-api`'s existing shop `PoolVerifier` (057) — per-pool validation, pinned issuer, no proxy. The record decides (active operator at an active shop); the claim never overrides it. Refund proposals filtered to `shop_manager` **server-side**. |
| **V. Design** | ⚠ justified | Monochrome held: no warning hue; success only as a dot; deltas by glyph and sign (research R15). shadcn primitives from the design-system. Framed panels are recorded under Complexity Tracking against "no card layouts". `tokens:check` must pass **unchanged** (no token added). |
| **VI. Architecture** | ✅ / ⚠ | Three-layer slices (handler → service → repository) in edge-shop `today/`, `insights/`, `team-activity/`; raw SQL; explicit wiring; server state in TanStack Query only (the ageing tick is a render clock, not cached server data). ⚠ First Postgres triggers, and a `NOTIFY` channel that is **not** the event backbone — both recorded below. |
| **VII. Telemetry** | ✅ | PostHog events, `core-api` metrics, edge-shop structured logs, three alarms (research R18). No PII, no shop label on metrics. |
| **Real-world identifiers** | ✅ | None introduced. `orders@effy.shop` is a mockup address and is **refused** with the dialog it lives in (FR-011); a guard pins it absent. |

## Project Structure

### Documentation (this feature)

```text
specs/058-shop-today-insights/
├── plan.md              # this file
├── research.md          # decisions R1–R20
├── data-model.md        # migration, rollups, triggers, read shapes
├── quickstart.md        # validation walk
├── contracts/
│   ├── shop-today-insights.contract.md   # 4 edge-shop routes + DTOs
│   └── shop-live-stream.contract.md      # core-api SSE
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
docs/insights-architecture.md             # the research deliverable (FR-030)
```

### Source Code (repository root)

```text
db/migrations/<ts>_shop_insights.sql        # shop.timezone, 4 tables, shop_local_hour(), 6 triggers, backfill marks

packages/shared-types/src/shop-insights.ts  # ShopTodayDTO, ShopInsightsDTO, ShopTeamActivityDTO, ShopPickListsDTO
packages/web-kit/src/runtime/live.ts        # fetch-based SSE reader + reconnect/backoff/visibility (+ tests)
apis/edge-api/shared/src/lib/refund-proposals.ts  # promoted from edge-orders/src/orders/refunds.ts (optional shop scope)

apis/edge-api/orders/src/orders/refunds.ts  # now calls the edge-shared rule; behaviour unchanged

apis/edge-api/shop/
├── serverless.yml                          # +4 routes, +2 scheduled functions (269 → ~300/500 resources)
└── src/
    ├── today/        {types,repository,service,handler-support}.ts (+ tests, container tests)
    ├── insights/     {types,window,repository,service,rollup,reconcile}.ts (+ tests, container tests)
    │                 # window.ts = ranges, comparison windows, bucketing (pure, heavily unit-tested)
    ├── team-activity/{types,repository,service}.ts (+ tests)
    ├── pick-lists/   {repository,service}.ts (+ tests)
    ├── functions/    today-v1-get · insights-v1-get · team-activity-v1-get · pick-lists-v1-get
    │                 · insights-rollup (rate 1 min) · insights-reconcile (cron nightly)
    └── db/triggers.guard.test.ts            # trigger allow-list (research R6)

apis/core-api/
├── cmd/core-api/main.go                     # register the stream; start the listener; update the
│                                            # "whole of the shop's reach" comment (research R1)
└── internal/features/shoplive/
    ├── listener.go   # dedicated pgx conn, LISTEN shop_ops, reconnect → resync
    ├── hub.go        # per-shop subscribers, 500 ms throttle, 5-per-sub cap
    ├── handler.go    # SSE: resync first, 20 s heartbeat, 15 min lifetime
    ├── gate.go       # active operator at an active shop, by sub
    └── *_test.go     # hub/handler unit + listener container test

apps/shop-web/src/
├── routes/app.tsx · routes/insights.tsx     # "/" → TodayScreen; new /insights route
├── components/layout/nav.ts                 # "Dashboard" → "Today"; + "Insights"
├── features/today/
│   ├── TodayScreen.tsx · NeedsAttention.tsx · LiveOrders.tsx · TodayGlance.tsx
│   ├── QuickActionsSheet.tsx · TeamActivitySheet.tsx
│   ├── queries.ts        # todayQuery (+ live wiring), teamActivityQuery, pickListsQuery
│   ├── useShopLive.ts    # stream → invalidate; fallback interval; cleanup on unmount
│   ├── useNow.ts         # 15 s render tick, cleared on unmount
│   ├── model.ts          # copy builders ("3 orders awaiting pick"), relative time, ages
│   └── today-refusals.guard.test.ts  # FR-011
├── features/insights/
│   ├── InsightsScreen.tsx · MetricStrip.tsx · SecondaryStrip.tsx · BarChart.tsx · TopProducts.tsx
│   ├── queries.ts · model.ts (delta text, window subtitle) · exportCsv.ts
├── features/fulfillment/pickList.ts         # extracted renderer (order detail + batch)
└── features/dashboard/                      # DELETED — superseded by features/today (useNavBadges moves)

infra/envs/dev/                              # 3 CloudWatch alarms → existing alerts SNS (research R18)
docs/audiences/shop-capabilities.md          # §058 parity register entry (mobile outstanding)
```

**Structure Decision**: the monorepo's existing slices — one migration, feature folders in `edge-shop`
and `shop-web`, one feature package in `core-api` — plus three small additions to shared packages. No
new service, app or package.

## Phases (for /speckit-tasks)

1. **Foundation** — migration (tables, function, triggers, backfill marks); shared DTOs; promote the
   refund-proposal rule (edge-orders unmodified suite); extract the pick-list renderer.
2. **US1 Today — Needs attention** (P1) — `GET /shop/v1/today` (backlog, attention, live), TodayScreen
   with the priority row and glance; replaces the dashboard; nav badge on the same query.
3. **US2 Live** (P1) — `core-api` shoplive (listener, hub, handler, gate); `web-kit` live reader;
   `useShopLive` + fallback; the ageing tick; the new/ageing rules.
4. **US3 Insights** (P2) — rollup job + reconcile; `GET /shop/v1/insights`; InsightsScreen, strips,
   charts, top products, drill-throughs, CSV.
5. **US4 Quick actions** (P2) — the sheet, batch pick-lists route and print, refusals guard.
6. **US5 Team activity** (P3) — route + sheet.
7. **Polish** — telemetry, alarms, parity register, CLAUDE.md, guards, the full verify sweep.

## Operator steps (Claude does not run these)

1. Commit, then `make db-up ENV=dev` (the migration; its backfill marks build history on the first runs).
2. `make edge-deploy SERVICE=shop ENV=dev` (4 routes + 2 schedules) and `SERVICE=orders` (the promoted rule).
3. `make core-image-push && make core-deploy ENV=dev` (the stream) — **before** pushing shop-web, or
   Today runs on the polling fallback until it lands (harmless, and a live proof of the fallback).
4. `make apply ENV=dev` (three alarms).
5. The quickstart walks. ⚠ Nobody has looked at a screen until then — 039 shipped four live defects with
   a green suite.

## Complexity Tracking

| Deviation | Why needed | Simpler alternative rejected because |
|---|---|---|
| **A shop-pool route on the hot path** (`GET /v1/shop/live`) — Principle III | A stream must outlive a request; the HTTP API caps integrations at 30 s and Lambda cannot hold a connection behind it. `core-api` is the only long-running process and already verifies shop tokens. | *Polling only*: ≈$198/mo + a DB resize at 500k to meet SC-002. *API GW WebSocket / AppSync / hosted*: new stateful service or vendor, $25–$110/mo at 500k, and they still need a DB listener, i.e. a long-running process. The stream carries no data, so no shop read moves to the hot path. |
| **Postgres triggers** (the platform's first) — Principle VI / house style | Six services on two backends write the tables that define Today and the rollups. A poke or dirty mark in application code must be remembered by every writer, forever; missing one is silent (054's lesson). A trigger is transactional and cannot be forgotten. | *Application-code calls*: the failure mode above. *Logical decoding*: a replication slot and a consumer for a signal `NOTIFY` already carries. Trigger bodies are confined to `pg_notify` + one idempotent insert, and a guard test enforces the allow-list. |
| **A `NOTIFY` channel that is not the event backbone** — Principle VI "one event language" | A UI cache-invalidation hint needs sub-second, transactional, free delivery to one process; the SNS backbone is not built, and domain events are the wrong vehicle for "refetch". | *Wait for SNS*: blocks the slice on unbuilt infrastructure and would still need a fan-out to browsers. The poke carries only a shop id, has no envelope, and no business process may consume it (research R19). |
| **Framed panels** (Needs attention, Live orders, glance, two metric strips) — Principle V "no card layouts" | The operator directed design fidelity (057 A3: "follow the design"), and these are **framed lists with a header band and a footer action**, not metric tiles: each holds rows you act on, and the metric strips are single bordered strips divided by rules (the treatment 057's `CountStrip` already uses), not a tile grid. | *Unframed sections*: 057's first pass used them and the design revision rejected it. No metric-card grid is introduced; nothing tiles. |
| **Revenue and a Live orders row total measure different things** | FR-032 (clarified): revenue is the shop's goods; the row total is the order total the Orders list already shows (057 A3). | *Showing the shop's goods on the row*: would disagree with the Orders list for the same order — the drift 052 deleted `summarizeFulfillment` over. Subtitles say "Goods · AUD"; recorded as a walk risk. |
