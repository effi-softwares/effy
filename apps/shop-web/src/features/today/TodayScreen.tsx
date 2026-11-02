import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useStore } from "@tanstack/react-store"
import { Printer, Zap } from "lucide-react"

import { ActivityLogDrawer, useActivityAction } from "@effy/web-kit/activity-log"
import { ErrorState } from "@effy/web-kit/console"
import { Button } from "@effy/design-system/ui"
import { MoreActions, PageHeader } from "@effy/web-kit/patterns"

import { MotionScope } from "@/components/console/MotionScope"
import { orderListQuery } from "@/features/fulfillment/queries"
import { money } from "@/features/insights/model"
import { insightsQuery } from "@/features/insights/queries"
import { api } from "@/lib/api"
import { onlineStore } from "@/lib/online"
import { track } from "@/lib/telemetry"

import { CollectionBand } from "./CollectionBand"
import { DayLine, DayLineSkeleton } from "./DayLine"
import { buildJobs, relativeTime, todayDate } from "./model"
import { printLists, QuickActionsSheet } from "./QuickActionsSheet"
import { todayQuery } from "./queries"
import { useNow } from "./useNow"

/** The orders that make up Next up: the same oldest-first list the queue's first column reads. */
const WAITING = { tab: "new", dir: "asc" } as const

export function TodayScreen() {
  const today = useQuery(todayQuery)
  const waiting = useQuery(orderListQuery(WAITING))
  const sales = useQuery(insightsQuery("today"))
  const [quickActionsOpen, setQuickActionsOpen] = useState(false)
  const activity = useActivityAction()
  const now = useNow(15_000)
  const { online } = useStore(onlineStore)

  useEffect(() => {
    track({ name: "today_viewed" })
  }, [])

  const data = today.data
  const awaitingPick = data?.backlog.awaitingPick.orders ?? 0
  const fetchedAt = today.dataUpdatedAt
  const figures = sales.data?.primary
  const context = useMemo(() => {
    if (!data) return null
    const parts = [todayDate(data.now, data.timezone)]
    if (figures && sales.data) {
      const orders = Number(figures.orders.value)
      parts.push(
        orders === 0
          ? "No orders yet"
          : `${money(figures.revenue.value, sales.data.currency)} from ${orders} ${orders === 1 ? "order" : "orders"} so far`,
      )
    }
    if (!online && fetchedAt > 0) parts.push(`last updated ${relativeTime(new Date(fetchedAt).toISOString(), now)}`)
    return parts.join(" · ")
  }, [data, figures, sales.data, online, fetchedAt, now])

  const { jobs, more } = useMemo(
    () =>
      data
        ? buildJobs({
            waiting: waiting.data?.items ?? [],
            waitingTotal: waiting.data?.total ?? 0,
            attention: data.attention,
            attentionMore: data.attentionMore,
            nextRunAt: data.nextCollection?.runAt ?? null,
            timezone: data.timezone,
            now,
          })
        : { jobs: [], more: 0 },
    [data, waiting.data, now],
  )

  if (today.isError) {
    return <ErrorState error={today.error} onRetry={() => void today.refetch()} />
  }

  return (
    <MotionScope>
        <div className="flex min-w-0 flex-col gap-4">
          <PageHeader
            title="Today"
            description={context ?? "\u00a0"}
            actions={
              <>
                <Button variant="outline" onClick={() => setQuickActionsOpen(true)}>
                  <Zap aria-hidden="true" />
                  Quick actions
                </Button>
                <Button
                  variant="outline"
                  disabled={awaitingPick === 0}
                  title={awaitingPick === 0 ? "Nothing is waiting to be picked" : undefined}
                  onClick={() => void printLists()}
                >
                  <Printer aria-hidden="true" />
                  Print pick lists
                </Button>
                <MoreActions actions={[{ ...activity, label: "Team activity" }]} />
              </>
            }
          />
          <CollectionBand next={data?.nextCollection} timezone={data?.timezone} now={now} loading={today.isPending} />
          {data ? (
            <DayLine
              events={data.events}
              // Nothing re-reads the page as time passes, so a row leaves on the page's own clock.
              ahead={data.ahead.filter((x) => new Date(x.at).getTime() > now)}
              yesterday={data.yesterday}
              jobs={jobs}
              more={more}
              timezone={data.timezone}
              onEarlier={() => activity.onSelect?.()}
            />
          ) : (
            <DayLineSkeleton />
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
