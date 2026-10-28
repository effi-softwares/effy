# Contract — `@effy/web-kit/data-table` (the client layer)

One module used by back-office and shop-web. Replaces `@effy/web-kit/console` `DataTable`, the
`patterns` `Pager`, shop-web's `SortTh` / `TableFrame` / `Th` / `Td` / `Tr` and every hand-placed `data-m`.

## Exports

```ts
// Column meta (typed through the column helper)
interface EffyColumnMeta {
  label: string;                       // header text + column menu
  align?: "numeric" | "mono";          // → TableCell numeric / mono
  priority?: 1 | 2 | 3;                // 1 always; 2 hidden < lg; 3 hidden < xl
  phone?: "primary" | "meta" | "badge" | "trail" | "hide" | "full";
  sortKey?: string;                    // server whitelist key; absent = not sortable
  identifying?: true;                  // cannot hide (FR-013/014); exactly one per table
}

// Route search: one spec per list → validateSearch + defaults
defineListSearch<F>(spec: { sorts: readonly string[]; defaultSort; defaultDir; filters: FilterSpec<F> })
  → { validateSearch(raw): ListSearch<F>; toQuery(search): ListQueryParams }

useListState(route)                    // reads Route.useSearch(); setQ (debounced 250 ms), setFilter,
                                       // setSort, setPage, setPageSize — each resets page where FR-006 says

listQuery(key, fetcher, params)        // queryOptions: keepPreviousData, signal, page+1 prefetch (offset)

<ListPage header toolbar>…</ListPage>   // full-height layout (R7)

<DataTable
  id="orders"                          // localStorage key for hidden columns (R15)
  columns={columns}
  page={query.data}                    // ListPage<T> | undefined
  state={{ isPending, isFetching, isError, error, refetch }}
  sort={…} onSort={…}                  // from useListState
  pagination={…} onPagination={…}
  rowHref={(r) => ({ to, params })}    // whole-row click + primary-cell link + Enter
  selection?={{ selected, onChange }}  // FR-019
  empty={{ title, body, action? }}     // nothing exists
  filtered={boolean} onReset={…}       // distinguishes "no matches"
/>

<StaticTable id columns rows sortable? />   // kind B: client mode, no pager, same look
<DataTableToolbar> <ViewSelect/> <Facet/> <DateRangeFacet/> <SearchBox/> <ResetFilters/> <ColumnMenu/>
```

## Behaviour (each line is a test in `data-table/__tests__`)

- Header cells for `sortKey` columns are `TableSortHead` with `aria-sort`; clicking cycles asc → desc on the
  active column, a new column starts at its default direction.
- Pager: "1–25 of 312" / "10,000+"; rows 25/50/100; First/Back/Next/Last + "Page 3 of 13" when `page !== null`;
  Back/Next only in keyset mode.
- `isPending && !data` → skeleton rows (count = pageSize capped at 10, cells shaped per `align`).
- `isFetching && data` → rows stay, `aria-busy`, 2 px progress bar under the header.
- `isError` → `ErrorState` in the body region with Retry; toolbar untouched.
- `items.length === 0`: `filtered` → "No matches" + Reset; else the `empty` content.
- `ignored.length > 0` → one muted line above the table: "Some filters in this link no longer exist and were
  removed."
- J/K move a focus ring through rows; Enter opens; "/" focuses search (existing `SearchBox`).
- Hidden columns: `ColumnMenu` toggles; persisted per `id`; `identifying` cannot hide.
- Phone (`< md`): the table element gets `ef-rtable`; each cell gets `data-m` from `meta.phone` and
  `data-label` from `meta.label`.
- Layout: md+ the frame fills `ListPage`'s remaining height; header `sticky top-0`; pager pinned bottom.
