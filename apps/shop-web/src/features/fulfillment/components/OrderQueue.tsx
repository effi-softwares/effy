import { useState } from "react"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { ArrowRight, BellRing, Loader2, PackageCheck, Truck } from "lucide-react"

import type { ShopOrderTab } from "@effy/shared-types"
import { Badge, Button, Progress, TabsCount, toast } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"
import { Bone, boneWidth, Loading } from "@effy/web-kit/patterns"

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
      <div
        className="grid grid-cols-4 items-start gap-4 max-lg:-mx-(--pad) max-lg:snap-x max-lg:snap-mandatory max-lg:grid-cols-[repeat(4,minmax(300px,1fr))] max-lg:scroll-px-(--pad) max-lg:overflow-x-auto max-lg:px-(--pad) max-lg:pb-1 max-lg:[scrollbar-width:none] max-md:grid-cols-[repeat(4,86%)] max-md:gap-3"
        role="list"
        aria-label="Order queue"
      >
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
    <section className="flex min-w-0 flex-col gap-3 max-lg:snap-start" role="listitem" aria-label={lane.title}>
      <h2 className="flex h-10 items-center gap-2 text-base font-semibold">
        {lane.title}
        {list.data ? (
          <TabsCount tone={lane.tab === "new" && total > 0 ? "primary" : undefined}>{total}</TabsCount>
        ) : null}
        {lane.hint ? <span className="ml-auto text-sm font-normal text-muted-foreground">{lane.hint}</span> : null}
      </h2>

      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.isPending ? (
        <Loading label={`Loading ${lane.title.toLowerCase()}`}>
          {Array.from({ length: quiet ? 3 : 2 }, (_, i) => (
            <div key={i} className={cn("ticket", quiet && "is-quiet")}>
              <div className="ticket__top">
                <Bone className="w-24" />
                <Bone kind="chip" className="ml-auto" />
              </div>
              <Bone kind="small" className={cn("max-w-44", boneWidth(i))} />
              {quiet ? null : <Bone kind="control" />}
            </div>
          ))}
        </Loading>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">
          {EMPTY[lane.tab] ?? "Nothing here"}
        </p>
      ) : (
        <>
          {rows.map((row) =>
            quiet ? <QuietTicket key={row.id} row={row} /> : <Ticket key={row.id} row={row} now={now} />,
          )}
          {total > rows.length ? (
            <Link
              to="/orders"
              search={{ tab: lane.tab, q }}
              className="inline-flex min-h-10 items-center gap-2 px-4 text-sm font-medium text-foreground no-underline hover:underline"
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
    <article className={cn("ticket", row.atRisk ? "is-late" : tone === "recent" && "is-new")}>
      <div className="ticket__top">
        <Link
          to="/orders/$fulfillmentId"
          params={{ fulfillmentId: row.id }}
          className="ticket__code text-foreground no-underline hover:underline"
        >
          {row.orderNumber}
        </Link>
        <span className="ml-auto">
          {row.status === "ready_for_pickup" ? (
            <ReadyWord />
          ) : tone === "recent" && row.status === "pending" ? (
            <Badge variant="info">
              <BellRing aria-hidden="true" />
              New
            </Badge>
          ) : (
            <OrderWait row={row} now={now} />
          )}
        </span>
      </div>
      <p className="ticket__meta">
        {itemsLine(row)}
        {tone === "unopened" ? " · not opened yet" : null}
        {row.unavailableCount > 0 ? ` · ${row.unavailableCount} short` : null}
      </p>

      {row.status === "picking" ? (
        <>
          <div className="flex items-center gap-3 text-sm tabular-nums text-muted-foreground">
            <Progress
              className="flex-auto"
              label={`${row.gatheredCount} of ${row.itemCount} picked`}
              value={row.itemCount > 0 ? (row.gatheredCount / row.itemCount) * 100 : 0}
            />
            {row.gatheredCount} of {row.itemCount}
          </div>
          <Button variant="outline" onClick={open}>
            Continue
          </Button>
        </>
      ) : row.status === "pending" ? (
        // Opening the order IS the acknowledgement; nobody has yet.
        <Button onClick={open}>Open order</Button>
      ) : row.status === "received" ? (
        <Button disabled={starting} onClick={() => void startPicking()}>
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
      className="ticket is-quiet hover:bg-[var(--row-hover)]"
    >
      <span className="ticket__top">
        <span className="ticket__code">{row.orderNumber}</span>
        <span className="ml-auto text-sm tabular-nums text-muted-foreground">{formatPlacedShort(row.placedAt)}</span>
      </span>
      <span className="ticket__meta">{itemsLine(row)}</span>
    </Link>
  )
}

function ReadyWord() {
  return (
    <Badge>
      <PackageCheck aria-hidden="true" />
      Ready
    </Badge>
  )
}
