import { useEffect, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import {
  ArrowDown,
  ArrowUp,
  BellRing,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Columns3,
  Download,
  Inbox,
  Loader2,
  Search,
  SearchX,
  SlidersHorizontal,
  Table2,
  X,
} from "lucide-react"

import {
  SHOP_ORDER_DELIVERED_BY,
  SHOP_ORDER_PAYMENT_STATES,
  SHOP_ORDER_RANGES,
  SHOP_ORDER_TABS,
  type ShopOrderSort,
} from "@effy/shared-types"
import { Button, Checkbox, Input, Skeleton, toast } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"
import { Facet, PageHeader } from "@effy/web-kit/patterns"

import { track } from "@/lib/telemetry"
import { cn } from "@/lib/utils"

import { Segmented } from "@/components/console/primitives"

import { useNow } from "@/features/today/useNow"

import { BulkActions } from "./components/BulkActions"
import { OrderFiltersSheet } from "./components/OrderFiltersSheet"
import { PackageStatusPill } from "@effy/web-kit/console"
import { paymentTextClass } from "./components/OrderPill"
import { OrderQueue } from "./components/OrderQueue"
import { OrderWait } from "./components/OrderWait"
import {
  activeFilterCount,
  deliveredByText,
  DELIVERED_BY_FILTER_LABEL,
  RANGE_LABEL,
  formatMoney,
  isFiltered,
  orderRowTone,
  PAYMENT_LABEL,
  TAB_LABEL,
  toListQuery,
  validateOrdersSearch,
  type OrderRow,
  type OrderRowTone,
  type OrdersSearch,
} from "./orderConsole"
import { runTime } from "./collection"
import { courierPickupLine } from "./courierPickup"
import { downloadOrdersCsv, exportOrdersCsv } from "./exportOrders"
import { orderListQuery } from "./queries"

/**
 * The Orders list: search, Filters (a right-side sheet) and Export CSV; the status tabs; the result count
 * with "Clear filters"; the bulk bar; the table; the empty state; Previous / Next. Effy's model, not the
 * design's: the tabs are Effy's states (a shop never ships), "Goes with" (Effy driver / Courier) replaces
 * a channel filter, and the row's flag is "At risk" against the ready-by promise.
 *
 * Narrowing is server-side, so tab counts cover every state; the state lives in the URL. Newest first; an
 * order just arrived is washed `--success-soft` and one nobody has opened `--warning-soft`
 * (`orderRowTone`).
 */
export function OrderListScreen({
  search,
  onSearchChange,
  onOpenOrder,
}: {
  search: OrdersSearch
  onSearchChange: (next: OrdersSearch) => void
  onOpenOrder: (id: string) => void
}) {
  const { data, error, isPending, isError, refetch, isPlaceholderData } = useQuery(orderListQuery(search))
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [exporting, setExporting] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  // The row tones AGE. The list polls every 15 s; without a clock of its own a row washed green on
  // arrival would stay green until the next fetch changed something, which on a quiet afternoon is
  // never (058 FR-009 — a highlight that outlives its claim is read as fresh).
  const now = useNow(15_000)

  const tab = search.tab ?? "all"
  const searchKey = JSON.stringify(toListQuery(search))

  useEffect(() => {
    track({ name: "shop_order_queue_viewed", state: tab === "all" || tab === "new" || tab === "picking" ? "active" : "completed" })
  }, [tab])

  // Selection is cleared whenever the list changes under it — acting on rows no longer visible is
  // the definition of an unreviewed bulk action.
  useEffect(() => {
    setSelected(new Set())
  }, [searchKey])

  /** Every change but paging returns to page one — page 3 of a narrower list may not exist. */
  function update(patch: Partial<OrdersSearch>, keepPage = false) {
    const next = { ...search, ...patch }
    if (!keepPage) delete next.page
    onSearchChange(validateOrdersSearch(next as Record<string, unknown>))
  }

  const rows = data?.items ?? []
  const total = data?.total ?? 0
  const page = data?.page ?? search.page ?? 1
  const pageSize = data?.pageSize ?? 25
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const filtered = isFiltered(search)
  // Anything that narrows the list — the search, a filter or a tab — earns "Clear filters".
  const dirty = filtered || tab !== "all"
  const filterCount = activeFilterCount(search)
  const countLabel = !data
    ? ""
    : total === 0
      ? "No matches"
      : `Showing ${(page - 1) * pageSize + 1}–${(page - 1) * pageSize + rows.length} of ${total}`

  /** "Clear filters": back to every order — search, filters and tab — keeping only the sort. */
  function clearAll() {
    onSearchChange(validateOrdersSearch({ sort: search.sort, dir: search.dir }))
  }
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const someOnPage = rows.some((r) => selected.has(r.id))

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  async function exportCsv() {
    setExporting(true)
    try {
      // The export itself moved to `exportOrders.ts` when Today's Quick actions became its
      // second caller. Two implementations would mean two CSV shapes, and the divergence would be
      // noticed in a spreadsheet on someone else's desk long after the change that caused it.
      const exported = await exportOrdersCsv(search)
      toast.success(`Exported ${exported} order${exported === 1 ? "" : "s"}`)
    } catch {
      toast.error("The export couldn't be built. Try again in a moment.")
    } finally {
      setExporting(false)
    }
  }

  const view = search.view === "queue" ? "queue" : "table"

  return (
    <div className="flex min-w-0 flex-col gap-6 max-md:gap-4">
      <PageHeader
        title="Orders"
        description={
          view === "queue"
            ? "Orders to pick and pack, oldest first; scan a bag label to open its order."
            : "Every order containing your shop's items, with where each one is up to."
        }
        actions={
          <>
            <Segmented
              ariaLabel="Show orders as"
              value={view}
              onChange={(v) => onSearchChange(validateOrdersSearch({ ...search, view: v === "queue" ? "queue" : undefined } as Record<string, unknown>))}
              options={[
                { value: "table", label: <><Table2 aria-hidden="true" />Table</> },
                { value: "queue", label: <><Columns3 aria-hidden="true" />Queue</> },
              ]}
            />
            <Button variant="outline" disabled={exporting || total === 0} onClick={() => void exportCsv()}>
              {exporting ? <Loader2 className="animate-spin" /> : <Download aria-hidden="true" />}
              Export CSV
            </Button>
          </>
        }
      />

      {view === "queue" ? (
        <OrderQueue search={search} now={now} />
      ) : (
        <>
          {/* The status tabs: saved views with their counts, underlined, kept in the URL. */}
          <div role="tablist" aria-label="Order status" className="bo-tabs">
            {SHOP_ORDER_TABS.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={t === tab}
                onClick={() => update({ tab: t })}
                className={cn("bo-tabs__tab", t === tab && "is-active")}
              >
                {TAB_LABEL[t]}
                {data ? (
                  <span className={cn("bo-tabs__count", t === "new" && t !== tab && data.counts[t] > 0 && "bo-tabs__count--primary")}>
                    {data.counts[t]}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {/* Search, the three facets (a laptop or landscape tablet), Filters (a portrait tablet or phone). */}
          <div className="bo-toolbar">
            <SearchBox value={search.q ?? ""} onChange={(q) => update({ q })} />
            <Facet
              label="Placed"
              className="max-[1023px]:hidden"
              anyLabel={RANGE_LABEL.any}
              value={search.range ?? null}
              options={SHOP_ORDER_RANGES.filter((r) => r !== "any").map((r) => ({ value: r, label: RANGE_LABEL[r] }))}
              onChange={(range) => update({ range: range ?? undefined })}
            />
            <Facet
              label="Goes with"
              className="max-[1023px]:hidden"
              anyLabel={DELIVERED_BY_FILTER_LABEL.any}
              value={search.deliveredBy ?? null}
              options={SHOP_ORDER_DELIVERED_BY.filter((d) => d !== "any").map((d) => ({ value: d, label: DELIVERED_BY_FILTER_LABEL[d] }))}
              onChange={(deliveredBy) => update({ deliveredBy: deliveredBy ?? undefined })}
            />
            <Facet
              label="Payment"
              className="max-[1023px]:hidden"
              value={search.payment ?? null}
              options={SHOP_ORDER_PAYMENT_STATES.map((p) => ({ value: p, label: PAYMENT_LABEL[p] }))}
              onChange={(payment) => update({ payment: payment ?? undefined })}
            />
            <Button variant="outline" className="min-[1024px]:hidden" onClick={() => setFiltersOpen(true)}>
              <SlidersHorizontal aria-hidden="true" />
              Filters
              {filterCount > 0 ? <span className="bo-tabs__count bo-tabs__count--primary">{filterCount}</span> : null}
            </Button>
            {dirty ? (
              <Button variant="ghost" onClick={clearAll}>
                Clear filters
                <X aria-hidden="true" />
              </Button>
            ) : null}
          </div>

          <OrderFiltersSheet
            open={filtersOpen}
            onOpenChange={setFiltersOpen}
            search={search}
            countLabel={countLabel}
            onChange={(patch) => update(patch)}
            onClearAll={() => update({ range: undefined, payment: undefined, deliveredBy: undefined, attention: undefined })}
          />

          {selected.size > 0 ? (
            <BulkActions rows={rows} selected={selected} onClear={() => setSelected(new Set())} onExport={downloadOrdersCsv} />
          ) : null}

          {isError ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : isPending ? (
            <ListLoading />
          ) : total === 0 ? (
            <EmptyState filtered={dirty} onReset={clearAll} />
          ) : (
            <div className={cn("bo-table-wrap transition-opacity", isPlaceholderData && "opacity-60")}>
              <div className="bo-table-scroll">
                <table className="bo-table bo-rtable min-w-[900px] max-md:min-w-0">
                  <thead>
                    <tr>
                      <th className="is-check">
                        <Checkbox
                          aria-label="Select all on this page"
                          checked={allOnPage ? true : someOnPage ? "indeterminate" : false}
                          onCheckedChange={(v) => setSelected(v === true ? new Set(rows.map((r) => r.id)) : new Set())}
                        />
                      </th>
                      <SortTh label="Order" sortKey="number" search={search} onSort={update} />
                      <SortTh label="Customer" sortKey="customer" search={search} onSort={update} />
                      <SortTh label="Placed" sortKey="placed" search={search} onSort={update} />
                      <SortTh label="Status" search={search} onSort={update} />
                      <SortTh label="Goes with" search={search} onSort={update} />
                      <SortTh label="Payment" search={search} onSort={update} />
                      <SortTh label="Total" sortKey="total" align="right" search={search} onSort={update} />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((o) => {
                      const sel = selected.has(o.id)
                      const tone = orderRowTone(o, now)
                      return (
                        <tr
                          key={o.id}
                          onClick={() => onOpenOrder(o.id)}
                          data-state={sel ? "selected" : undefined}
                          data-tone={tone ?? undefined}
                          className={cn(
                            "cursor-pointer",
                            // The tone is skipped on a selected row, not layered under it, so a ticked
                            // row is never hidden under another highlight.
                            !sel && tone === "recent" && "is-recent",
                            !sel && tone === "unopened" && "is-unopened",
                            sel && "is-selected",
                          )}
                        >
                          {/* Ticking a row must not also open it. */}
                          <td className="is-check" data-m="check" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              aria-label={`Select ${o.orderNumber}`}
                              checked={sel}
                              onCheckedChange={(v) => toggle(o.id, v === true)}
                            />
                          </td>
                          <td data-m="primary">
                            <Link
                              to="/orders/$fulfillmentId"
                              params={{ fulfillmentId: o.id }}
                              search={search}
                              onClick={(e) => e.stopPropagation()}
                              className="bo-code font-mono font-medium text-foreground no-underline hover:underline"
                            >
                              {o.orderNumber}
                            </Link>
                            <span className="bo-sub max-w-[22ch] truncate">{o.itemsSummary}</span>
                          </td>
                          <td data-m="meta">
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="font-medium break-words">{o.customerName || "—"}</span>
                              <RowFlag row={o} tone={tone} />
                            </span>
                          </td>
                          <td data-m="meta" className="whitespace-nowrap text-muted-foreground">
                            <OrderWait row={o} now={now} />
                          </td>
                          <td data-m="badge">
                            {/* Where it really is, past Collected; the shared words. */}
                            <PackageStatusPill view={o.statusView} showDetail={false} />
                          </td>
                          <td data-m="meta">
                            {deliveredByText(o.deliveredBy)}
                            {o.courierPickup ? (
                              <span className="bo-sub" data-testid="row-courier-pickup">
                                {courierPickupLine(o.courierPickup)}
                              </span>
                            ) : o.collection ? (
                              <span className="bo-sub">{runTime(o.collection)} run</span>
                            ) : null}
                          </td>
                          <td data-m="hide" className={cn("whitespace-nowrap", paymentTextClass(o.payment))}>
                            {PAYMENT_LABEL[o.payment]}
                          </td>
                          <td data-m="trail" className="is-num font-semibold whitespace-nowrap">
                            {formatMoney(o.total, o.currency)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="bo-pager">
                <span className="tabular-nums" aria-live="polite">
                  {countLabel}
                </span>
                <div className="bo-pager__right">
                  <span className="tabular-nums whitespace-nowrap">
                    Page {page} of {pageCount}
                  </span>
                  <div className="bo-pager__btns">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => update({ page: page - 1 }, true)}>
                      <ChevronLeft aria-hidden="true" />
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => update({ page: page + 1 }, true)}>
                      Next
                      <ChevronRight aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/**
 * The row's flag chip (`padding:1px 6px; border-radius:4px; 10.5px; coloured border and text`).
 * Effy's "risk" is the promise: an open order near or past its ready-by. A shortfall is the other
 * thing a shop must see from the list, so it takes the same chip in the quiet tone.
 *
 * The tone chip is what makes the wash legal. The row's colour is the finder — it is what lets an
 * operator spot the row from across a bench — and the word is the meaning. Colour alone excludes a
 * colour-blind operator, a screen-reader user and anyone printing the list, which is the same rule
 * Today's Live orders keeps (its green row also says "New") and the same one every status pill on
 * this screen keeps.
 *
 * The chip is bordered and unfilled, unlike Today's. Here the row itself carries the `-soft` fill,
 * so a chip with that same fill would dissolve into it — most visibly on an unopened row, whose
 * status pill is already `--warning-soft`. The bordered chip is this component's existing device
 * ("At risk", "N short") and cannot collide with any wash.
 *
 * "Not opened" is not what the status pill says. That pill maps `pending` and `received` both to
 * "Awaiting pick" — the same work — so until now the console could not show that an order had never
 * been looked at by anyone.
 */
function RowFlag({ row, tone }: { row: OrderRow; tone: OrderRowTone | null }) {
  return (
    <>
      {tone === "recent" ? (
        <span className="bo-st bo-st--info">
          <BellRing aria-hidden="true" />
          New
        </span>
      ) : null}
      {tone === "unopened" ? <span className="bo-tag">Not opened</span> : null}
      {row.atRisk ? (
        <span className="bo-st bo-st--problem">
          <CircleAlert aria-hidden="true" />
          At risk
        </span>
      ) : null}
      {row.unavailableCount > 0 ? <span className="bo-tag">{row.unavailableCount} short</span> : null}
    </>
  )
}

function SortTh({
  label,
  sortKey,
  width,
  align = "left",
  search,
  onSort,
}: {
  label: string
  sortKey?: ShopOrderSort
  width?: string
  align?: "left" | "right"
  search: OrdersSearch
  onSort: (patch: Partial<OrdersSearch>) => void
}) {
  const current = !!sortKey && (search.sort ?? "placed") === sortKey
  // Descending, matching `validateOrdersSearch` and the service. Reading "asc" here would draw ↑
  // over a newest-first list and make the first click on `Placed` a no-op.
  const dir = search.dir ?? "desc"
  return (
    <th
      className={cn(align === "right" && "is-num")}
      style={width ? { width } : undefined}
      aria-sort={current ? (dir === "asc" ? "ascending" : "descending") : undefined}
    >
      <button
        type="button"
        disabled={!sortKey}
        // First click on a new column sorts descending; a second click flips it.
        onClick={() => sortKey && onSort({ sort: sortKey, dir: current ? (dir === "asc" ? "desc" : "asc") : "desc" })}
        className={cn(
          "flex min-h-11 w-full items-center gap-1 border-none bg-transparent p-0 font-[inherit] text-[inherit] whitespace-nowrap text-muted-foreground",
          align === "right" ? "justify-end" : "justify-start",
          sortKey ? "cursor-pointer hover:text-foreground" : "cursor-default",
        )}
      >
        {label}
        {/* The arrow is rendered only for the active column, in the action colour. An arrow on
            every header says every column is sorted; a neutral glyph everywhere is noise in a row
            that is already dense. */}
        {current ? (
          dir === "asc" ? <ArrowUp aria-hidden="true" className="size-3.5 text-foreground" /> : <ArrowDown aria-hidden="true" className="size-3.5 text-foreground" />
        ) : null}
      </button>
    </th>
  )
}

/**
 * The search box — 250px, a ✕ inside it once there is text. Debounced: every keystroke would
 * otherwise be a server round trip and a URL write.
 */
function SearchBox({ value, onChange }: { value: string; onChange: (q: string) => void }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  useEffect(() => {
    if (text === value) return
    const t = setTimeout(() => onChange(text), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce on the text only
  }, [text])

  return (
    <label className="bo-toolbar__search">
      <Search aria-hidden="true" />
      <Input
        aria-label="Search"
        type="search"
        placeholder="Order, customer or SKU…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="pr-11!"
      />
      {text ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Clear search"
          onClick={() => {
            setText("")
            onChange("")
          }}
          className="absolute right-1.5"
        >
          <X className="size-4" />
        </Button>
      ) : null}
    </label>
  )
}

/** Every empty list says why it is empty and what to do — distinct copy for "none yet" and "none match". */
function EmptyState({ filtered, onReset }: { filtered: boolean; onReset: () => void }) {
  return (
    <div className="bo-empty">
      <span className="bo-empty__icon" aria-hidden="true">
        {filtered ? <SearchX /> : <Inbox />}
      </span>
      <h3>{filtered ? "No orders match these filters" : "No orders yet"}</h3>
      <p>
        {filtered
          ? "Widen the date range, clear the search, or reset everything and start again."
          : "Orders appear here the moment a customer pays for something your shop supplies. This list updates by itself."}
      </p>
      {filtered ? (
        <Button variant="outline" className="mt-2" onClick={onReset}>
          Reset filters
        </Button>
      ) : null}
    </div>
  )
}

/** A loading table in the shape of the one it replaces. */
function ListLoading() {
  return (
    <div className="bo-table-wrap" aria-busy="true" aria-label="Loading orders">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-border px-4 py-4 last:border-b-0">
          <Skeleton className="size-5 rounded" />
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3.5 w-48" />
          </div>
          <Skeleton className="h-6 w-24 rounded-md" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}
