import { Link } from "@tanstack/react-router"
import { ArrowDown, ArrowUp, BellRing, ChevronLeft, ChevronRight, CircleAlert } from "lucide-react"

import type { ShopOrderSort } from "@effy/shared-types"
import { Button, Checkbox } from "@effy/design-system/ui"
import { PackageStatusPill } from "@effy/web-kit/console"

import { cn } from "@/lib/utils"

import { runTime } from "../collection"
import { courierPickupLine } from "../courierPickup"
import {
  deliveredByText,
  formatMoney,
  orderRowTone,
  PAYMENT_LABEL,
  type OrderRow,
  type OrderRowTone,
  type OrdersSearch,
} from "../orderConsole"
import { paymentTextClass } from "./OrderPill"
import { OrderWait } from "./OrderWait"

interface Props {
  rows: OrderRow[]
  search: OrdersSearch
  now: number
  selected: ReadonlySet<string>
  onSelect: (ids: ReadonlySet<string>) => void
  stale: boolean
  countLabel: string
  page: number
  pageCount: number
  update: (patch: Partial<OrdersSearch>, keepPage?: boolean) => void
  onOpenOrder: (id: string) => void
}

export function OrderTable({
  rows,
  search,
  now,
  selected,
  onSelect,
  stale,
  countLabel,
  page,
  pageCount,
  update,
  onOpenOrder,
}: Props) {
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const someOnPage = rows.some((r) => selected.has(r.id))

  function toggle(id: string, on: boolean) {
    const next = new Set(selected)
    if (on) next.add(id)
    else next.delete(id)
    onSelect(next)
  }

  return (
    <div className={cn("ef-table-wrap transition-opacity", stale && "opacity-60")}>
      <div className="ef-table-scroll">
        <table className="ef-table ef-rtable min-w-225 max-md:min-w-0">
          <thead>
            <tr>
              <th className="is-check">
                <Checkbox
                  aria-label="Select all on this page"
                  checked={allOnPage ? true : someOnPage ? "indeterminate" : false}
                  onCheckedChange={(v) => onSelect(v === true ? new Set(rows.map((r) => r.id)) : new Set())}
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
                    !sel && tone === "recent" && "is-recent",
                    !sel && tone === "unopened" && "is-unopened",
                    sel && "is-selected",
                  )}
                >
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
                      className="ef-code font-mono font-medium text-foreground no-underline hover:underline"
                    >
                      {o.orderNumber}
                    </Link>
                    <span className="ef-sub max-w-[22ch] truncate">{o.itemsSummary}</span>
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
                    <PackageStatusPill view={o.statusView} showDetail={false} />
                  </td>
                  <td data-m="meta">
                    {deliveredByText(o.deliveredBy)}
                    {o.courierPickup ? (
                      <span className="ef-sub" data-testid="row-courier-pickup">
                        {courierPickupLine(o.courierPickup)}
                      </span>
                    ) : o.collection ? (
                      <span className="ef-sub">{runTime(o.collection)} run</span>
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
      <div className="ef-pager">
        <span className="tabular-nums" aria-live="polite">
          {countLabel}
        </span>
        <div className="ef-pager__right">
          <span className="tabular-nums whitespace-nowrap">
            Page {page} of {pageCount}
          </span>
          <div className="ef-pager__btns">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => update({ page: page - 1 }, true)}>
              <ChevronLeft aria-hidden="true" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount}
              onClick={() => update({ page: page + 1 }, true)}
            >
              Next
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function RowFlag({ row, tone }: { row: OrderRow; tone: OrderRowTone | null }) {
  return (
    <>
      {tone === "recent" ? (
        <span className="ef-st ef-st--info">
          <BellRing aria-hidden="true" />
          New
        </span>
      ) : null}
      {tone === "unopened" ? <span className="ef-tag">Not opened</span> : null}
      {row.atRisk ? (
        <span className="ef-st ef-st--problem">
          <CircleAlert aria-hidden="true" />
          At risk
        </span>
      ) : null}
      {row.unavailableCount > 0 ? <span className="ef-tag">{row.unavailableCount} short</span> : null}
    </>
  )
}

function SortTh({
  label,
  sortKey,
  align = "left",
  search,
  onSort,
}: {
  label: string
  sortKey?: ShopOrderSort
  align?: "left" | "right"
  search: OrdersSearch
  onSort: (patch: Partial<OrdersSearch>) => void
}) {
  const current = !!sortKey && (search.sort ?? "placed") === sortKey
  const dir = search.dir ?? "desc"
  return (
    <th
      className={cn(align === "right" && "is-num")}
      aria-sort={current ? (dir === "asc" ? "ascending" : "descending") : undefined}
    >
      <button
        type="button"
        disabled={!sortKey}
        onClick={() => sortKey && onSort({ sort: sortKey, dir: current ? (dir === "asc" ? "desc" : "asc") : "desc" })}
        className={cn(
          "flex min-h-11 w-full items-center gap-1 border-none bg-transparent p-0 font-[inherit] text-[inherit] whitespace-nowrap text-muted-foreground",
          align === "right" ? "justify-end" : "justify-start",
          sortKey ? "cursor-pointer hover:text-foreground" : "cursor-default",
        )}
      >
        {label}
        {current ? (
          dir === "asc" ? (
            <ArrowUp aria-hidden="true" className="size-4 text-foreground" />
          ) : (
            <ArrowDown aria-hidden="true" className="size-4 text-foreground" />
          )
        ) : null}
      </button>
    </th>
  )
}
