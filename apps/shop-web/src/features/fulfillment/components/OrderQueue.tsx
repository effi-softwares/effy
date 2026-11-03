import { useState } from "react"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { ArrowRight, BellRing, Clock, Loader2, PackageCheck } from "lucide-react"

import type { ShopOrderTab } from "@effy/shared-types"
import { Badge, Button, Progress, TabsCount, toast } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"
import { Bone, boneWidth, Loading } from "@effy/web-kit/patterns"

import { cn } from "@/lib/utils"

import { fulfillmentMutationError } from "../errorText"
import { DRIVER_WORDS, driverWord, runTime } from "../collection"
import { todayQuery } from "@/features/today/queries"
import { courierPickupLine } from "../courierPickup"
import { deliveredByText, orderRowTone, validateOrdersSearch, type OrderRow, type OrdersSearch } from "../orderConsole"
import { invalidateOrders, orderListQuery } from "../queries"
import { transitionFulfillment } from "../repo"

import { LeftShopColumn, LeftShopSheet } from "./LeftShop"
import { OrderWait } from "./OrderWait"

const LANES: readonly { tab: ShopOrderTab; title: string; hint?: string; search: OrdersSearch }[] = [
  { tab: "new", title: "Awaiting pick", hint: "oldest first", search: { tab: "new", dir: "asc" } },
  { tab: "picking", title: "Picking", search: { tab: "picking", dir: "asc" } },
  { tab: "ready_for_pickup", title: "Ready", hint: "for collection", search: { tab: "ready_for_pickup", dir: "asc" } },
]

export function OrderQueue({
  search,
  now,
  onSearchChange,
}: {
  search: OrdersSearch
  now: number
  onSearchChange: (next: OrdersSearch) => void
}) {
  const leftOpen = search.left === "open"
  const setLeftOpen = (open: boolean) =>
    onSearchChange(validateOrdersSearch({ ...search, left: open ? "open" : undefined } as Record<string, unknown>))

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <LeftShopSheet q={search.q} open={leftOpen} onOpenChange={setLeftOpen} />
      <div className="flex min-h-0 flex-1 overflow-x-auto max-md:-mx-(--pad) max-md:snap-x max-md:snap-mandatory max-md:scroll-px-(--pad) max-md:px-(--pad) max-md:pb-1 max-md:[scrollbar-width:none]">
        <div className="contents" role="list" aria-label="Order queue">
          {LANES.map((lane) => (
            <Lane key={lane.tab} lane={lane} q={search.q} now={now} narrow={leftOpen} />
          ))}
        </div>
        <LeftShopColumn q={search.q} open={leftOpen} onOpenChange={setLeftOpen} />
      </div>
    </div>
  )
}

/** Guided-tour keys (106) for the three lanes. */
const LANE_TOUR: Partial<Record<ShopOrderTab, string>> = {
  new: "orders.lane-new",
  picking: "orders.lane-picking",
  ready_for_pickup: "orders.lane-ready",
}

const QUEUE_HELP = "Orders to pick and pack, oldest first; scan a bag label to open its order."

/** The queue's line under its title: the next collection, or what the page is for when none is planned. */
export function QueueDescription({ now }: { now: number }) {
  const { data, isPending } = useQuery(todayQuery)
  if (isPending) return <Bone className="mt-1 w-96 max-w-full" />
  const next = data?.nextCollection
  if (!next) return QUEUE_HELP
  return (
    <span role="status" data-tour="orders.collection">
      <span className="font-medium text-foreground">Next collection {runTime(next, data?.timezone)}</span> ·{" "}
      {next.due.ready} ready, {next.due.picking} still picking · {DRIVER_WORDS[driverWord(next, now)]}
    </span>
  )
}

function Lane({
  lane,
  q,
  now,
  narrow,
}: {
  lane: (typeof LANES)[number]
  q: string | undefined
  now: number
  /** The fold-out column is open: give it the room first, so a tablet keeps all of the board in view. */
  narrow: boolean
}) {
  const list = useQuery(orderListQuery({ ...lane.search, q }))
  const rows = list.data?.items ?? []
  const total = list.data?.total ?? 0
  const late = rows.filter((r) => r.atRisk).length

  return (
    <section
      className={cn(
        "flex min-h-0 flex-1 basis-0 flex-col border-l first:border-l-0 first:*:pl-0 max-md:w-[86%] max-md:flex-none max-md:snap-start",
        narrow ? "min-w-52" : "min-w-60",
      )}
      role="listitem"
      aria-label={lane.title}
      data-tour={LANE_TOUR[lane.tab]}
    >
      <h2 className="flex h-12 shrink-0 items-center gap-2 border-b px-3 text-base font-semibold whitespace-nowrap">
        {lane.title}
        {list.data ? (
          <TabsCount tone={lane.tab === "new" && total > 0 ? "primary" : undefined}>{total}</TabsCount>
        ) : null}
        {late > 0 ? (
          <span className="ml-auto inline-flex items-center gap-1 text-sm font-medium tabular-nums text-destructive">
            <Clock aria-hidden="true" className="size-4" />
            {late} late
          </span>
        ) : lane.hint ? (
          <span className="ml-auto text-sm font-normal text-muted-foreground">{lane.hint}</span>
        ) : null}
      </h2>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-2">
        {list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.isPending ? (
          <Loading label={`Loading ${lane.title.toLowerCase()}`}>
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="ticket">
                <div className="ticket__top">
                  <Bone className="w-24" />
                  <Bone kind="chip" className="ml-auto" />
                </div>
                <Bone kind="small" className={cn("max-w-44", boneWidth(i))} />
                <Bone kind="control" />
              </div>
            ))}
          </Loading>
        ) : rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">{EMPTY[lane.tab] ?? "Nothing here"}</p>
        ) : (
          <>
            {rows.map((row, i) => (
              <Ticket key={row.id} row={row} now={now} next={i === 0} />
            ))}
            {total > rows.length ? (
              <Link
                to="/orders"
                search={{ view: "table", tab: lane.tab, q }}
                className="inline-flex min-h-10 items-center gap-2 px-4 text-sm font-medium text-foreground no-underline hover:underline"
              >
                All {total} in the table
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}

const EMPTY: Partial<Record<ShopOrderTab, string>> = {
  new: "Nothing waiting to be picked",
  picking: "Nobody is picking right now",
  ready_for_pickup: "Nothing is waiting for collection",
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

/** `next` is the top of its column: the one filled button, so there is one obvious thing to do. */
function Ticket({ row, now, next }: { row: OrderRow; now: number; next: boolean }) {
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
    <article className="ticket">
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
            <Badge>
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
            <span className="shrink-0 whitespace-nowrap">
              {row.gatheredCount} of {row.itemCount}
            </span>
          </div>
          <Button variant="outline" onClick={open}>
            Continue
          </Button>
        </>
      ) : row.status === "pending" ? (
        // Opening the order IS the acknowledgement; nobody has yet.
        <Button variant={next ? "default" : "outline"} onClick={open}>
          Open order
        </Button>
      ) : row.status === "received" ? (
        <Button variant={next ? "default" : "outline"} disabled={starting} onClick={() => void startPicking()}>
          {starting ? <Loader2 className="animate-spin" /> : null}
          Start picking
        </Button>
      ) : null}
    </article>
  )
}

function ReadyWord() {
  return (
    <Badge variant="muted">
      <PackageCheck aria-hidden="true" />
      Ready
    </Badge>
  )
}
