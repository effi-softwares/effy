import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { ErrorState } from "@effy/web-kit/console"
import { Button, Skeleton } from "@effy/design-system/ui"

import { LiveOrders } from "./LiveOrders"
import { printLists, QuickActionsSheet } from "./QuickActionsSheet"
import { TeamActivitySheet } from "./TeamActivitySheet"
import { subheading } from "./model"
import { NeedsAttention } from "./NeedsAttention"
import { TodayGlance } from "./TodayGlance"
import { todayQueryFor } from "./queries"
import { useNow } from "./useNow"
import { useShopLive } from "./useShopLive"

import { track } from "@/lib/telemetry"

/**
 * TODAY — the shop console's home screen (058, US1/US2).
 *
 * It answers one question: what needs doing right now. No charts and no date range live here; the
 * analysis is on Insights, one click away. That separation is the feature, not a simplification —
 * an operations screen that also carries a month of trend data invites the reader to study instead
 * of act.
 *
 * ⚠ IT REPLACED A DASHBOARD THAT ALREADY EXISTED (057 US1). That screen's counts were honest but
 * flat; what it could not do was tell an operator which single thing to do next, or show an order
 * arriving while they watched.
 *
 * ⚠ EVERY FIGURE ON THIS SCREEN COMES FROM ONE QUERY (FR-006). The card title, the unit count, the
 * badge, the sidebar badge and Insights' two fulfilment cells all read `todayQuery`'s `backlog`.
 */
export function TodayScreen() {
  // ⚠ The stream only ever says "read again" — it never supplies a row (FR-028). What `connected`
  // changes is the PACE of the same query, not its shape, so the screen below cannot tell the two
  // modes apart and neither can the operator.
  const { connected } = useShopLive()
  const today = useQuery(todayQueryFor(connected))
  const [quickActionsOpen, setQuickActionsOpen] = useState(false)
  const [teamActivityOpen, setTeamActivityOpen] = useState(false)
  // The render clock: relative times must age without new data (FR-009). Cleared on unmount.
  const now = useNow(15_000)

  // One event per visit, not per render. ⚠ No figures in it: whether the screen is used is a
  // different question from what the shop earned, and the second belongs nowhere near PostHog.
  useEffect(() => {
    track({ name: "today_viewed" })
  }, [])

  const data = today.data
  const awaitingPick = data?.backlog.awaitingPick.orders ?? 0
  const heading = useMemo(
    () => (data ? subheading(data.now, data.timezone) : null),
    [data],
  )

  if (today.isError) {
    return <ErrorState error={today.error} onRetry={() => void today.refetch()} />
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-center gap-3">
        <div className="grid min-w-0 gap-[3px]">
          <h1 className="text-[17px] font-semibold tracking-[-0.02em]">Today</h1>
          <p className="text-muted-foreground text-[12.5px]">
            {heading ?? <Skeleton className="h-4 w-56" />}
          </p>
        </div>
        <div className="min-w-3 flex-1" />
        <Button
          variant="outline"
          className="h-[34px] px-3 text-[13px]"
          onClick={() => setQuickActionsOpen(true)}
        >
          Quick actions
        </Button>
        <Button
          variant="outline"
          className="h-[34px] px-3 text-[13px]"
          onClick={() => setTeamActivityOpen(true)}
        >
          Team activity
        </Button>
        {/* ⚠ Unavailable when nothing is waiting, and it says why on hover: a primary button that
            prints nothing teaches an operator to distrust the printer, not the button. */}
        <Button
          className="h-[34px] px-[13px] text-[13px]"
          disabled={awaitingPick === 0}
          title={awaitingPick === 0 ? "Nothing is waiting to be picked" : undefined}
          onClick={() => void printLists()}
        >
          Print pick lists
        </Button>
      </header>

      {/* The priority row: 1.15fr / 1fr on desktop, one column under 1100px (the brief's grid). */}
      <div className="grid items-start gap-5 [grid-template-columns:minmax(0,1fr)] min-[1100px]:[grid-template-columns:minmax(0,1.15fr)_minmax(0,1fr)]">
        {today.isPending || !data ? (
          <>
            <Skeleton className="h-[320px] w-full rounded-[var(--radius)]" />
            <Skeleton className="h-[320px] w-full rounded-[var(--radius)]" />
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

      <TodayGlance backlog={data?.backlog} />

      <QuickActionsSheet
        open={quickActionsOpen}
        onOpenChange={setQuickActionsOpen}
        awaitingPick={awaitingPick}
      />
      <TeamActivitySheet open={teamActivityOpen} onOpenChange={setTeamActivityOpen} />
    </div>
  )
}
