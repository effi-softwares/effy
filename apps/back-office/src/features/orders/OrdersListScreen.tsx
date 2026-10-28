import { useEffect, useMemo, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import { useHotkey } from "@tanstack/react-hotkeys"
import { Route, SearchX, Truck, UserX } from "lucide-react"

import { cn } from "@effy/design-system"
import {
  Badge,
  Button,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@effy/design-system/ui"
import { ADMIN_ORDER_DELIVERY_FILTERS, ADMIN_ORDER_PROMISE_FILTERS, type DeliveryPromise } from "@effy/shared-types"
import { ErrorState, PackageStatusPill } from "@effy/web-kit/console"

import {
  EmptyState,
  Facet,
  Kbd,
  PageHeader,
  Pager,
  ResetFilters,
  SearchBox,
  Toolbar,
  ToolbarSpacer,
  ViewSelect,
} from "@effy/web-kit/patterns"
import { moment, money } from "@/lib/format"

import {
  AWAITING_LABEL,
  DELIVERY_FILTER_LABEL,
  deliveryTypeText,
  PROMISE_LABEL,
  STAGE_LABEL,
  type OrderListParams,
  type OrderSummary,
} from "./model"
import { orderViewCountsQuery, ordersListQuery } from "./queries"

export const ORDER_VIEWS = ["all", "driver", "handover", "arrival", "refund", "courier"] as const
export type OrderView = (typeof ORDER_VIEWS)[number]
export interface OrdersSearch {
  view?: OrderView
  delivery?: "effy" | "courier"
  sold?: DeliveryPromise
}

const VIEW_LABEL: Record<OrderView, string> = {
  all: "All orders",
  driver: "Needs a driver",
  handover: AWAITING_LABEL.handover,
  arrival: AWAITING_LABEL.arrival,
  refund: AWAITING_LABEL.refund_decision,
  courier: AWAITING_LABEL.courier_problem,
}

function viewParams(view: OrderView): Pick<OrderListParams, "awaiting" | "needsDriver"> {
  switch (view) {
    case "driver":
      return { needsDriver: true }
    case "handover":
      return { awaiting: "handover" }
    case "arrival":
      return { awaiting: "arrival" }
    case "refund":
      return { awaiting: "refund_decision" }
    case "courier":
      return { awaiting: "courier_problem" }
    default:
      return {}
  }
}

export function OrdersListScreen() {
  const search = useSearch({ strict: false }) as OrdersSearch
  const navigate = useNavigate()
  const view: OrderView = search.view ?? "all"
  const [q, setQ] = useState("")
  const [rows, setRows] = useState(25)
  const [cursors, setCursors] = useState<string[]>([])
  const [focus, setFocus] = useState(-1)

  const setSearch = (patch: Partial<OrdersSearch>) => {
    setCursors([])
    setFocus(-1)
    void navigate({ to: "/orders", search: (prev: OrdersSearch) => clean({ ...prev, ...patch }) })
  }

  const base = useMemo<OrderListParams>(
    () => ({
      q: q.trim() || undefined,
      deliveryType: search.sold ? undefined : search.delivery,
      promise: search.sold,
    }),
    [q, search.delivery, search.sold],
  )
  const params = useMemo<OrderListParams>(
    () => ({ ...base, ...viewParams(view), cursor: cursors[cursors.length - 1], limit: rows }),
    [base, view, cursors, rows],
  )

  const { data, error, isPending, isError, refetch } = useQuery(ordersListQuery(params))
  const counts = useQuery(orderViewCountsQuery(base))
  const items = data?.items ?? []

  useEffect(() => setFocus(-1), [data])
  useHotkey("J", () => setFocus((i) => Math.min(i + 1, items.length - 1)), { ignoreInputs: true })
  useHotkey("K", () => setFocus((i) => Math.max(i - 1, 0)), { ignoreInputs: true })
  useHotkey(
    "Enter",
    () => {
      const o = items[focus]
      if (o) void navigate({ to: "/orders/$orderId", params: { orderId: o.id } })
    },
    { ignoreInputs: true, enabled: focus >= 0 },
  )

  const c = counts.data
  const countOf: Record<OrderView, number | undefined> = {
    all: c?.all,
    driver: c?.needsDriver,
    handover: c?.handover,
    arrival: c?.arrival,
    refund: c?.refundDecision,
    courier: c?.courierProblem,
  }
  const filtered = Boolean(q || search.delivery || search.sold)

  return (
    <>
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

      <Toolbar>
        <ViewSelect
          label="Order views"
          value={view}
          onChange={(v) => setSearch({ view: v === "all" ? undefined : v })}
          options={ORDER_VIEWS.map((v) => ({
            value: v,
            label: VIEW_LABEL[v],
            count: countOf[v],
            attention: v !== "all",
          }))}
        />
        <SearchBox
          label="Search orders"
          placeholder="Order number or customer email…"
          value={q}
          onChange={(v) => {
            setQ(v)
            setCursors([])
          }}
        />
        <Facet
          label="Delivery"
          value={search.delivery ?? null}
          onChange={(v) => setSearch({ delivery: v ?? undefined, sold: v === "effy" ? search.sold : undefined })}
          options={ADMIN_ORDER_DELIVERY_FILTERS.map((f) => ({ value: f, label: DELIVERY_FILTER_LABEL[f] }))}
        />
        <Facet
          label="Sold as"
          value={search.sold ?? null}
          onChange={(v) => setSearch({ sold: v ?? undefined, delivery: v ? "effy" : search.delivery })}
          options={ADMIN_ORDER_PROMISE_FILTERS.map((p) => ({ value: p, label: PROMISE_LABEL[p] }))}
        />
        {filtered ? (
          <ResetFilters
            onReset={() => {
              setQ("")
              setSearch({ delivery: undefined, sold: undefined })
            }}
          />
        ) : null}
        <ToolbarSpacer />
      </Toolbar>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="overflow-hidden rounded-xl border bg-card space-y-0 p-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="mb-3 h-10" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={filtered || view !== "all" ? "No orders match your filter." : "No orders yet."}
          description={
            filtered || view !== "all"
              ? "Try a different view, or clear the filters."
              : "Paid orders appear here as they arrive."
          }
          action={
            filtered || view !== "all" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQ("")
                  setSearch({ view: undefined, delivery: undefined, sold: undefined })
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="min-w-0">
            <Table className="ef-rtable">
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Placed</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Delivery</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Next step</TableHead>
                  <TableHead numeric>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((o, i) => (
                  <OrderRow key={o.id} order={o} focused={i === focus} />
                ))}
              </TableBody>
            </Table>
          </div>
          <Pager
            summary={`${items.length} order${items.length === 1 ? "" : "s"} · page ${cursors.length + 1}`}
            canBack={cursors.length > 0}
            canNext={Boolean(data.nextCursor)}
            onBack={() => setCursors((s) => s.slice(0, -1))}
            onNext={() => setCursors((s) => (data.nextCursor ? [...s, data.nextCursor] : s))}
            rows={rows}
            onRows={(n) => {
              setRows(n)
              setCursors([])
            }}
          />
        </div>
      )}

      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground max-md:hidden">
        <Kbd>J</Kbd>
        <Kbd>K</Kbd> move through rows · <Kbd>↵</Kbd> opens the order · Status is the order's least-advanced package;
        Problem always wins.
      </p>
    </>
  )
}

function clean(s: OrdersSearch): OrdersSearch {
  const out: OrdersSearch = {}
  if (s.view && s.view !== "all") out.view = s.view
  if (s.delivery) out.delivery = s.delivery
  if (s.sold) out.sold = s.sold
  return out
}

function OrderRow({ order: o, focused }: { order: OrderSummary; focused: boolean }) {
  return (
    <TableRow className={cn(focused && "is-selected")} aria-selected={focused || undefined}>
      <TableCell data-m="primary">
        <Link to="/orders/$orderId" params={{ orderId: o.id }} className="link font-mono">
          {o.orderNumber}
        </Link>
        <span className="mt-0.5 block text-sm text-muted-foreground md:hidden">{o.customerEmail}</span>
      </TableCell>
      <TableCell data-m="hide" className="text-muted-foreground whitespace-nowrap">
        {moment(o.placedAt)}
      </TableCell>
      <TableCell data-m="hide">
        <span className="line-clamp-1">{o.customerEmail}</span>
      </TableCell>
      <TableCell data-m="badge">
        {o.statusView ? <PackageStatusPill view={o.statusView} showDetail={false} icons /> : "—"}
      </TableCell>
      <TableCell data-m="meta">
        <span className="whitespace-nowrap">{deliveryTypeText(o.deliveryType)}</span>
        {o.promise && o.promise !== "window" ? (
          <span className="mt-0.5 block text-sm text-muted-foreground">{PROMISE_LABEL[o.promise]}</span>
        ) : null}
      </TableCell>
      <TableCell data-m="hide">
        <DriverCell order={o} />
      </TableCell>
      <TableCell data-m="meta" data-label="Next step">
        {o.awaiting ? (
          <span className="font-medium">{AWAITING_LABEL[o.awaiting]}</span>
        ) : (
          <span className="text-muted-foreground">Complete</span>
        )}
        <span className="mt-0.5 block text-sm text-muted-foreground">
          Customer sees: {STAGE_LABEL[o.stage] ?? o.stage}
        </span>
      </TableCell>
      <TableCell numeric data-m="trail" className="font-medium">
        {money(o.grandTotalAmount, o.currency)}
      </TableCell>
    </TableRow>
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
