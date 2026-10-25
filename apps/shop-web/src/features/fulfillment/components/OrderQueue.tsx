import { useState } from "react"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { ArrowRight, BellRing, Loader2, PackageCheck, Truck } from "lucide-react"

import type { ShopOrderTab } from "@effy/shared-types"
import { Button, Skeleton, toast } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"

import { cn } from "@/lib/utils"

import { fulfillmentMutationError } from "../errorText"
import { DRIVER_WORDS, driverWord, runTime } from "../collection"
import { todayQuery } from "@/features/today/queries"
import { courierPickupLine } from "../courierPickup"
import { deliveredByText, formatPlacedShort, orderRowTone, type OrderRow, type OrdersSearch } from "../orderConsole"
import { invalidateOrders, orderListQuery } from "../queries"
import { transitionFulfillment } from "../repo"

import { OrderWait } from "./OrderWait"

const LANES: readonly { tab: ShopOrderTab; title: string; hint?: string; search: OrdersSearch }[] = [
  { tab: "new", title: "Awaiting pick", hint: "oldest first", search: { tab: "new", dir: "asc" } },
  { tab: "picking", title: "Picking", search: { tab: "picking", dir: "asc" } },
  { tab: "ready_for_pickup", title: "Ready", hint: "for collection", search: { tab: "ready_for_pickup", dir: "asc" } },
  { tab: "collected", title: "Collected today", search: { tab: "collected", range: "today" } },
]

export function OrderQueue({ search, now }: { search: OrdersSearch; now: number }) {
  return (
    <div className="flex flex-col gap-4">
      <CollectionStrip now={now} />
      <div className="sh-lanes" role="list" aria-label="Order queue">
        {LANES.map((lane) => (
          <Lane key={lane.tab} lane={lane} q={search.q} now={now} />
        ))}
      </div>
    </div>
  )
}

function CollectionStrip({ now }: { now: number }) {
  const { data } = useQuery(todayQuery)
  const next = data?.nextCollection
  if (!next) return null
  const driver = driverWord(next, now)
  return (
    <p role="status" className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted px-4 py-3">
      <Truck aria-hidden="true" className="size-5 shrink-0" />
      <span className="font-medium">Next collection {runTime(next, data?.timezone)} · Effy driver</span>
      <span className="text-muted-foreground">
        · {next.due.ready} ready, {next.due.picking} still picking · {DRIVER_WORDS[driver]}
      </span>
    </p>
  )
}

function Lane({ lane, q, now }: { lane: (typeof LANES)[number]; q: string | undefined; now: number }) {
  const list = useQuery(orderListQuery({ ...lane.search, q }))
  const rows = list.data?.items ?? []
  const total = list.data?.total ?? 0
  const quiet = lane.tab === "collected"

  return (
    <section className="sh-lane" role="listitem" aria-label={lane.title}>
      <h2 className="sh-lane__head">
        {lane.title}
        {list.data ? (
          <span className={cn("bo-tabs__count", lane.tab === "new" && total > 0 && "bo-tabs__count--primary")}>
            {total}
          </span>
        ) : null}
        {lane.hint ? <span className="sh-lane__hint">{lane.hint}</span> : null}
      </h2>

      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.isPending ? (
        Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="sh-ticket" aria-busy="true">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-11 w-full" />
          </div>
        ))
      ) : rows.length === 0 ? (
        <p className="sh-lane__empty">{EMPTY[lane.tab] ?? "Nothing here"}</p>
      ) : (
        <>
          {rows.map((row) =>
            quiet ? <QuietTicket key={row.id} row={row} /> : <Ticket key={row.id} row={row} now={now} />,
          )}
          {total > rows.length ? (
            <Link
              to="/orders"
              search={{ tab: lane.tab, q }}
              className="inline-flex min-h-11 items-center gap-2 px-4 font-medium text-foreground no-underline hover:underline"
            >
              All {total} in the table
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          ) : null}
        </>
      )}
    </section>
  )
}

const EMPTY: Partial<Record<ShopOrderTab, string>> = {
  new: "Nothing waiting to be picked",
  picking: "Nobody is picking right now",
  ready_for_pickup: "Nothing is waiting for collection",
  collected: "Nothing collected yet today",
}

function itemsLine(row: OrderRow): string {
  const items = `${row.itemCount} ${row.itemCount === 1 ? "item" : "items"}`
  const who = row.courierPickup
    ? courierPickupLine(row.courierPickup)
    : row.collection
      ? `${deliveredByText(row.deliveredBy)} · ${runTime(row.collection)} run`
      : deliveredByText(row.deliveredBy)
  return `${items} · ${who}`
}

function Ticket({ row, now }: { row: OrderRow; now: number }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [starting, setStarting] = useState(false)
  const tone = orderRowTone(row, now)
  const open = () => void navigate({ to: "/orders/$fulfillmentId", params: { fulfillmentId: row.id } })

  async function startPicking() {
    setStarting(true)
    try {
      await transitionFulfillment(row.id, { to: "picking" })
      invalidateOrders(queryClient)
      open()
    } catch (err) {
      toast(fulfillmentMutationError(err))
      invalidateOrders(queryClient)
    } finally {
      setStarting(false)
    }
  }

  return (
    <article className={cn("sh-ticket", row.atRisk ? "is-late" : tone === "recent" && "is-new")}>
      <div className="sh-ticket__top">
        <Link
          to="/orders/$fulfillmentId"
          params={{ fulfillmentId: row.id }}
          className="sh-ticket__code text-foreground no-underline hover:underline"
        >
          {row.orderNumber}
        </Link>
        <span className="ml-auto">
          {row.status === "ready_for_pickup" ? (
            <ReadyWord />
          ) : tone === "recent" && row.status === "pending" ? (
            <span className="bo-st bo-st--info">
              <BellRing aria-hidden="true" />
              New
            </span>
          ) : (
            <OrderWait row={row} now={now} />
          )}
        </span>
      </div>
      <p className="sh-ticket__meta">
        {itemsLine(row)}
        {tone === "unopened" ? " · not opened yet" : null}
        {row.unavailableCount > 0 ? ` · ${row.unavailableCount} short` : null}
      </p>

      {row.status === "picking" ? (
        <>
          <div className="sh-ticket__progress">
            <div className="bo-meter" role="img" aria-label={`${row.gatheredCount} of ${row.itemCount} picked`}>
              <i
                className="bo-meter__booked"
                style={{ width: `${row.itemCount > 0 ? (row.gatheredCount / row.itemCount) * 100 : 0}%` }}
              />
            </div>
            {row.gatheredCount} of {row.itemCount}
          </div>
          <Button variant="outline" size="lg" onClick={open}>
            Continue
          </Button>
        </>
      ) : row.status === "pending" ? (
        // Opening the order IS the acknowledgement; nobody has yet.
        <Button size="lg" onClick={open}>
          Open order
        </Button>
      ) : row.status === "received" ? (
        <Button size="lg" disabled={starting} onClick={() => void startPicking()}>
          {starting ? <Loader2 className="animate-spin" /> : null}
          Start picking
        </Button>
      ) : null}
    </article>
  )
}

function QuietTicket({ row }: { row: OrderRow }) {
  return (
    <Link
      to="/orders/$fulfillmentId"
      params={{ fulfillmentId: row.id }}
      className="sh-ticket is-quiet hover:bg-[var(--row-hover)]"
    >
      <span className="sh-ticket__top">
        <span className="sh-ticket__code">{row.orderNumber}</span>
        <span className="sh-ticket__time">{formatPlacedShort(row.placedAt)}</span>
      </span>
      <span className="sh-ticket__meta">{itemsLine(row)}</span>
    </Link>
  )
}

function ReadyWord() {
  return (
    <span className="bo-st bo-st--moving">
      <PackageCheck aria-hidden="true" />
      Ready
    </span>
  )
}
