import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useStore } from "@tanstack/react-store"

import { ErrorState } from "@effy/web-kit/console"
import { Button, Skeleton } from "@effy/design-system/ui"
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

/**
 * Today — the shop console's home screen.
 *
 * It answers one question: what needs doing right now. No charts and no date range live here; the
 * analysis is on Insights, one click away. That separation is the feature, not a simplification
 * an operations screen that also carries a month of trend data invites the reader to study instead
 * of act.
 *
 * It replaced a dashboard that already existed. That screen's counts were honest but
 * flat; what it could not do was tell an operator which single thing to do next, or show an order
 * arriving while they watched.
 *
 * Every figure on this screen comes from one query. The card title, the unit count, the
 * badge, the sidebar badge and Insights' two fulfilment cells all read `todayQuery`'s `backlog`.
 */
export function TodayScreen() {
  const today = useQuery(todayQuery)
  const [quickActionsOpen, setQuickActionsOpen] = useState(false)
  const [teamActivityOpen, setTeamActivityOpen] = useState(false)
  // The render clock: relative times must age without new data. Cleared on unmount.
  const now = useNow(15_000)

  // One event per visit, not per render. No figures in it: whether the screen is used is a
  // different question from what the shop earned, and the second belongs nowhere near PostHog.
  useEffect(() => {
    track({ name: "today_viewed" })
  }, [])

  const data = today.data
  const awaitingPick = data?.backlog.awaitingPick.orders ?? 0
  // While offline, this screen is a photograph, not a window. Today is the screen an
  // operator makes decisions from, and its figures are the ones that look most convincingly current
  // when they are not: "3 orders awaiting pick" reads identically whether it arrived four seconds or
  // four hours ago. The shell's offline banner says the console is offline; this says how old what
  // you are reading is, which is the part that changes what you would do about it.
  const { online } = useStore(onlineStore)
  const fetchedAt = today.dataUpdatedAt
  const heading = useMemo(
    () => (data ? subheading(data.now, data.timezone) : null),
    [data],
  )

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
            {/* Unavailable when nothing is waiting, and it says why on hover: a primary button that
                prints nothing teaches an operator to distrust the printer, not the button. */}
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

      {/* Two columns from a landscape tablet: what needs a person, then the day so far on the rail. */}
      <div className="bo-detail">
        <div className="bo-detail__main">
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
        <aside className="bo-detail__aside">
          <NextCollection next={data?.nextCollection} timezone={data?.timezone} now={now} loading={today.isPending} />
          <TodayGlance backlog={data?.backlog} />
        </aside>
      </div>

      <QuickActionsSheet
        open={quickActionsOpen}
        onOpenChange={setQuickActionsOpen}
        awaitingPick={awaitingPick}
      />
      <TeamActivitySheet open={teamActivityOpen} onOpenChange={setTeamActivityOpen} />
    </div>
  )
}

/** A loading panel in the shape of the one it replaces — never a bare "Loading…". */
function PanelSkeleton({ rows }: { rows: number }) {
  return (
    <section className="bo-panel" aria-busy="true" aria-label="Loading">
      <div className="bo-panel__head">
        <div className="grid flex-1 gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="bo-attn">
          <Skeleton className="size-9 rounded-lg" />
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3.5 w-1/3" />
          </div>
        </div>
      ))}
    </section>
  )
}
