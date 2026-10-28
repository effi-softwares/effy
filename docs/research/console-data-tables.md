# Console data tables — inventory and design (research for feature 103)

2026-10-28. Input for `/speckit-specify`. Scope: every table in `apps/back-office` and `apps/shop-web`.
Sources read: the code (screens, repos, list endpoints), TanStack Table docs (overview; React guides for
pagination, sorting, column filtering, sizing, resizing, pinning, visibility, table state;
client-side-vs-server-side), shadcn `components/radix/table` + `components/radix/data-table`.

## 1. What is there today

**55 files render a `<Table>`** (44 back-office, 11 shop-web). Only **3** use TanStack Table
(`PointsHistoryTable`, `SlotsPanel`, `PricingPanel`), through `@effy/web-kit/console` `DataTable` — which is
the shadcn starter with nothing on it (no sorting, paging, visibility, sizing, selection, loading or empty
states). Everything else is hand-written rows on the design-system primitives, each screen wiring its own
toolbar, sort headers and pager.

**The backend has three paging contracts for the same job:**

| Contract | Wire shape | Where |
|---|---|---|
| Keyset cursor | `{ items, nextCursor }` | orders, drivers, vehicles, feedback, coverage, review queue, missing details, points, customers' points |
| Offset dressed as a cursor | `{ items, nextCursor }` (base64 offset, max 5 000) | catalog products (102), imports |
| Page + total | `{ items, total, page, pageSize }` (`count(*) OVER()`) | shop orders, shop products, admin shops, promotions, deliverability |

And **three paging UIs**: Back/Next over a client-held cursor stack (orders, drivers, vehicles, feedback),
"Show more" infinite lists (back-office products, imports, coverage, points history), and numbered pages with
a total (shop orders, shop catalog, shops, promotions).

**Defects found on the way** (each is fixed by the shared layer, listed so the spec can name them):

1. `orders/src/orders/repository.ts` — the cursor is `o.created_at < $cursor` with `ORDER BY o.created_at DESC`
   and **no id tie-break**: two orders with the same `created_at` straddling a page edge — one is never shown.
   (Drivers and vehicles do it right: `(name, id)`, `(plate, id)`.)
2. Back-office **Orders keeps search and the cursor stack in component state** — a reload, a shared link or
   Back from an order loses the search and the page. Same for drivers, vehicles, feedback.
3. **Silent truncation**: courier parcels `LIMIT 1000` (`orders/repository.ts:569`), exceptions `LIMIT 200`
   (`fleet/src/exceptions/sql.ts`), stock `LIMIT 500`, driver work `LIMIT 200` — past the limit rows just
   vanish with no "there are more".
4. **Feedback view counts are N extra list requests** (`useQueries(... limit: 1)`) to learn a count the
   server could return once (orders already has `/summary/views`).
5. Search `ILIKE '%q%'` on columns with **no trigram index** (order number, customer email, shop name, SKU,
   plate, postcode) — a sequential scan per keystroke once tables grow. Only product name/brand/search,
   driver name and feedback message have `gin_trgm_ops`.
6. **No table fills the screen.** `StaffShell`'s `<main>` is not height-bound, so a 3-row table is a short box
   with blank page under it, and a long one scrolls the whole page and loses its header and pager.
7. Sort headers are implemented twice (`TableSortHead` in the design system; a private `SortTh` in shop-web's
   `OrderTable`), and the phone layout (`ef-rtable` + hand-placed `data-m` on every cell) is repeated by hand
   on every screen.

**Library version.** The repo pins `@tanstack/react-table ^8.21.3`. The docs now describe **v9** (`latest` on
npm is 9.3.1, 2026-10-12) and the shadcn guide is written for v9: features are registered with
`tableFeatures({...})`, row models are factories, `flexRender` → `table.FlexRender`, state via atoms or the
classic `state` + `on*Change`. With only 3 v8 call sites, **now is the cheapest moment to move to v9** —
every new table is written once, against the version the docs describe.

## 2. Classifying the 55 tables

Not every `<table>` is a list. Three kinds, treated differently:

- **A — Lists** (a record set that grows without bound): server-side search, filters, sort, paging, URL
  state, fills the screen. ~30 tables, §4.
- **B — Bounded sub-tables** inside a record page (an order's items, a product's sizes, a refund list): the
  same `DataTable` component in **client mode** — sorting/visibility, no pager — because the set is bounded by
  its parent and already in the page's one request. ⚠ If a sub-table's set is *not* bounded (a shop's stock,
  a shop's audit history, a customer's points, a product's stock history), it is **A**, not B.
- **C — Operational boards and editors** (dispatch rounds, windows by day, hub station, today's windows,
  duty panel, pick list, pack bags, plan/slot/attachment editors, review diff, variant editors, the admin
  permission matrix): these are layouts that happen to use table markup — grouped by day/window, editable
  in place, or a matrix. They keep the primitives and gain nothing from paging. Out of scope except for
  styling parity.

## 3. The design

### 3.1 One wire contract (backend)

```ts
// @effy/shared-types — list.ts
export interface ListQuery<Sort extends string, F> {
  q?: string;                 // ≤ 100 chars, trimmed; empty = absent
  sort?: Sort;                // a key from the endpoint's whitelist
  dir?: "asc" | "desc";
  page?: number;              // 1-based (offset mode)
  cursor?: string;            // opaque (keyset mode)
  pageSize?: 25 | 50 | 100;
  filters: F;                 // typed per endpoint, flat query params on the wire
}
export interface ListPage<T> {
  items: T[];
  pageSize: number;
  total: number | null;       // exact, or null when not counted (keyset past the cap)
  totalCapped?: boolean;      // "10,000+"
  page?: number;              // offset mode
  nextCursor?: string | null; // keyset mode
  prevCursor?: string | null;
}
```

**Two modes, chosen per endpoint, one shape:**

- **Offset + exact total (default).** Every config-like or human-sized set: shops, drivers, vehicles,
  products, review queue, promotions, feedback, deliverability, coverage postcodes, imports, team, courier
  parcels, exceptions. `count(*) OVER()` in the same query (shop orders already does this, including the
  past-the-last-page fallback). Gives page numbers, "1–25 of 312" and jump-to-last. Deep offsets capped
  (e.g. 10 000 rows) — past that, search is the tool.
- **Keyset + capped count** for append-heavy ledgers read newest-first, where offset drifts as rows arrive
  and gets slow deep: **orders**, points history, stock history, shop audit history, label reads /
  hand-overs. Cursor = base64url of `[sortValue, id]`, `WHERE (col, id) < ($1, $2)` — always a total order.
  Count via a separate `count(*)` over the same `WHERE`, capped (`LIMIT 10001` sub-select), cached by the
  query key so paging doesn't recount.

**One helper**, `@effy/edge-shared` `lib/list-query.ts`:
`parseListQuery(event, { sorts: {key: "sql expr"}, defaultSort, filters: schema })` → validated params (400
`validation` on a bad value, never a 500); `orderBy()` emits the whitelisted expression + `, id` in the same
direction; `pageClause()` / `keysetClause()`; `toListPage(rows, …)`. A guard test fails a list route that
splices a client sort string, has no `pageSize` cap, or has an `ORDER BY` without a unique tie-break.

**Counts for views** (the `ViewSelect` numbers) come back **once**, from a `/…/summary/views` call keyed by the
non-view filters (the orders pattern) — never N list calls.

**Gateway:** this changes query parameters on routes that already exist. Only a customer *browse* list is
new behaviour, and it is the existing `GET /orders/v1/customers` without `q`. **No new integrations** on
either gateway.

**Indexes** (one migration): trigram GIN on the searched text columns that lack one — order number, customer
email, shop name/code, variant SKU/barcode, vehicle plate, postcode, promotion name/code, feedback reference;
and a btree on each list's sort keys `(col, id)` where missing.

**Live updates:** unchanged (071). A list query's key starts with its live kind's key, so an announcement
invalidates the visible page; no `refetchInterval`.

### 3.2 One client layer (`@effy/web-kit/data-table`)

Replaces today's `DataTable` and the hand-rolled screens. Built on shadcn's data-table structure, made
server-side per the TanStack server-side guide.

| Piece | What it does |
|---|---|
| `useListSearch(route, spec)` | **The URL is the state.** `q`, filters, `sort`, `dir`, `page`/`cursor`, `size` live in TanStack Router search params (`validateSearch` from the same `spec`). Back, reload and shared links restore the exact view. Changing q/filter/sort/size resets the page. `q` is debounced (250 ms) before it reaches the URL. |
| `listQueryOptions(key, fetcher, params)` | TanStack Query options: every server-owned param in the key, `placeholderData: keepPreviousData` (the old page stays while the next loads — no flash to skeleton), next page prefetched when idle, abort on supersede (stale responses can't win). |
| `<DataTable>` | v9 `useTable` with `manualPagination/Sorting/Filtering`, `rowCount` (offset) or `pageCount: -1` (keyset), `getRowId: r => r.id` (selection survives paging). Sticky header; body scrolls inside the frame; first column pinned (`columnPinningFeature`) when the table overflows sideways. |
| `DataTableToolbar` | The existing `ViewSelect` / `Facet` / `SearchBox` / `ResetFilters`, plus a date-range facet and `DataTableViewOptions` (column visibility). |
| `DataTableColumnHeader` | Wraps `TableSortHead`; the one sort header (shop-web's `SortTh` goes). |
| `DataTablePagination` | "1–25 of 312", rows per page 25/50/100, First/Back/Next/Last + page number (offset); Back/Next + "10,000+" (keyset). |
| Row behaviour | The primary cell is a real `<Link>` (cmd-click, middle-click work); whole-row click opens it; J/K/Enter (already on Orders) everywhere; selection + a bulk-action bar where a list has bulk actions (shop orders today). |
| States | First load: skeleton rows matching the visible columns. Refetch: rows stay, a 2px progress line on the header. Error: `ErrorState` inside the frame with Retry. Empty vs **no matches** (offers Reset). |

**Columns are declared once, with meta** that drives everything screens do by hand today:

```ts
meta: {
  label: "Customers pay",       // header + column-visibility menu
  align?: "numeric" | "mono",   // TableCell numeric / mono
  priority?: 1 | 2 | 3,         // 1 always; 2 hidden < lg; 3 hidden < xl (replaces max-lg:hidden)
  phone?: "primary" | "meta" | "badge" | "trail" | "hide", // generates the ef-rtable stacked row
  sortKey?: string,             // the server's whitelist key; absent = not sortable
}
```

The phone stacked layout (`ef-rtable`) is generated from `phone`, so no screen writes `data-m` again.
Column visibility and widths are **per-viewer conveniences** → `localStorage` per table id, behind
try/catch; never server state.

### 3.3 Filling the screen

- `StaffShell` `<main>`: `min-h-[calc(100svh-var(--header-h))]` flex column.
- A list page is `<ListPage header toolbar>{table}</ListPage>`; the table frame is `flex-1 min-h-0`, the body
  scrolls inside it, the pager sits on the frame's bottom edge. **3 rows → the frame still reaches the
  bottom of the window**, rows at the top, pager at the bottom, the frame's own surface in between (no fake
  filler rows). 300 rows → header and pager stay put while the body scrolls.
- Empty / no-matches / error states centre in that same frame, so a list never changes height between states.
- Phones: the frame stops being height-bound (page scroll is the native gesture there); the pager follows
  the last row.

### 3.4 Performance and reliability

- ≤ 100 rows per page → **no virtualisation** (the TanStack docs: virtualise only when what is *loaded* is
  expensive to render). TanStack Virtual only for the client-held large sets in kind C (hub "earlier scans").
- Column definitions at module scope (stable references); cells are plain functions of `row.original`; no
  formatter allocates per render (`Intl` formatters cached in `lib/format`).
- One request per page view: list + (cached) view counts. Facet option lists (shops, zones, categories) are
  their own long-`staleTime` queries, shared across screens.
- Every list endpoint: bounded `pageSize`, validated params, a total order, an index for its default sort,
  and a container test for page 1 / last page / past-the-end / ties at the page edge.

## 4. The lists (kind A) — columns, filters, sort, mode

Columns in **bold** are new or changed; "→" is the move. P = priority (1 always, 2 ≥ lg, 3 ≥ xl).

### Back-office

| List | Columns (P) | Search | Filters | Sort | Mode / backend change |
|---|---|---|---|---|---|
| **Orders** | Order # + item summary (1) · Placed (1) · Customer email (2) · Delivery: who + promise/window (1) · Status pill (1) · Driver (2) · Next step (2) · Total (1) | number, email, package code | view, delivery, sold as, **status**, **shop**, **placed date range** | placed, total | keyset `(created_at,id)` — fix tie bug; sort by total = keyset `(total,id)`; total from the views count |
| Products (102) | as now; Shop (2), Aisle (2), Sizes (3), Shop price (2), Customers pay, Margin (2), State, Changed (3) | name, SKU, barcode | as now | as now | "Show more" → pager; offset-cursor → page+total |
| Review queue | Product · Shop · Kind · **Waiting (age)** · Lowest shop price (2) | product, shop | kind, shop | waiting, shop | keyset → offset+total |
| Missing details | Product · Shop · Category · Missing (count + names) | **add** | **shop, category** | **shop, missing** | cursor → offset+total |
| Margin not set | Product · Shop · Lowest shop price · Since | add | shop | since | cursor → offset+total |
| Imports | File · Shop · State · Rows (ok/failed) · Created | file | shop, state | created | cursor → offset+total |
| Promotions | Promotion · Gives · Who · Status · Active dates (2) · Used (2) · Shown in (3) | name, code | view, kind, applies, group | **start, end, used** | page+total (keep) |
| Promotion codes / customers (per promotion) | as now | **code** | state | — | page+total (keep) |
| Shops | Code · Name · Address (2) · Status · Users (2) · Label scanning (3) | code, name | status | **code, name** | page+total (keep) |
| Shop › stock | Product · SKU · In stock · Threshold · Status | add | status (low/out) | in stock | **unbounded → page+total** |
| Shop › history | When · Who · What | — | — | when | page+total → keyset |
| Drivers | Driver · Work email (2) · Cleared for · Duty · Employment (2) | name, email | view, zone | name | keyset → offset+total |
| Vehicles | Plate · Vehicle · Carries · Owner (2) · With (2) · Status | plate | view, refrigeration, owner | plate | keyset → offset+total |
| **Customers** | **Customer · Email · Joined · Orders · Last order · Points** | name, email, phone | **has orders, joined range** | **joined, last order, orders** | today search-only → **browse list**, page+total, same route |
| Customer › points | When · Change · Balance after · Reason · Order | — | kind | when | infinite → keyset pager |
| Feedback | Reference · Received · Category · Rating · Status · Message excerpt (2) | as now | view, category, rating | received, rating | keyset → offset+total; **counts in one call** |
| Deliverability | Address · State · Account · Reason (2) · Last event | address | view | last event | page+total (keep) |
| Coverage postcodes | Postcode · Places (2) · Group · Distance from hub · Delivery today · Actions | postcode, place | group, today on/off | postcode, distance | infinite → offset+total |
| Courier parcels | Order · Courier service · Due · Where it is | order, consignment ref | view (stage), service | due | **LIMIT 1000 → page+total** |
| Exceptions | Order · Reason · Driver · Destination (2) · Package (2) · When | order, package code | kind, resolved | when | **LIMIT 200 → page+total** |
| Attribute library | Name · Input · Unit (2) · Filter (2) · Shown to customers (2) · Per size (3) · Used by · Status | name | status, input | name, used by | client list → page+total |
| Promotion groups / skins | as now | name | — | name | **decision below** |

### Shop-web

| List | Columns | Search | Filters | Sort | Mode / backend change |
|---|---|---|---|---|---|
| Orders | as now (select · Order + items · Customer · Placed · Status · Goes with · Payment · Total) | as now | tab + as now | as now | page+total (keep); move to the shared table, drop `SortTh` |
| Catalogue | Product · Sizes (2) · Category (2) · Status · On the storefront · Your price | as now | as now | as now | page+total (keep) |
| Availability | **list → table**: Product · Size · In stock · Status · Last changed | name, SKU | view | stock, name | page+total (keep) |
| Product › stock history | When · Change · Count · Reason · By | — | reason | when | **unbounded → keyset** |
| Team | Name · Email · Role · Status · Last seen | name, email | role, status | name | client today; small — decision below |
| Insights › top products | bounded top-N | — | range | — | kind B (client) |

## 5. Decisions for the operator

1. **Small staff-configured sets** (promotion groups, skins, courier services, fee plans, shop team): server
   paging every one, as asked — or the same `DataTable` in client mode because they are bounded to tens of
   rows by what they are? *Recommended: client mode*, with a hard server cap so it can't silently grow
   past it. The TanStack docs are explicit that one dataset should be one or the other.
2. **TanStack Table v9.** *Recommended: adopt it in this feature* (3 v8 call sites today).
3. **Orders' default page size** 25 or 50 (keep 25/50/100 choice either way).

## 6. Order of work (for the plan)

1. Contract + `list-query.ts` helper + guard; index migration.
2. `@effy/web-kit/data-table` (v9) + `ListPage` + shell height; port Shops (simplest page+total) as the proof.
3. Port the keyset ledger (Orders, with the tie fix) — proves the second mode.
4. Remaining back-office lists, then shop-web, one PR-sized batch per domain; each removes its hand-rolled
   pager/sort/`data-m`.
5. Kind B sub-tables onto client mode; delete the old `DataTable`, `Pager`, shop-web `SortTh`/`TableFrame`.
