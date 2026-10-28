import { Link } from "@tanstack/react-router"
import { ArrowDown, ArrowUp, BellRing, ChevronLeft, ChevronRight, CircleAlert } from "lucide-react"

import type { ShopOrderSort } from "@effy/shared-types"
import {
  Badge,
  Button,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@effy/design-system/ui"
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
    <div className={cn("overflow-hidden rounded-xl border bg-card transition-opacity", stale && "opacity-60")}>
      <Table className="ef-rtable min-w-225 max-md:min-w-0">
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 pr-0">
              <Checkbox
                aria-label="Select all on this page"
                checked={allOnPage ? true : someOnPage ? "indeterminate" : false}
                onCheckedChange={(v) => onSelect(v === true ? new Set(rows.map((r) => r.id)) : new Set())}
              />
            </TableHead>
            <SortTh label="Order" sortKey="number" search={search} onSort={update} />
            <SortTh label="Customer" sortKey="customer" search={search} onSort={update} />
            <SortTh label="Placed" sortKey="placed" search={search} onSort={update} />
            <SortTh label="Status" search={search} onSort={update} />
            <SortTh label="Goes with" search={search} onSort={update} />
            <SortTh label="Payment" search={search} onSort={update} />
            <SortTh label="Total" sortKey="total" align="right" search={search} onSort={update} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((o) => {
            const sel = selected.has(o.id)
            const tone = orderRowTone(o, now)
            return (
              <TableRow
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
                <TableCell className="w-12 pr-0" data-m="check" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    aria-label={`Select ${o.orderNumber}`}
                    checked={sel}
                    onCheckedChange={(v) => toggle(o.id, v === true)}
                  />
                </TableCell>
                <TableCell data-m="primary">
                  <Link
                    to="/orders/$fulfillmentId"
                    params={{ fulfillmentId: o.id }}
                    search={search}
                    onClick={(e) => e.stopPropagation()}
                    className="font-mono font-medium text-foreground no-underline hover:underline"
                  >
                    {o.orderNumber}
                  </Link>
                  <span className="mt-0.5 block max-w-[22ch] truncate text-muted-foreground">{o.itemsSummary}</span>
                </TableCell>
                <TableCell data-m="meta">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium break-words">{o.customerName || "—"}</span>
                    <RowFlag row={o} tone={tone} />
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground" data-m="meta">
                  <OrderWait row={o} now={now} />
                </TableCell>
                <TableCell data-m="badge">
                  <PackageStatusPill view={o.statusView} showDetail={false} />
                </TableCell>
                <TableCell data-m="meta">
                  {deliveredByText(o.deliveredBy)}
                  {o.courierPickup ? (
                    <span className="mt-0.5 block text-muted-foreground" data-testid="row-courier-pickup">
                      {courierPickupLine(o.courierPickup)}
                    </span>
                  ) : o.collection ? (
                    <span className="mt-0.5 block text-muted-foreground">{runTime(o.collection)} run</span>
                  ) : null}
                </TableCell>
                <TableCell data-m="hide" className={cn("whitespace-nowrap", paymentTextClass(o.payment))}>
                  {PAYMENT_LABEL[o.payment]}
                </TableCell>
                <TableCell numeric className="font-semibold whitespace-nowrap" data-m="trail">
                  {formatMoney(o.total, o.currency)}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t px-4 py-3 text-sm text-muted-foreground">
        <span className="tabular-nums" aria-live="polite">
          {countLabel}
        </span>
        <div className="flex items-center gap-4">
          <span className="tabular-nums whitespace-nowrap">
            Page {page} of {pageCount}
          </span>
          <div className="flex gap-2">
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
        <Badge variant="info">
          <BellRing aria-hidden="true" />
          New
        </Badge>
      ) : null}
      {tone === "unopened" ? <Badge variant="outline">Not opened</Badge> : null}
      {row.atRisk ? (
        <Badge variant="destructive">
          <CircleAlert aria-hidden="true" />
          At risk
        </Badge>
      ) : null}
      {row.unavailableCount > 0 ? <Badge variant="outline">{row.unavailableCount} short</Badge> : null}
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
    <TableHead
      numeric={align === "right"}
      aria-sort={current ? (dir === "asc" ? "ascending" : "descending") : undefined}
    >
      <button
        type="button"
        disabled={!sortKey}
        onClick={() => sortKey && onSort({ sort: sortKey, dir: current ? (dir === "asc" ? "desc" : "asc") : "desc" })}
        className={cn(
          "flex h-10 w-full items-center gap-1 font-medium whitespace-nowrap outline-none disabled:cursor-default",
          align === "right" ? "justify-end" : "justify-start",
          sortKey && "hover:text-foreground",
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
    </TableHead>
  )
}
