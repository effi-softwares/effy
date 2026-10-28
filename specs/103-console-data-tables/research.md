# Research — 103 Console Data Tables

Inventory and defects: [docs/research/console-data-tables.md](../../docs/research/console-data-tables.md).
Docs read 2026-10-28: TanStack Table (overview; React guides for pagination, sorting, column filtering,
sizing, resizing, pinning, visibility, table state; client-side-vs-server-side) and shadcn
`components/radix/table` + `components/radix/data-table`.

## R1 — Table engine: TanStack Table v9

- **Decision**: upgrade `@tanstack/react-table` from `^8.21.3` to `9.3.x` in back-office, shop-web and
  web-kit, and build the shared table on v9 (`useTable`, `tableFeatures({...})`, `table.FlexRender`).
- **Rationale**: the docs and shadcn's data-table guide both describe v9 now (`latest` = 9.3.1,
  2026-10-12). Only 3 call sites use v8 (`PointsHistoryTable`, `SlotsPanel`, `PricingPanel`) plus the starter
  `DataTable`, so the migration is cheapest now, before ~30 lists are written against the engine. v9 is
  tree-shaken by feature registration (we register only what a list uses) and is React-Compiler compatible.
- **Alternatives**: stay on v8 (rejected — every new table would be written against an API the docs no
  longer show, and migrated later at 10× the cost); no engine, keep hand-rolled tables (rejected — the
  constitution's TanStack suite names Table, and hand-rolling is what produced seven sort/pager variants).
- **Guard**: a lockfile check that the three packages resolve the same major (the material3 lesson in
  CLAUDE.md — one pinned version per family).

## R2 — Server-side mode, per the TanStack server-side guide

- **Decision**: every list (kind A) sets `manualPagination`, `manualSorting`, `manualFiltering`; registers
  no client row models; passes `rowCount` (offset mode) or `pageCount: -1` (keyset mode); controls
  `pagination` and `sorting` through `state` + `on*Change` fed from the router's search params; resets
  `pageIndex` in its own change handlers (the docs warn manual tables without row models do not auto-reset).
  `getRowId: (r) => r.id` so selection survives requests (the guide: page-relative indexes do not identify a
  record).
- **Rationale**: the guide's own checklist — own the state, put every server-owned value in the query key,
  enable `manual*`, provide the count, reset the page on change, guard against stale responses.
- **Alternatives**: v9 atoms (`useCreateAtom`) for state — rejected for lists because the URL is the
  state (R4); atoms would be a second copy. Bounded sub-tables (kind B) use client row models (sorted only).

## R3 — One paging contract, two modes

- **Decision**: one wire shape `ListPage<T>` (contracts/list-contract.md) with two modes chosen per endpoint:
  **offset** (`page`, exact `total` via `count(*) OVER()`, max offset 10 000) for human-sized sets, and
  **keyset** (opaque `cursor` = base64url `[sortValue, id]`, `total` from a capped count) for append-heavy
  ledgers read newest first: back-office orders, customer points, shop history, product stock history.
  Every `ORDER BY` ends in the row's id in the same direction (FR-003).
- **Rationale**: offset gives page numbers, "of 312" and jump-to-last, which staff want on bounded sets; on a
  constantly-growing newest-first ledger, offset repeats rows as new ones arrive and degrades with depth, so
  keyset is required there (FR-004). Existing code already has both — shop orders (offset + `count(*) OVER()`,
  with the past-the-end fallback) and drivers/vehicles (keyset on `(name,id)`, `(plate,id)`) — this
  standardises on them rather than inventing a third.
- **Keyset with a chosen sort** (orders by total): cursor carries `[total, id]`; `WHERE (o.total, o.id) <
  ($1, $2)` (row comparison, direction-aware). Back = the client's stack of cursors (kept in history state,
  not the URL — a cursor in a shared link would be stale); the URL keeps `page` as a number for display, and a
  reload on a keyset page > 1 returns to page 1 with a one-line note. ⚠ This is the one place FR-005 is
  bounded: on a ledger, "page 7" is not a stable address because the ledger moved.
- **Capped count**: `SELECT count(*) FROM (SELECT 1 … LIMIT 10001)`; 10 001 → `total: 10000, totalCapped:
  true` ("10,000+"). Run once per filter set: its own query keyed without the page, `staleTime` 30 s,
  invalidated by live announcements.
- **Alternatives**: keyset everywhere (rejected — no "of N", no jump-to-page, and the bounded sets don't need
  it); offset everywhere (rejected — FR-004 fails on orders); infinite "Show more" (rejected — FR-002, and it
  cannot be addressed by URL).

## R4 — The URL is the list's state

- **Decision**: each list route declares `validateSearch` from one `ListSearchSpec` (q, filters, sort, dir,
  page, size); the screen reads `Route.useSearch()` and writes with `navigate({ search, replace: true })` for
  typing and `push` for paging. Invalid values are dropped by the parser, never thrown (FR-005 / US2-4). Search
  input keeps a local draft and writes to the URL after 250 ms idle.
- **Rationale**: TanStack Router's typed search params are already the pattern on back-office Products (102);
  it fixes the lost-view defect on Orders/Drivers/Vehicles/Feedback, and Back restores scroll (router
  `scrollRestoration` on, keyed per list).
- **Alternatives**: TanStack Store (rejected — not shareable, not restored on reload); `sessionStorage`
  (rejected — same).

## R5 — Fetching: TanStack Query with kept-previous data

- **Decision**: `queryOptions` with every server-owned param in the key, `placeholderData: keepPreviousData`,
  the request's `AbortSignal` passed to the fetch wrapper (a superseded request is cancelled; a stale answer
  can't win — the key changed), prefetch of page+1 when the current page settles (offset mode only), and
  view counts as a sibling query keyed on the non-view filters.
- Query keys begin with the list's live root key (`["orders", "list", params]`), so `LIVE_ROUTES` invalidates
  them unchanged (FR-018). No `refetchInterval` (071 guard stays green).
- **Alternatives**: router loaders fetching the list (rejected for lists — loaders block navigation; we want
  the old page to stay while the new one loads).

## R6 — Rendering cost and virtualisation

- **Decision**: no row virtualisation for lists. Max page 100 rows × ≤ 9 columns; the docs: virtualise only
  when what is *loaded* is expensive to render. Columns are module-level constants; cell renderers read
  `row.original` only; `Intl` formatters cached in each app's `lib/format`. Column widths and visibility as CSS
  variables on the table element (the docs' performant resizing pattern), so toggling a column does not
  re-render rows. Column resizing is **not** enabled (not asked for; priorities + visibility cover it).
- **Alternatives**: TanStack Virtual on every list (rejected — complexity, breaks Ctrl-F and print, no gain at
  ≤ 100 rows).

## R7 — Filling the window

- **Decision**: `StaffShell`'s `<main>` becomes `min-h-[calc(100svh-var(--header-h))]` (md+); a new
  `ListPage` pattern lays out header → toolbar → `DataTable` frame with `flex-1 min-h-0`; the frame is a
  flex column: sticky `<thead>`, a scrolling body region, the pager as its last child. At `< md` the frame is
  not height-bound (page scroll). Empty / no-matches / error / first-load render inside the body region,
  centred. No filler rows (they'd read as data).
- Measured with the header token that already exists (`--header-h`), so there is no magic number.
- **Alternatives**: auto page size from viewport height (rejected — page size must be in the URL and identical
  for whoever opens the link).

## R8 — Phone layout generated from column meta

- **Decision**: column `meta.phone` (`primary | meta | badge | trail | hide`) emits the `data-m` attribute
  that `ef-rtable` already styles; `meta.label` emits `data-label`. Screens stop writing `data-m`. `ef-rtable`
  stays in `console.css` (rule 1: both consoles use it).

## R9 — Search performance

- **Decision**: one migration adds trigram GIN indexes on searched text with none today, and `(sort, id)`
  btrees where a list's default order has none:
  - `order`: `(created_at DESC, id DESC)` (the list's order; today only `(customer_id, created_at)` exists),
    trigram on `order_number`; `customer.email` trigram.
  - `shop`: trigram on `name`, `code`. `vehicle.registration_plate` trigram. `delivery_zone_postcode.postcode`
    btree `text_pattern_ops` (prefix search). `promotion`: trigram on `name`; code lookup already exact.
  - `product_variant`: trigram on `sku` / Effy code; barcode exact btree.
  - `shop_fulfillment.package_code` — exact match already indexed (verify in T-task; add if not).
  Exact list confirmed per endpoint by `EXPLAIN` in quickstart step 4 against seeded volumes; an index that
  EXPLAIN shows unused is dropped from the migration before it ships.
- Search text is trimmed, ≤ 100 chars, `%`/`_` escaped, and searches shorter than 2 chars on trigram columns
  match prefix only (a 1-char `%a%` scan is useless and slow).

## R10 — Small staff-created sets (FR-024)

- **Decision**: promotion groups, skins, courier services, fee plans, shop team: kind-B client mode (sorted +
  searched in the browser, no pager), **cap 500** enforced in the one service that creates each (409
  `limit_reached`, one sentence), and the list endpoints return at most 501 rows so the client can show "the
  limit has been reached" honestly.
- **Rationale**: spec clarification Q1; the TanStack guide: one dataset is client- *or* server-side, never both.

## R11 — View counts in one call (FR-017), no new routes

- **Decision**: a list with views answers `GET <its list route>?<non-view filters>&views=only` with
  `{ views: { [view]: number } }` — one request, one SQL statement (`count(*) FILTER (WHERE …)` per view over
  the shared `WHERE`). Orders keeps its existing `/orders/v1/summary/views`; shop orders keeps `byTab` in the
  list response. Feedback's N `limit: 1` requests are replaced.
- **Rationale**: the staff gateway carries ≈ 203 of 300 routes today (admin 49 + promotions 32 + fleet 48 +
  orders 30 + catalog 37 + inventory-staff 7, counted from the `serverless*.yml` files on 2026-10-28; confirmed by
  `gateway-capacity.contract.test.ts` on 2026-10-28: staff 203/300 (68 %), shared 165/300 (56 %)). A route per list would add 9 and push it to ~71 %, near
  the 75 % alarm, for something a query parameter on the existing integration does at no cost. **This feature
  adds zero routes.**
- **Alternatives**: a `/summary/views` route per list (rejected — gateway budget); counts inside every page
  response (rejected — recounts on every page turn).

## R12 — Customers becomes browsable

- **Decision**: `GET /orders/v1/customers` without `q` returns a `ListPage` (offset, sorts joined / last order /
  orders); with `q` it keeps today's search semantics but in the same envelope. `orders_count` and
  `last_order_at` come from one grouped sub-select over `order` filtered by `status <> 'pending_payment'`,
  using `order_customer_created_idx`. No new route.

## R13 — Shop history → keyset; shop stock → server list

- `GET /admin/v1/shops/{id}/audit` keyset on `(at, id)`; shop stock via the existing inventory staff route with
  list params (no `LIMIT 500`). Product stock history (shop-web) keyset on `(at, id)`.

## R14 — Removing silent caps

- Courier parcels (`LIMIT 1000`), exceptions (`LIMIT 200`), inventory stock (`LIMIT 500`): converted to offset
  lists. Driver work `LIMIT 200` (driver app) is **out of scope** (not a console list) — noted for the driver
  backlog.

## R15 — Columns hidden on a device

- `localStorage` key `effy.table.<app>.<listId>.v1` → `{ hidden: string[] }`, behind try/catch; unknown ids
  ignored; the identifying column has `enableHiding: false`. A per-viewer convenience, so not server state
  (CLAUDE.md: never hand-cache server data; this is not server data).
