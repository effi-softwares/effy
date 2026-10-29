import type { UseQueryResult } from "@tanstack/react-query"
import { BellRing, CircleAlert, Inbox } from "lucide-react"
import type { ReactNode } from "react"

import { Badge } from "@effy/design-system/ui"
import { PackageStatusPill } from "@effy/web-kit/console"
import { DataTable, type EffyColumnDef } from "@effy/web-kit/data-table"

import { cn } from "@/lib/utils"

import { runTime } from "../collection"
import { courierPickupLine } from "../courierPickup"
import {
  deliveredByText,
  formatMoney,
  orderRowTone,
  PAYMENT_LABEL,
  shopOrdersList,
  type OrderList,
  type OrderRow,
  type OrderRowTone,
  type OrdersSearch,
  type ShopOrdersListState,
} from "../orderConsole"
import { paymentTextClass } from "./OrderPill"
import { OrderWait } from "./OrderWait"

function columnsFor(now: number): EffyColumnDef<OrderRow>[] {
  return [
    {
      id: "order",
      header: "Order",
      cell: ({ row }) => (
        <>
          <span className="font-mono">{row.original.orderNumber}</span>
          <span className="mt-0.5 block max-w-[22ch] truncate font-normal text-muted-foreground">{row.original.itemsSummary}</span>
        </>
      ),
      meta: { label: "Order", identifying: true, phone: "primary", sortKey: "number" },
    },
    {
      id: "customer",
      header: "Customer",
      cell: ({ row }) => (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium break-words">{row.original.customerName || "—"}</span>
          <RowFlag row={row.original} tone={orderRowTone(row.original, now)} />
        </span>
      ),
      meta: { label: "Customer", sortKey: "customer" },
    },
    {
      id: "placed",
      header: "Placed",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          <OrderWait row={row.original} now={now} />
        </span>
      ),
      meta: { label: "Placed", sortKey: "placed" },
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => <PackageStatusPill view={row.original.statusView} showDetail={false} />,
      meta: { label: "Status", phone: "badge" },
    },
    {
      id: "goesWith",
      header: "Goes with",
      cell: ({ row }) => {
        const o = row.original
        return (
          <>
            {deliveredByText(o.deliveredBy)}
            {o.courierPickup ? (
              <span className="mt-0.5 block text-muted-foreground" data-testid="row-courier-pickup">
                {courierPickupLine(o.courierPickup)}
              </span>
            ) : o.collection ? (
              <span className="mt-0.5 block text-muted-foreground">{runTime(o.collection)} run</span>
            ) : null}
          </>
        )
      },
      meta: { label: "Goes with", priority: 2 },
    },
    {
      id: "payment",
      header: "Payment",
      cell: ({ row }) => <span className={cn("whitespace-nowrap", paymentTextClass(row.original.payment))}>{PAYMENT_LABEL[row.original.payment]}</span>,
      meta: { label: "Payment", priority: 2, phone: "hide" },
    },
    {
      id: "total",
      header: "Total",
      cell: ({ row }) => <span className="font-semibold">{formatMoney(row.original.total, row.original.currency)}</span>,
      meta: { label: "Total", align: "numeric", sortKey: "total", phone: "trail" },
    },
  ]
}

/**
 * The shop's orders on the console table (103): the whole list is searched, filtered, sorted and paged by the
 * server; a selection is by order and survives paging. Rows keep their tones (new, not opened).
 */
export function OrderTable({
  state,
  query,
  search,
  now,
  selected,
  onSelect,
  toolbar,
  actions,
}: {
  state: ShopOrdersListState
  query: UseQueryResult<OrderList>
  search: OrdersSearch
  now: number
  selected: ReadonlySet<string>
  onSelect: (ids: ReadonlySet<string>) => void
  toolbar: ReactNode
  /** The selection bar's buttons. */
  actions: ReactNode
}) {
  return (
    <DataTable
      app="shop-web"
      label="Orders"
      list={shopOrdersList}
      state={state}
      columns={columnsFor(now)}
      query={query}
      viewFilters={["tab"]}
      rowHref={(o) => ({ to: "/orders/$fulfillmentId", params: { fulfillmentId: o.id }, search: search as Record<string, unknown> })}
      rowClassName={(o) => {
        const tone = orderRowTone(o, now)
        return cn(!selected.has(o.id) && tone === "recent" && "is-recent", !selected.has(o.id) && tone === "unopened" && "is-unopened")
      }}
      selection={{ selected, onChange: onSelect, label: (o) => o.orderNumber, actions, barLabel: "Selected orders" }}
      empty={{
        icon: Inbox,
        title: "No orders yet",
        description: "Orders appear here the moment a customer pays for something your shop supplies. This list updates by itself.",
      }}
      toolbar={toolbar}
    />
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
