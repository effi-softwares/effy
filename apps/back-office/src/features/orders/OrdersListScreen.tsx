import { useQuery } from "@tanstack/react-query"
import { Link, useSearch } from "@tanstack/react-router"
import { Package, Route, Truck, UserX } from "lucide-react"

import { Badge, Button } from "@effy/design-system/ui"
import {
  ADMIN_ORDER_DELIVERY_FILTERS,
  ADMIN_ORDER_PROMISE_FILTERS,
  type AdminOrderViewCountsDTO,
} from "@effy/shared-types"
import { PackageStatusPill } from "@effy/web-kit/console"
import {
  DataTable,
  DateRangeFacet,
  Facet,
  ListPage,
  listQueryOptions,
  ResetFilters,
  SearchBox,
  useListState,
  viewsQueryOptions,
  ViewSelect,
  isFiltered,
  type EffyColumnDef,
} from "@effy/web-kit/data-table"
import { Kbd, PageHeader } from "@effy/web-kit/patterns"
import { moment, money } from "@/lib/format"
import { shopListQuery } from "@/features/shops/queries"

import {
  ORDER_LIST_STATUSES,
  ORDER_LIST_VIEWS,
  ORDER_STATUS_LABEL,
  ORDERS_LIST_KEY,
  ordersList,
  type OrderListView,
} from "./list"
import { AWAITING_LABEL, DELIVERY_FILTER_LABEL, deliveryTypeText, PROMISE_LABEL, STAGE_LABEL, type OrderSummary } from "./model"
import { fetchOrderPage, fetchOrderViews } from "./repo"

const VIEW_LABEL: Record<OrderListView, string> = {
  all: "All orders",
  driver: "Needs a driver",
  handover: AWAITING_LABEL.handover,
  arrival: AWAITING_LABEL.arrival,
  refund: AWAITING_LABEL.refund_decision,
  courier: AWAITING_LABEL.courier_problem,
}

/** Which count answers which view. */
const VIEW_COUNT: Record<OrderListView, keyof AdminOrderViewCountsDTO> = {
  all: "all",
  driver: "needsDriver",
  handover: "handover",
  arrival: "arrival",
  refund: "refundDecision",
  courier: "courierProblem",
}

const columns: EffyColumnDef<OrderSummary>[] = [
  {
    id: "order",
    header: "Order",
    cell: ({ row }) => (
      <>
        {row.original.orderNumber}
        <span className="mt-0.5 block font-sans text-sm font-normal text-muted-foreground">
          {row.original.itemCount} {row.original.itemCount === 1 ? "item" : "items"}
        </span>
      </>
    ),
    meta: { label: "Order", identifying: true, phone: "primary", align: "mono" },
  },
  {
    id: "placed",
    header: "Placed",
    cell: ({ row }) => <span className="text-muted-foreground">{moment(row.original.placedAt)}</span>,
    meta: { label: "Placed", sortKey: "placed", phone: "meta" },
  },
  {
    id: "customer",
    header: "Customer",
    cell: ({ row }) => <span className="block max-w-[28ch] truncate" title={row.original.customerEmail}>{row.original.customerEmail}</span>,
    meta: { label: "Customer", priority: 2, phone: "meta" },
  },
  {
    id: "delivery",
    header: "Delivery",
    cell: ({ row }) => {
      const o = row.original
      return (
        <>
          <span>{deliveryTypeText(o.deliveryType)}</span>
          {o.promise && o.promise !== "window" ? (
            <span className="mt-0.5 block text-sm text-muted-foreground">{PROMISE_LABEL[o.promise]}</span>
          ) : null}
        </>
      )
    },
    meta: { label: "Delivery", phone: "meta" },
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => (row.original.statusView ? <PackageStatusPill view={row.original.statusView} showDetail={false} icons /> : "—"),
    meta: { label: "Status", phone: "badge" },
  },
  {
    id: "driver",
    header: "Driver",
    cell: ({ row }) => <DriverCell order={row.original} />,
    meta: { label: "Driver", priority: 2, phone: "meta" },
  },
  {
    id: "next",
    header: "Next step",
    cell: ({ row }) => {
      const o = row.original
      return (
        <>
          {o.awaiting ? <span className="font-medium">{AWAITING_LABEL[o.awaiting]}</span> : <span className="text-muted-foreground">Complete</span>}
          <span className="mt-0.5 block text-sm text-muted-foreground">Customer sees: {STAGE_LABEL[o.stage] ?? o.stage}</span>
        </>
      )
    },
    meta: { label: "Next step", priority: 2, phone: "meta" },
  },
  {
    id: "total",
    header: "Total",
    cell: ({ row }) => <span className="font-medium">{money(row.original.grandTotalAmount, row.original.currency)}</span>,
    meta: { label: "Total", align: "numeric", sortKey: "total", phone: "trail" },
  },
]

export function OrdersListScreen() {
  const state = useListState(ordersList, useSearch({ strict: false }))
  const f = state.view.filters
  const input = { key: ORDERS_LIST_KEY, list: ordersList, view: state.view, cursor: state.cursor, fetch: fetchOrderPage }
  const query = useQuery(listQueryOptions(input))
  const counts = useQuery(viewsQueryOptions({ key: ORDERS_LIST_KEY, list: ordersList, view: state.view, except: ["view"], fetch: fetchOrderViews }))
  const shops = useQuery(shopListQuery({ page: 1, pageSize: 100 }))
  const view: OrderListView = f.view ?? "all"

  return (
    <ListPage
      header={
        <PageHeader
          title="Orders"
          description="Every paid order with its current status, delivery details and who is handling it."
          actions={
            <>
              <Button variant="outline" asChild>
                <Link to="/orders/assignments">
                  <Route aria-hidden="true" />
                  Dispatch
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/orders/handover">
                  <Truck aria-hidden="true" />
                  Courier parcels
                </Link>
              </Button>
            </>
          }
        />
      }
    >
      <DataTable
        app="back-office"
        label="Orders"
        list={ordersList}
        state={state}
        columns={columns}
        query={query}
        viewFilters={["view"]}
        rowHref={(o) => ({ to: "/orders/$orderId", params: { orderId: o.id } })}
        empty={{ icon: Package, title: "No orders yet", description: "Paid orders appear here as they arrive." }}
        toolbar={
          <>
            <ViewSelect
              label="Order views"
              value={view}
              onChange={(v) => state.setFilter("view", v === "all" ? undefined : v)}
              options={(["all", ...ORDER_LIST_VIEWS] as const).map((v) => ({
                value: v,
                label: VIEW_LABEL[v],
                count: counts.data?.views[VIEW_COUNT[v]],
                attention: v !== "all",
              }))}
            />
            <Facet
              label="Status"
              value={f.status ?? null}
              onChange={(v) => state.setFilter("status", v ?? undefined)}
              options={ORDER_LIST_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABEL[s] }))}
            />
            <Facet
              label="Delivery"
              value={f.deliveryType ?? null}
              onChange={(v) => state.setFilters({ deliveryType: v ?? undefined, promise: v === "effy" ? f.promise : undefined })}
              options={ADMIN_ORDER_DELIVERY_FILTERS.map((d) => ({ value: d, label: DELIVERY_FILTER_LABEL[d] }))}
            />
            <Facet
              label="Sold as"
              value={f.promise ?? null}
              onChange={(v) => state.setFilters({ promise: v ?? undefined, deliveryType: v ? "effy" : f.deliveryType })}
              options={ADMIN_ORDER_PROMISE_FILTERS.map((p) => ({ value: p, label: PROMISE_LABEL[p] }))}
            />
            <Facet
              label="Shop"
              value={f.shopId ?? null}
              onChange={(v) => state.setFilter("shopId", v ?? undefined)}
              options={(shops.data?.items ?? []).map((s) => ({ value: s.id, label: `${s.code} · ${s.name}` }))}
            />
            <DateRangeFacet
              label="Placed"
              from={f.placedFrom}
              to={f.placedTo}
              onChange={(r) => state.setFilters({ placedFrom: r.from, placedTo: r.to })}
            />
            {isFiltered(state.view, ["view"]) ? <ResetFilters onReset={state.reset} /> : null}
            <SearchBox label="Search orders" placeholder="Order number, customer email or bag code…" value={state.draftQ} onChange={state.setQ} />
          </>
        }
      />
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground max-md:hidden">
        <Kbd>J</Kbd>
        <Kbd>K</Kbd> move through rows · <Kbd>↵</Kbd> opens the order · Status is the order's least-advanced package;
        Problem always wins.
      </p>
    </ListPage>
  )
}

function DriverCell({ order }: { order: OrderSummary }) {
  const { collect, deliver } = order.drivers
  const names = [collect.join(", "), deliver.join(", ")].filter((s) => s !== "")
  return (
    <span className="flex flex-col items-start gap-1">
      {names.length > 0 ? (
        <span className="whitespace-nowrap">{names.join(" → ")}</span>
      ) : !order.needsDriver ? (
        <span className="text-muted-foreground">—</span>
      ) : null}
      {order.needsDriver ? (
        <Badge variant="outline">
          <UserX aria-hidden="true" />
          Needs a driver
        </Badge>
      ) : null}
    </span>
  )
}
