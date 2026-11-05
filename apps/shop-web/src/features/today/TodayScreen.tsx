import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useStore } from "@tanstack/react-store"
import { Printer, Zap } from "lucide-react"

import { Button } from "@effy/design-system/ui"
import { OPERATING_TZ } from "@effy/shared-types"
import { ActivityLogDrawer, useActivityAction } from "@effy/web-kit/activity-log"
import { ErrorState } from "@effy/web-kit/console"
import { MoreActions, PageHeader } from "@effy/web-kit/patterns"
import { tourStatus, useTourPage } from "@effy/web-kit/tour"

import { MotionScope } from "@/components/console/MotionScope"
import { orderListQuery } from "@/features/fulfillment/queries"
import { money } from "@/features/insights/model"
import { insightsQuery } from "@/features/insights/queries"
import { api } from "@/lib/api"
import { onlineStore } from "@/lib/online"
import { track } from "@/lib/telemetry"

import { briefOf, comingUp, needsRows, plural, relativeTime, todayDate } from "./model"
import { NeedsYou } from "./NeedsYou"
import { OrdersToday } from "./OrdersToday"
import { JustHappened, OrdersFlow, PickingNow, SellingToday, Shortcuts } from "./Panels"
import { printLists, QuickActionsSheet } from "./QuickActionsSheet"
import { RunLine } from "./RunLine"
import { StatusBrief } from "./StatusBrief"
import { todayQuery } from "./queries"
import { useNow } from "./useNow"

/** The orders to pick, oldest first: the same list the queue's first column reads. */
const WAITING = { tab: "new", dir: "asc" } as const

export function TodayScreen() {
  const today = useQuery(todayQuery)
  const waiting = useQuery(orderListQuery(WAITING))
  const sales = useQuery(insightsQuery("today"))
  const [quickActionsOpen, setQuickActionsOpen] = useState(false)
  const activity = useActivityAction()
  const clientNow = useNow(15_000)
  const { online } = useStore(onlineStore)
  useTourPage("today", { status: tourStatus(today) })

  useEffect(() => {
    track({ name: "today_viewed" })
  }, [])

  const data = today.data
  // One clock for the whole page: the server's, carried forward by the browser's, so a wrong tablet clock cannot move a
  // countdown away from the date above it.
  const skew = data && today.dataUpdatedAt ? new Date(data.now).getTime() - today.dataUpdatedAt : 0
  const now = clientNow + skew
  const awaitingPick = data?.backlog.awaitingPick.orders ?? 0
  const figures = sales.data?.primary

  const context = useMemo(() => {
    if (!data) return null
    const parts = [todayDate(data.now, data.timezone)]
    if (sales.isError) parts.push("Sales couldn’t load")
    else if (figures && sales.data) {
      const orders = Number(figures.orders.value)
      parts.push(orders === 0 ? "No orders yet" : `${money(figures.revenue.value, sales.data.currency)} from ${plural(orders, "order")} so far`)
    }
    if (!online && today.dataUpdatedAt > 0) parts.push(`last updated ${relativeTime(new Date(today.dataUpdatedAt).toISOString(), clientNow)}`)
    return parts.join(" · ")
  }, [data, figures, sales.data, sales.isError, online, today.dataUpdatedAt, clientNow])

  const brief = data ? briefOf(data, now) : null
  const coming = data ? comingUp(data, now) : []
  const rows = data ? needsRows(data, waiting.data?.items, now) : null

  return (
    <MotionScope>
      <div className="ef-board flex min-w-0 flex-col">
        <PageHeader
          title="Today"
          description={context ?? " "}
          actions={
            <>
              <Button variant="outline" data-tour="today.quick-actions" onClick={() => setQuickActionsOpen(true)}>
                <Zap aria-hidden="true" />
                Quick actions
              </Button>
              <Button
                variant="outline"
                data-tour="today.print"
                disabled={awaitingPick === 0}
                title={awaitingPick === 0 ? "Nothing is waiting to be picked" : undefined}
                onClick={() => void printLists()}
              >
                <Printer aria-hidden="true" />
                Print pick lists
              </Button>
              <MoreActions tour="page-more" actions={[{ ...activity, label: "Team activity" }]} />
            </>
          }
        />

        {today.isError ? (
          // The head and its actions stay: printing pick lists and the team's log still work without this read.
          <ErrorState error={today.error} onRetry={() => void today.refetch()} />
        ) : (
          <>
            <StatusBrief brief={brief} coming={coming} now={now} timezone={data?.timezone ?? OPERATING_TZ} />
            <div className="ef-board-layout">
              <div className="ef-board-main">
                <RunLine today={data} now={now} />
                <OrdersFlow today={data} />
                <OrdersToday sales={sales.data} failed={sales.isError} today={data} />
                <div data-order={6} className="grid grid-cols-2 gap-x-10 gap-y-9 max-lg:grid-cols-1">
                  <SellingToday today={data} />
                  <JustHappened today={data} onActivity={() => activity.onSelect?.()} />
                </div>
                <Shortcuts onPrint={() => void printLists()} canPrint={awaitingPick > 0} />
              </div>
              <div className="ef-board-rail">
                <NeedsYou rows={rows} />
                <PickingNow today={data} now={now} />
              </div>
            </div>
          </>
        )}
      </div>

      <QuickActionsSheet open={quickActionsOpen} onOpenChange={setQuickActionsOpen} awaitingPick={awaitingPick} />
      <ActivityLogDrawer
        app="shop-web"
        log="shop-team"
        title="Team activity"
        description="Everything your team has done — orders, picking, notes, stock and refunds — newest first."
        api={api}
        path="/shop/v1/team-activity"
        queryKey={["shop", "today"]}
        fileName="team-activity"
      />
    </MotionScope>
  )
}
