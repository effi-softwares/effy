import { useEffect, useMemo, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowDown, ArrowUp, Download, Loader2, Search, X } from "lucide-react"

import {
  SHOP_ORDER_ATTENTION,
  SHOP_ORDER_METHODS,
  SHOP_ORDER_PAYMENT_STATES,
  SHOP_ORDER_RANGES,
  SHOP_ORDER_TABS,
  type ShopOrderSort,
} from "@effy/shared-types"
import {
  Button,
  Checkbox,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  toast,
} from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"

import { MicroLabel, Page, Pill } from "@/components/console/primitives"
import { track } from "@/lib/telemetry"
import { cn } from "@/lib/utils"

import { BulkActions } from "./components/BulkActions"
import { FulfillmentStatusBadge } from "./components/FulfillmentStatusBadge"
import {
  activeViewId,
  applyView,
  ATTENTION_LABEL,
  clearedFilters,
  formatMoney,
  formatWhen,
  isFiltered,
  METHOD_LABEL,
  PAYMENT_LABEL,
  RANGE_LABEL,
  SAVED_VIEWS,
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
 * The shop's Orders list, rebuilt to the imported design (057 Amendment A3).
 *
 * ⚠ EVERYTHING THAT NARROWS THE LIST IS SERVER-SIDE NOW. The queue this replaced filtered the page the
 * server sent, which was right for tens of active rows and wrong for a list that includes every order
 * the shop has ever handled: the tab counts must cover EVERY state, not the visible page, and a search
 * must find an order from last month. So the tabs, search, four filters, sort and page all go to the
 * server, and the counts come back computed under the same filters (minus the tab itself).
 *
 * ⚠ THE DEFAULT IS STILL OLDEST FIRST (020 FR-001b): the order that has waited longest is the one to
 * pick next. Clicking a column header re-sorts on purpose; nothing re-sorts on its own.
 *
 * ⚠ THE STATE IS THE URL (`search` / `onSearchChange`), so back from an order lands on the same page
 * and the order's previous/next knows which list it came from. The screen stays router-agnostic so it
 * can be tested without one.
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

  const tab = search.tab ?? "all"
  const searchKey = JSON.stringify(toListQuery(search))

  useEffect(() => {
    track({ name: "shop_order_queue_viewed", state: tab === "all" || tab === "new" || tab === "picking" ? "active" : "completed" })
  }, [tab])

  // ⚠ Selection is cleared whenever the list changes under it (page, tab, filter, sort). Carrying it
  // across would let an operator act on rows they can no longer see — the definition of an unreviewed
  // bulk action.
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
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const someOnPage = rows.some((r) => selected.has(r.id))
  const viewId = activeViewId(search)

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
      // ⚠ Every matching row, not just this page — "Export" of a filtered list means the filtered list.
      // Capped, because a CSV of the shop's entire history is a report, not an export button.
      const all: OrderRow[] = []
      for (let p = 1; p <= 40; p++) {
        const res = await listOrders({ ...toListQuery(search), page: p })
        all.push(...res.items)
        if (all.length >= res.total || res.items.length === 0) break
      }
      const blob = new Blob([toCsv(all)], { type: "text/csv;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Exported ${all.length} order${all.length === 1 ? "" : "s"}`)
    } catch {
      toast.error("The export couldn't be built. Try again in a moment.")
    } finally {
      setExporting(false)
    }
  }

  return (
    <Page className="gap-4">
      {/* ── Title area + the primary action (the breadcrumb itself is in the app header) ───────── */}
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-muted-foreground min-w-0 flex-1 text-[13px]">
          Every order your shop is supplying — oldest first, updated automatically.
        </p>
        <Button size="sm" disabled={exporting || total === 0} onClick={() => void exportCsv()}>
          {exporting ? <Loader2 className="animate-spin" /> : <Download />}
          Export CSV
        </Button>
      </div>

      {/* ── Status tabs (counts over every state) + saved views ──────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Tabs value={tab} onValueChange={(v) => update({ tab: v as OrdersSearch["tab"] })}>
          <TabsList className="h-auto max-w-full flex-wrap">
            {SHOP_ORDER_TABS.map((t) => (
              <TabsTrigger
                key={t}
                value={t}
                className="text-muted-foreground hover:text-foreground data-[state=active]:text-foreground h-7 flex-none gap-1.5 px-[11px] text-[13px] font-normal data-[state=active]:font-medium"
              >
                {TAB_LABEL[t]}
                <span className="font-mono text-[11.5px] opacity-65 tabular-nums">
                  {data ? data.counts[t] : "·"}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2.5">
          <MicroLabel>Views</MicroLabel>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Saved views">
            {SAVED_VIEWS.map((v) => {
              const active = viewId === v.id
              return (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => update(applyView(search, v.search))}
                  className={cn(
                    "border-border hover:bg-accent focus-visible:ring-ring h-[26px] cursor-pointer rounded-full border px-2.5 text-[12.5px] whitespace-nowrap focus-visible:ring-2 focus-visible:outline-none",
                    active ? "bg-foreground text-background hover:bg-foreground font-medium" : "bg-background text-muted-foreground",
                  )}
                >
                  {v.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Toolbar: search + the four filters, composed ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-2.5">
        <SearchBox value={search.q ?? ""} onChange={(q) => update({ q })} />
        <FilterSelect
          label="Status"
          value={search.attention ?? "any"}
          options={SHOP_ORDER_ATTENTION.map((a) => ({ value: a, label: ATTENTION_LABEL[a] }))}
          onChange={(v) => update({ attention: v as OrdersSearch["attention"] })}
        />
        <FilterSelect
          label="Payment"
          value={search.payment ?? "any"}
          options={[
            { value: "any", label: "Any payment" },
            ...SHOP_ORDER_PAYMENT_STATES.map((p) => ({ value: p, label: PAYMENT_LABEL[p] })),
          ]}
          onChange={(v) => update({ payment: v === "any" ? undefined : (v as OrdersSearch["payment"]) })}
        />
        <FilterSelect
          label="Fulfilment"
          value={search.method ?? "any"}
          options={SHOP_ORDER_METHODS.map((m) => ({ value: m, label: METHOD_LABEL[m] }))}
          onChange={(v) => update({ method: v as OrdersSearch["method"] })}
        />
        <FilterSelect
          label="Date"
          value={search.range ?? "any"}
          options={SHOP_ORDER_RANGES.map((r) => ({ value: r, label: RANGE_LABEL[r] }))}
          onChange={(v) => update({ range: v as OrdersSearch["range"] })}
        />
        {filtered ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-8"
            onClick={() => onSearchChange(clearedFilters(search))}
          >
            Reset filters
          </Button>
        ) : null}
        <div className="flex-1" />
        <p className="text-muted-foreground pb-1.5 text-[13px] whitespace-nowrap tabular-nums" aria-live="polite">
          {!data ? "" : total === 0 ? "No matches" : `Showing ${(page - 1) * pageSize + 1}–${(page - 1) * pageSize + rows.length} of ${total}`}
        </p>
      </div>

      {selected.size > 0 ? (
        <BulkActions rows={rows} selected={selected} onClear={() => setSelected(new Set())} />
      ) : null}

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <ListSkeleton />
      ) : total === 0 ? (
        <EmptyState
          filtered={filtered}
          tab={tab}
          onClear={() => onSearchChange(clearedFilters(search))}
          onAll={() => update({ tab: undefined })}
        />
      ) : (
        <div
          className={cn(
            "border-border overflow-x-auto rounded-[var(--radius)] border transition-opacity",
            isPlaceholderData && "opacity-60",
          )}
        >
          <table className="w-full min-w-[860px] table-fixed border-collapse">
            <colgroup>
              <col className="w-11" />
              <col className="w-[132px]" />
              <col />
              <col className="w-[132px]" />
              {/* ⚠ Wide enough for "Partially refunded", its longest label, on one line. */}
              <col className="w-[158px]" />
              <col className="w-[150px]" />
              <col className="w-[76px]" />
              <col className="w-[116px]" />
            </colgroup>
            <thead>
              <tr className="bg-muted">
                <th className="py-2.5 pl-3.5">
                  <Checkbox
                    aria-label="Select all orders on this page"
                    checked={allOnPage ? true : someOnPage ? "indeterminate" : false}
                    onCheckedChange={(v) =>
                      setSelected(v === true ? new Set(rows.map((r) => r.id)) : new Set())
                    }
                  />
                </th>
                <SortTh label="Order" sortKey="number" search={search} onSort={update} />
                <SortTh label="Customer" sortKey="customer" search={search} onSort={update} />
                <SortTh label="Date" sortKey="placed" search={search} onSort={update} />
                <PlainTh>Payment</PlainTh>
                <PlainTh>Fulfilment</PlainTh>
                <SortTh label="Items" sortKey="items" search={search} onSort={update} align="right" />
                <SortTh label="Total" sortKey="total" search={search} onSort={update} align="right" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <OrderTableRow
                  key={row.id}
                  row={row}
                  search={search}
                  selected={selected.has(row.id)}
                  onSelect={(on) => toggle(row.id, on)}
                  onOpen={() => onOpenOrder(row.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 ? (
        <div className="flex flex-wrap items-center justify-end gap-2.5">
          <span className="text-muted-foreground text-[12.5px] whitespace-nowrap tabular-nums">
            Page {page} of {pageCount}
          </span>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => update({ page: page - 1 }, true)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount}
              onClick={() => update({ page: page + 1 }, true)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </Page>
  )
}

function OrderTableRow({
  row,
  search,
  selected,
  onSelect,
  onOpen,
}: {
  row: OrderRow
  search: OrdersSearch
  selected: boolean
  onSelect: (on: boolean) => void
  onOpen: () => void
}) {
  return (
    <tr
      onClick={onOpen}
      data-state={selected ? "selected" : undefined}
      className={cn(
        "border-border hover:bg-accent cursor-pointer border-t transition-colors",
        selected && "bg-accent",
      )}
    >
      {/* ⚠ The checkbox cell swallows the click, or ticking a row would also open it. */}
      <td className="py-3 pl-3.5" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          aria-label={`Select ${row.orderNumber}`}
          checked={selected}
          onCheckedChange={(v) => onSelect(v === true)}
        />
      </td>
      <td className="px-3.5 py-3">
        <Link
          to="/orders/$fulfillmentId"
          params={{ fulfillmentId: row.id }}
          search={search}
          onClick={(e) => e.stopPropagation()}
          className="text-muted-foreground hover:text-foreground font-mono text-[12.5px] whitespace-nowrap hover:underline"
        >
          {row.orderNumber}
        </Link>
      </td>
      <td className="px-3.5 py-3">
        {/* ⚠ Wraps rather than overflowing: a name with three badges still fits its column. */}
        <div className="flex flex-wrap items-center gap-x-[7px] gap-y-[3px]">
          <span className="text-[13.5px] font-medium break-words">{row.customerName || "—"}</span>
          {/* ⚠ The risk marker. In the mockup this is fraud risk; Effy has no fraud score, and the
              risk a shop can act on is its promise — so it marks an open order near or past its
              ready-by (020 FR-001a). Monochrome: weight and fill, never a hue. */}
          {row.atRisk ? <Pill variant="strong">At risk</Pill> : null}
          {row.unavailableCount > 0 ? <Pill variant="outline">{row.unavailableCount} short</Pill> : null}
          {row.tags.map((t) => (
            <Pill key={t} variant="quiet">
              {t}
            </Pill>
          ))}
        </div>
      </td>
      <td className="text-muted-foreground px-3.5 py-3 font-mono text-[12.5px] whitespace-nowrap">
        {formatWhen(row.placedAt)}
      </td>
      <td
        className={cn(
          "px-3.5 py-3 text-[12.5px] font-medium whitespace-nowrap",
          row.payment === "paid" ? "text-muted-foreground" : "text-foreground font-semibold",
        )}
      >
        {PAYMENT_LABEL[row.payment]}
      </td>
      <td className="px-3.5 py-3">
        <FulfillmentStatusBadge status={row.status} />
      </td>
      <td className="px-3.5 py-3 text-right text-[13px] tabular-nums">{row.itemCount}</td>
      <td className="px-3.5 py-3 text-right text-[13.5px] font-medium whitespace-nowrap tabular-nums">
        {formatMoney(row.total, row.currency)}
      </td>
    </tr>
  )
}

function SortTh({
  label,
  sortKey,
  search,
  onSort,
  align = "left",
}: {
  label: string
  sortKey: ShopOrderSort
  search: OrdersSearch
  onSort: (patch: Partial<OrdersSearch>) => void
  align?: "left" | "right"
}) {
  const current = (search.sort ?? "placed") === sortKey
  const dir = search.dir ?? "asc"
  return (
    <th
      className="p-0"
      aria-sort={current ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        // First click on a new column sorts descending (biggest / newest / Z first — what a header
        // click usually wants); a second click flips it.
        onClick={() => onSort({ sort: sortKey, dir: current ? (dir === "asc" ? "desc" : "asc") : "desc" })}
        className={cn(
          "text-muted-foreground hover:text-foreground flex w-full cursor-pointer items-center gap-[5px] px-3.5 py-2.5 text-[11.5px] font-medium tracking-[.04em] whitespace-nowrap uppercase",
          align === "right" && "justify-end",
          current && "text-foreground",
        )}
      >
        {label}
        {current ? (
          dir === "asc" ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />
        ) : null}
      </button>
    </th>
  )
}

function PlainTh({ children }: { children: string }) {
  return (
    <th className="text-muted-foreground px-3.5 py-2.5 text-left text-[11.5px] font-medium tracking-[.04em] whitespace-nowrap uppercase">
      {children}
    </th>
  )
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  const id = `filter-${label.toLowerCase()}`
  return (
    <div className="grid min-w-[140px] gap-[5px]">
      <label htmlFor={id}>
        <MicroLabel>{label}</MicroLabel>
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} size="sm" className="h-8 w-full text-[13px]" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/**
 * The search box. ⚠ DEBOUNCED: every keystroke would otherwise be a server round trip and a URL
 * write. The box keeps its own text while typing and adopts the URL's when it changes from elsewhere
 * (a saved view, "Reset filters").
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
    <div className="grid gap-[5px]">
      <label htmlFor="orders-search">
        <MicroLabel>Search</MicroLabel>
      </label>
      <div className="relative flex items-center">
        <Search
          className="text-muted-foreground pointer-events-none absolute left-2.5 size-3.5"
          aria-hidden="true"
        />
        <Input
          id="orders-search"
          placeholder="Order number or customer…"
          className="h-8 w-[250px] max-w-full pr-8 pl-8 text-[13px]"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {text ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setText("")
              onChange("")
            }}
            className="text-muted-foreground hover:bg-accent absolute right-1 grid size-6 cursor-pointer place-items-center rounded-sm"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  )
}

function EmptyState({
  filtered,
  tab,
  onClear,
  onAll,
}: {
  filtered: boolean
  tab: string
  onClear: () => void
  onAll: () => void
}) {
  const [title, body, action] = useMemo((): [string, string, React.ReactNode] => {
    if (filtered) {
      return [
        "No orders match these filters",
        "Widen the date range, clear the search, or reset the filters and start again.",
        <Button key="c" variant="outline" size="sm" onClick={onClear}>
          Clear filters
        </Button>,
      ]
    }
    if (tab !== "all") {
      return [
        `No ${TAB_LABEL[tab as keyof typeof TAB_LABEL].toLowerCase()} orders`,
        "Nothing is in this state right now.",
        <Button key="a" variant="outline" size="sm" onClick={onAll}>
          Show all orders
        </Button>,
      ]
    }
    return [
      "No orders yet",
      "Orders appear here the moment a customer pays for something your shop supplies. This list updates by itself.",
      null,
    ]
  }, [filtered, tab, onClear, onAll])

  return (
    <div className="border-border grid justify-items-center gap-2 rounded-[var(--radius)] border border-dashed px-6 py-11 text-center">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-muted-foreground max-w-[340px] text-[13px] leading-[1.55]">{body}</p>
      {action ? <div className="mt-1.5">{action}</div> : null}
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
