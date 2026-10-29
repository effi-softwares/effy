import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useStore } from "@tanstack/react-store"

import { ActivityLogDrawer, useActivityAction } from "@effy/web-kit/activity-log"
import { ErrorState } from "@effy/web-kit/console"
import { Button } from "@effy/design-system/ui"
import { ListSkeleton, Loading, MoreActions, PageHeader, PanelSkeleton } from "@effy/web-kit/patterns"
import { Printer, Zap } from "lucide-react"

import { LiveOrders } from "./LiveOrders"
import { printLists, QuickActionsSheet } from "./QuickActionsSheet"
import { relativeTime, subheading } from "./model"
import { NeedsAttention } from "./NeedsAttention"
import { NextCollection } from "./NextCollection"
import { TodayGlance } from "./TodayGlance"
import { todayQuery } from "./queries"
import { useNow } from "./useNow"

import { api } from "@/lib/api"
import { onlineStore } from "@/lib/online"
import { track } from "@/lib/telemetry"

export function TodayScreen() {
  const today = useQuery(todayQuery)
  const [quickActionsOpen, setQuickActionsOpen] = useState(false)
  const activity = useActivityAction()
  const now = useNow(15_000)

  useEffect(() => {
    track({ name: "today_viewed" })
  }, [])

  const data = today.data
  const awaitingPick = data?.backlog.awaitingPick.orders ?? 0
  const { online } = useStore(onlineStore)
  const fetchedAt = today.dataUpdatedAt
  const heading = useMemo(() => (data ? subheading(data.now, data.timezone) : null), [data])

  if (today.isError) {
    return <ErrorState error={today.error} onRetry={() => void today.refetch()} />
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 max-md:gap-4">
      <PageHeader
        title="Today"
        description={
          <>
            {heading ?? "\u00a0"}
            {!online && fetchedAt > 0 && (
              <span className="font-medium text-foreground">
                {" · "}last updated {relativeTime(new Date(fetchedAt).toISOString(), now)}
              </span>
            )}
          </>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setQuickActionsOpen(true)}>
              <Zap aria-hidden="true" />
              Quick actions
            </Button>
            <Button
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

      <div className="ef-detail">
        <div className="ef-detail__main">
          {today.isPending || !data ? (
            <Loading>
              <PanelSkeleton title="Needs attention" description flush footer>
                <ListSkeleton rows={4} media="icon" inset />
              </PanelSkeleton>
              <PanelSkeleton title="Live orders" description="Updating as orders arrive" flush>
                <ListSkeleton rows={5} media="icon" trailing="chip" inset />
              </PanelSkeleton>
            </Loading>
          ) : (
            <>
              <NeedsAttention
                items={data.attention}
                more={data.attentionMore}
                oldestWaitingAt={data.oldestWaitingAt}
                now={now}
              />
              <LiveOrders orders={data.live} now={now} />
            </>
          )}
        </div>
        <aside className="ef-detail__aside">
          <NextCollection next={data?.nextCollection} timezone={data?.timezone} now={now} loading={today.isPending} />
          <TodayGlance backlog={data?.backlog} />
        </aside>
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
    </div>
  )
}
