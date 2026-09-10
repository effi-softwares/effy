import { useEffect, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Loader2, X } from "lucide-react"

import { SHOP_ORDER_TABS, type ShopOrderSort } from "@effy/shared-types"
import {
  Button,
  Checkbox,
  Skeleton,
  toast,
} from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"

import { track } from "@/lib/telemetry"
import { cn } from "@/lib/utils"

import { BulkActions } from "./components/BulkActions"
import { OrderFiltersSheet } from "./components/OrderFiltersSheet"
import { OrderStatusPill, paymentTextClass } from "./components/OrderPill"
import {
  activeFilterCount,
  formatMoney,
  formatPlacedShort,
  isFiltered,
  PAYMENT_LABEL,
  TAB_LABEL,
  toCsv,
  toListQuery,
  validateOrdersSearch,
  type OrderRow,
  type OrdersSearch,
} from "./orderConsole"
import { orderListQuery } from "./queries"
import { listOrders } from "./repo"

/**
 * The Orders list — transcribed from the imported design's `isOrders` block ("Effy Shop Console.dc.html"),
 * row for row (revision 3): search + Filters + Export CSV; the segmented status tabs on their own row;
 * the result count with "Clear filters" over one rule; the bulk bar; the bordered table with a muted
 * header; the dashed empty state; Previous / Next. The filters themselves live in a right-side sheet.
 *
 * ⚠ REMOVED ON PURPOSE (revision 3) — do not re-add: the saved-views pills (presets of these same
 * filters), a Fulfilment select (the tabs do that job) and the uppercase labels above body selects.
 *
 * ⚠ WHERE IT DEPARTS FROM THE MOCKUP, IT IS FOR EFFY'S MODEL, NOT FOR TASTE:
 *   • the tabs are Effy's states (Awaiting pick · Picking · Ready · Collected · Delivered · Can't supply
 *     · Cancelled), not "Packed / Shipped" — a shop never ships anything (049);
 *   • the design's Channel filter is Delivery (same-day / standard) — Effy has one sales channel, and
 *     how the package travels is the dimension that actually splits a shop's orders;
 *   • the row's flag is "At risk" against the ready-by promise — Effy has no fraud score.
 *
 * ⚠ EVERYTHING THAT NARROWS THE LIST IS SERVER-SIDE, so the tab counts cover every state and a search
 * finds last month's order. The state lives in the URL (`search` / `onSearchChange`). The default sort
 * is oldest first — the order that has waited longest is the one to pick next (020 FR-001b).
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

  const tab = search.tab ?? "all"
  const searchKey = JSON.stringify(toListQuery(search))

  useEffect(() => {
    track({ name: "shop_order_queue_viewed", state: tab === "all" || tab === "new" || tab === "picking" ? "active" : "completed" })
  }, [tab])

  // ⚠ Selection is cleared whenever the list changes under it — acting on rows no longer visible is
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
      // ⚠ Every matching row, not just this page — capped, because a CSV of a shop's entire history is
      // a report, not an export button.
      const all: OrderRow[] = []
      for (let p = 1; p <= 40; p++) {
        const res = await listOrders({ ...toListQuery(search), page: p })
        all.push(...res.items)
        if (all.length >= res.total || res.items.length === 0) break
      }
      downloadCsv(all)
      toast.success(`Exported ${all.length} order${all.length === 1 ? "" : "s"}`)
    } catch {
      toast.error("The export couldn't be built. Try again in a moment.")
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="grid gap-4">
      {/* ── The controls: three rows, 22px apart; a rule under the result meta (revision 3) ────── */}
      <div className="grid gap-[22px]">
        {/* Row 1 — search, then the page actions */}
        <div className="flex flex-wrap items-center gap-2">
          <SearchBox value={search.q ?? ""} onChange={(q) => update({ q })} />
          <div className="flex-1" />
          <Button
            variant="outline"
            className="h-[34px] gap-[7px] px-3 text-[13px]"
            onClick={() => setFiltersOpen(true)}
          >
            Filters
            {filterCount > 0 ? (
              <span className="bg-primary text-primary-foreground grid h-[17px] min-w-[17px] place-items-center rounded-[5px] px-[5px] font-mono text-[11px] font-medium">
                {filterCount}
              </span>
            ) : null}
          </Button>
          <Button
            variant="outline"
            className="h-[34px] px-3 text-[13px]"
            disabled={exporting || total === 0}
            onClick={() => void exportCsv()}
          >
            {exporting ? <Loader2 className="animate-spin" /> : null}
            Export CSV
          </Button>
        </div>

        {/* Row 2 — the status tabs, on their own row */}
        <div
          role="tablist"
          aria-label="Order status"
          className="bg-muted flex flex-wrap gap-0.5 justify-self-start rounded-lg p-[3px]"
        >
          {SHOP_ORDER_TABS.map((t) => {
            const active = tab === t
            return (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => update({ tab: t })}
                className={cn(
                  "focus-visible:ring-ring flex h-7 cursor-pointer items-center gap-1.5 rounded-md border-none px-[11px] text-[13px] focus-visible:ring-2 focus-visible:outline-none",
                  active
                    ? "bg-background text-foreground font-medium shadow-sm"
                    : "text-muted-foreground hover:text-foreground bg-transparent font-normal",
                )}
              >
                {TAB_LABEL[t]}
                <span className="font-mono text-[11.5px] tabular-nums opacity-65">
                  {data ? data.counts[t] : ""}
                </span>
              </button>
            )
          })}
        </div>

        {/* Row 3 — the result meta, then the rule that separates the controls from the table */}
        <div className="border-border flex flex-wrap items-center gap-3 border-b pb-3">
          <div className="text-muted-foreground text-[13px] whitespace-nowrap tabular-nums" aria-live="polite">
            {countLabel}
          </div>
          {dirty ? (
            <button
              type="button"
              onClick={clearAll}
              className="text-muted-foreground hover:bg-accent hover:text-foreground h-[26px] cursor-pointer rounded-md border-none bg-transparent px-[9px] text-[12.5px] font-medium whitespace-nowrap"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      <OrderFiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        search={search}
        countLabel={countLabel}
        onChange={(patch) => update(patch)}
        onClearAll={() => update({ range: undefined, payment: undefined, method: undefined, attention: undefined })}
      />

      {selected.size > 0 ? (
        <BulkActions rows={rows} selected={selected} onClear={() => setSelected(new Set())} onExport={downloadCsv} />
      ) : null}

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <ListSkeleton />
      ) : total === 0 ? (
        <EmptyState
          filtered={dirty}
          onReset={clearAll}
        />
      ) : (
        <>
          {/* ── The table — always rendered; it scrolls sideways on a narrow viewport rather than
              being swapped for a stripped-down list (revision 2). ─────────────────────────────── */}
          <div
            className={cn(
              "border-border overflow-x-auto rounded-[var(--radius)] border transition-opacity",
              isPlaceholderData && "opacity-60",
            )}
          >
            <table className="w-full min-w-[820px] table-fixed border-collapse">
              <thead>
                <tr className="bg-muted">
                  <th className="w-[34px] py-[9px] pl-3.5">
                    <Checkbox
                      aria-label="Select all on this page"
                      className="size-4"
                      checked={allOnPage ? true : someOnPage ? "indeterminate" : false}
                      onCheckedChange={(v) => setSelected(v === true ? new Set(rows.map((r) => r.id)) : new Set())}
                    />
                  </th>
                  <SortTh label="Order" sortKey="number" width="11%" search={search} onSort={update} />
                  <SortTh label="Customer" sortKey="customer" width="19%" search={search} onSort={update} />
                  <SortTh label="Items" search={search} onSort={update} />
                  <SortTh label="Placed" sortKey="placed" width="8%" search={search} onSort={update} />
                  <SortTh label="Fulfilment" width="13%" search={search} onSort={update} />
                  {/* ⚠ Wide enough for "Partially refunded", its longest label, on one line. */}
                  <SortTh label="Payment" width="14%" search={search} onSort={update} />
                  <SortTh label="Total" sortKey="total" width="11%" align="right" search={search} onSort={update} />
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => {
                  const sel = selected.has(o.id)
                  return (
                    <tr
                      key={o.id}
                      onClick={() => onOpenOrder(o.id)}
                      data-state={sel ? "selected" : undefined}
                      className={cn("border-border hover:bg-accent cursor-pointer border-t", sel && "bg-accent")}
                    >
                      {/* ⚠ Ticking a row must not also open it. */}
                      <td className="py-3 pl-3.5" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          aria-label={`Select ${o.orderNumber}`}
                          className="size-4"
                          checked={sel}
                          onCheckedChange={(v) => toggle(o.id, v === true)}
                        />
                      </td>
                      <td className="px-3.5 py-3">
                        <Link
                          to="/orders/$fulfillmentId"
                          params={{ fulfillmentId: o.id }}
                          search={search}
                          onClick={(e) => e.stopPropagation()}
                          className="text-muted-foreground hover:text-foreground font-mono text-[12.5px] whitespace-nowrap no-underline"
                        >
                          {o.orderNumber}
                        </Link>
                      </td>
                      <td className="px-3.5 py-3">
                        {/* Wraps rather than overflowing when a flag rides beside the name. */}
                        <div className="flex flex-wrap items-center gap-x-[7px] gap-y-[3px]">
                          <span className="text-[13.5px] font-medium break-words">{o.customerName || "—"}</span>
                          <RowFlag row={o} />
                        </div>
                      </td>
                      <td className="text-muted-foreground overflow-hidden px-3.5 py-3 text-[13px] text-ellipsis whitespace-nowrap">
                        {o.itemsSummary}
                      </td>
                      <td className="text-muted-foreground px-3.5 py-3 font-mono text-[13px] whitespace-nowrap">
                        {formatPlacedShort(o.placedAt)}
                      </td>
                      <td className="px-3.5 py-3">
                        <OrderStatusPill status={o.status} />
                      </td>
                      <td className={cn("px-3.5 py-3 text-[12.5px] font-medium whitespace-nowrap", paymentTextClass(o.payment))}>
                        {PAYMENT_LABEL[o.payment]}
                      </td>
                      <td className="px-3.5 py-3 text-right text-[13.5px] font-medium whitespace-nowrap tabular-nums">
                        {formatMoney(o.total, o.currency)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

        </>
      )}

      {total > 0 ? (
        <div className="flex flex-wrap items-center justify-end gap-2.5">
          <div className="text-muted-foreground text-[12.5px] whitespace-nowrap tabular-nums">
            Page {page} of {pageCount}
          </div>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              className="h-[30px] px-3 text-[13px] disabled:opacity-45"
              disabled={page <= 1}
              onClick={() => update({ page: page - 1 }, true)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              className="h-[30px] px-3 text-[13px] disabled:opacity-45"
              disabled={page >= pageCount}
              onClick={() => update({ page: page + 1 }, true)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function downloadCsv(rows: readonly OrderRow[]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * The row's flag chip (`padding:1px 6px; border-radius:4px; 10.5px; coloured border and text`).
 * ⚠ Effy's "risk" is the promise: an open order near or past its ready-by. A shortfall is the other
 * thing a shop must see from the list, so it takes the same chip in the quiet tone.
 */
function RowFlag({ row }: { row: OrderRow }) {
  return (
    <>
      {row.atRisk ? (
        <span className="border-destructive text-destructive rounded-[4px] border px-1.5 py-px text-[10.5px] font-medium whitespace-nowrap">
          At risk
        </span>
      ) : null}
      {row.unavailableCount > 0 ? (
        <span className="border-muted-foreground text-muted-foreground rounded-[4px] border px-1.5 py-px text-[10.5px] font-medium whitespace-nowrap">
          {row.unavailableCount} short
        </span>
      ) : null}
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
  const dir = search.dir ?? "asc"
  return (
    <th
      className="p-0"
      style={width ? { width } : undefined}
      aria-sort={current ? (dir === "asc" ? "ascending" : "descending") : undefined}
    >
      <button
        type="button"
        disabled={!sortKey}
        // First click on a new column sorts descending; a second click flips it.
        onClick={() => sortKey && onSort({ sort: sortKey, dir: current ? (dir === "asc" ? "desc" : "asc") : "desc" })}
        className={cn(
          "text-muted-foreground flex w-full items-center gap-[5px] border-none bg-transparent px-3.5 py-[9px] text-[11.5px] font-medium tracking-[.04em] whitespace-nowrap uppercase",
          align === "right" ? "justify-end" : "justify-start",
          sortKey ? "hover:text-foreground cursor-pointer" : "cursor-default",
        )}
      >
        {label}
        <span className="text-[10px]" aria-hidden="true">
          {current ? (dir === "asc" ? "↑" : "↓") : ""}
        </span>
      </button>
    </th>
  )
}

/**
 * The search box — 250px, a ✕ inside it once there is text. ⚠ DEBOUNCED: every keystroke would
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
    <div className="relative flex max-w-[340px] flex-[1_1_260px] items-center">
      <input
        aria-label="Search"
        placeholder="Search order, customer, SKU…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="border-input bg-background focus:border-ring h-[34px] w-full rounded-md border pr-[30px] pl-[11px] text-[13px] outline-none"
      />
      {text ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setText("")
            onChange("")
          }}
          className="text-muted-foreground hover:bg-accent absolute right-[5px] grid size-[22px] cursor-pointer place-items-center rounded-[4px] border-none bg-transparent"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}

/** The design's dashed empty state — with distinct copy for "none yet" and "none match". */
function EmptyState({ filtered, onReset }: { filtered: boolean; onReset: () => void }) {
  return (
    <div className="border-border grid justify-items-center gap-2 rounded-[var(--radius)] border border-dashed px-6 py-11 text-center">
      <div className="text-sm font-semibold">{filtered ? "No orders match these filters" : "No orders yet"}</div>
      <div className="text-muted-foreground max-w-[340px] text-[13px] leading-[1.55]">
        {filtered
          ? "Widen the date range, clear the search, or reset everything and start again."
          : "Orders appear here the moment a customer pays for something your shop supplies. This list updates by itself."}
      </div>
      {filtered ? (
        <Button variant="outline" className="mt-1.5 h-8 px-3.5 text-[13px]" onClick={onReset}>
          Reset filters
        </Button>
      ) : null}
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="border-border space-y-2 rounded-[var(--radius)] border p-4">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  )
}
