import { useEffect, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Columns3, Download, Inbox, Loader2, SearchX, SlidersHorizontal, Table2, X } from "lucide-react"

import {
  SHOP_ORDER_DELIVERED_BY,
  SHOP_ORDER_PAYMENT_STATES,
  SHOP_ORDER_RANGES,
  SHOP_ORDER_TABS,
} from "@effy/shared-types"
import { Button, Skeleton, Tabs, TabsCount, TabsList, TabsTrigger, toast } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"
import { Facet, PageHeader } from "@effy/web-kit/patterns"

import { track } from "@/lib/telemetry"

import { Segmented } from "@/components/console/primitives"

import { useNow } from "@/features/today/useNow"

import { BulkActions } from "./components/BulkActions"
import { OrderFiltersSheet } from "./components/OrderFiltersSheet"
import { OrderQueue } from "./components/OrderQueue"
import { OrderSearchBox } from "./components/OrderSearchBox"
import { OrderTable } from "./components/OrderTable"
import {
  activeFilterCount,
  DELIVERED_BY_FILTER_LABEL,
  RANGE_LABEL,
  isFiltered,
  PAYMENT_LABEL,
  TAB_LABEL,
  toListQuery,
  validateOrdersSearch,
  type OrdersSearch,
} from "./orderConsole"
import { downloadOrdersCsv, exportOrdersCsv } from "./exportOrders"
import { orderListQuery } from "./queries"

const NONE: ReadonlySet<string> = new Set()

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
  const searchKey = JSON.stringify(toListQuery(search))
  const [selection, setSelection] = useState<{ key: string; ids: ReadonlySet<string> }>({
    key: searchKey,
    ids: new Set(),
  })
  const selected = selection.key === searchKey ? selection.ids : NONE
  const setSelected = (ids: ReadonlySet<string>) => setSelection({ key: searchKey, ids })
  const [exporting, setExporting] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const now = useNow(15_000)

  const tab = search.tab ?? "all"
  useEffect(() => {
    track({
      name: "shop_order_queue_viewed",
      state: tab === "all" || tab === "new" || tab === "picking" ? "active" : "completed",
    })
  }, [tab])

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
  const dirty = filtered || tab !== "all"
  const filterCount = activeFilterCount(search)
  const countLabel = !data
    ? ""
    : total === 0
      ? "No matches"
      : `Showing ${(page - 1) * pageSize + 1}–${(page - 1) * pageSize + rows.length} of ${total}`

  function clearAll() {
    onSearchChange(validateOrdersSearch({ sort: search.sort, dir: search.dir }))
  }

  async function exportCsv() {
    setExporting(true)
    try {
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
              onChange={(v) =>
                onSearchChange(
                  validateOrdersSearch({ ...search, view: v === "queue" ? "queue" : undefined } as Record<
                    string,
                    unknown
                  >),
                )
              }
              options={[
                {
                  value: "table",
                  label: (
                    <>
                      <Table2 aria-hidden="true" />
                      Table
                    </>
                  ),
                },
                {
                  value: "queue",
                  label: (
                    <>
                      <Columns3 aria-hidden="true" />
                      Queue
                    </>
                  ),
                },
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
          <Tabs value={tab} onValueChange={(v) => update({ tab: v as typeof tab })}>
            <TabsList aria-label="Order status">
              {SHOP_ORDER_TABS.map((t) => (
                <TabsTrigger key={t} value={t}>
                  {TAB_LABEL[t]}
                  {data ? (
                    <TabsCount tone={t === "new" && data.counts[t] > 0 ? "primary" : undefined}>
                      {data.counts[t]}
                    </TabsCount>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="ef-toolbar">
            <OrderSearchBox value={search.q ?? ""} onChange={(q) => update({ q })} />
            <Facet
              label="Placed"
              className="max-lg:hidden"
              anyLabel={RANGE_LABEL.any}
              value={search.range ?? null}
              options={SHOP_ORDER_RANGES.filter((r) => r !== "any").map((r) => ({ value: r, label: RANGE_LABEL[r] }))}
              onChange={(range) => update({ range: range ?? undefined })}
            />
            <Facet
              label="Goes with"
              className="max-lg:hidden"
              anyLabel={DELIVERED_BY_FILTER_LABEL.any}
              value={search.deliveredBy ?? null}
              options={SHOP_ORDER_DELIVERED_BY.filter((d) => d !== "any").map((d) => ({
                value: d,
                label: DELIVERED_BY_FILTER_LABEL[d],
              }))}
              onChange={(deliveredBy) => update({ deliveredBy: deliveredBy ?? undefined })}
            />
            <Facet
              label="Payment"
              className="max-lg:hidden"
              value={search.payment ?? null}
              options={SHOP_ORDER_PAYMENT_STATES.map((p) => ({ value: p, label: PAYMENT_LABEL[p] }))}
              onChange={(payment) => update({ payment: payment ?? undefined })}
            />
            <Button variant="outline" className="lg:hidden" onClick={() => setFiltersOpen(true)}>
              <SlidersHorizontal aria-hidden="true" />
              Filters
              {filterCount > 0 ? <TabsCount tone="primary">{filterCount}</TabsCount> : null}
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
            onClearAll={() =>
              update({ range: undefined, payment: undefined, deliveredBy: undefined, attention: undefined })
            }
          />

          {selected.size > 0 ? (
            <BulkActions
              rows={rows}
              selected={selected}
              onClear={() => setSelected(new Set())}
              onExport={downloadOrdersCsv}
            />
          ) : null}

          {isError ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : isPending ? (
            <ListLoading />
          ) : total === 0 ? (
            <EmptyState filtered={dirty} onReset={clearAll} />
          ) : (
            <OrderTable
              rows={rows}
              search={search}
              now={now}
              selected={selected}
              onSelect={setSelected}
              stale={isPlaceholderData}
              countLabel={countLabel}
              page={page}
              pageCount={pageCount}
              update={update}
              onOpenOrder={onOpenOrder}
            />
          )}
        </>
      )}
    </div>
  )
}

function EmptyState({ filtered, onReset }: { filtered: boolean; onReset: () => void }) {
  return (
    <div className="ef-empty">
      <span className="ef-empty__icon" aria-hidden="true">
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

function ListLoading() {
  return (
    <div className="ef-table-wrap" aria-busy="true" aria-label="Loading orders">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-border px-4 py-4 last:border-b-0">
          <Skeleton className="size-5 rounded" />
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-6 w-24 rounded-md" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}
