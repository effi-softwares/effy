import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useStore } from "@tanstack/react-store"

import { ErrorState } from "@effy/web-kit/console"
import { Button, Card, Skeleton } from "@effy/design-system/ui"
import { PageHeader } from "@effy/web-kit/patterns"
import { History, Printer, Zap } from "lucide-react"

import { LiveOrders } from "./LiveOrders"
import { printLists, QuickActionsSheet } from "./QuickActionsSheet"
import { TeamActivitySheet } from "./TeamActivitySheet"
import { relativeTime, subheading } from "./model"
import { NeedsAttention } from "./NeedsAttention"
import { NextCollection } from "./NextCollection"
import { TodayGlance } from "./TodayGlance"
import { todayQuery } from "./queries"
import { useNow } from "./useNow"

import { onlineStore } from "@/lib/online"
import { track } from "@/lib/telemetry"

export function TodayScreen() {
  const today = useQuery(todayQuery)
  const [quickActionsOpen, setQuickActionsOpen] = useState(false)
  const [teamActivityOpen, setTeamActivityOpen] = useState(false)
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
            <Button variant="outline" onClick={() => setTeamActivityOpen(true)}>
              <History aria-hidden="true" />
              Team activity
            </Button>
            <Button
              disabled={awaitingPick === 0}
              title={awaitingPick === 0 ? "Nothing is waiting to be picked" : undefined}
              onClick={() => void printLists()}
            >
              <Printer aria-hidden="true" />
              Print pick lists
            </Button>
          </>
        }
      />

      <div className="ef-detail">
        <div className="ef-detail__main">
          {today.isPending || !data ? (
            <>
              <PanelSkeleton rows={4} />
              <PanelSkeleton rows={5} />
            </>
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
      <TeamActivitySheet open={teamActivityOpen} onOpenChange={setTeamActivityOpen} />
    </div>
  )
}

function PanelSkeleton({ rows }: { rows: number }) {
  return (
    <Card className="gap-0 py-0" aria-busy="true" aria-label="Loading">
      <div className="grid gap-2 border-b px-5 py-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex min-h-16 items-center gap-4 px-5 py-3">
          <Skeleton className="size-9 rounded-lg" />
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
      ))}
    </Card>
  )
}
