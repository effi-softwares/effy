# Quickstart — validating 103 Console Data Tables

Claude writes the code. **The operator runs every migration and deploy** (CLAUDE.md "Mode of work").

## 1. Local checks (Claude / CI)

```sh
pnpm --filter @effy/web-kit test               # data-table behaviour tests (contracts/data-table-ui.md)
make edge-test                                 # list-query helper, list-query.guard, every list service
make bo-test && make bo-lint && make bo-build
pnpm --filter @effy/shop-web test && pnpm --filter @effy/shop-web build
pnpm --filter @effy/design-system test         # tokens/shape/usage guards stay green
scripts/check-no-refresh-timers.sh             # 071: no timers added
```

Container tests (need Docker Desktop; `DOCKER_CONFIG=$(mktemp -d)` so testcontainers does not hang on the
credential helper) cover, per converted list: page 1, last page, past-the-end, a tie on the sort value across
a page edge (FR-003), inserts during keyset paging (FR-004, orders), the depth limit, and access scoping.

## 2. Migration (operator)

```sh
make db-status ENV=dev
make db-up-one ENV=dev        # <ts>_console_list_indexes.sql — CONCURRENTLY, no table locks
```

## 3. Deploy (operator), backend before consoles

```sh
make edge-deploy-all ENV=dev SERVICES="orders catalog admin admin-promotions fleet inventory-staff inventory shop"
```
then the consoles' pipelines (048) for back-office and shop-web, straight after. ⚠ Lists that change mode
(drivers, vehicles, feedback, review queue, missing details, margin not set, products, imports, coverage: keyset
or "show more" → page + total) ignore the old `cursor` parameter, so a console older than the backend shows
only their first page until the console deploys. Nothing is written by a list, so the gap is cosmetic; keep it
short. Every other list is additive (`PagedDTO` → `ListPage` keeps every old field).

## 4. Performance check (operator, dev)

Seed volumes (a generator script added in the tasks; `docs/test-data` holds only small fixtures) (≥ 100 000 orders, 20 000 products) and
`EXPLAIN (ANALYZE, BUFFERS)` the list query of Orders (default sort, a search, a cursor 10 000 rows deep), Products (search),
Customers (browse), Courier parcels. Each must use an index scan for its order and its search; any index from
the migration that no plan uses is dropped in a follow-up migration (R9).

## 5. Walk (operator) — the spec's acceptance scenarios

On each converted list (spec "The lists"):

1. Search, filter, sort, change page size, page → whole data set, page resets on change (US1).
2. Reload; open a record and press Back; open the address in a private window → same view (US2).
3. 0, 3 and 100 rows on a 1080 px tall window → frame reaches the bottom; header and pager stay while rows
   scroll; phone width → stacked rows (US3).
4. Columns match the spec table; narrow the window → priority 3 then 2 hide; hide a column, reload (US4).
5. Courier parcels with > 1 000 and exceptions with > 200 → last page reachable; throttle the network → rows
   stay with a progress line; offline → error with Retry; nonsense search → "No matches" + Reset (US5).
6. A list with views: counts match the opened view; DevTools shows one counts request (US6).
7. An order's page: items, packages, refunds tables share the look, no pager (US7).
8. Change an order elsewhere → the Orders page refreshes in place (FR-018).
