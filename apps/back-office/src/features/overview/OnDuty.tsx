import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"

import { Button, Skeleton } from "@effy/design-system/ui"
import { Panel, DotWord } from "@effy/web-kit/patterns"
import { initialsOf } from "@/components/shell/identity"
import { dispatchDayQuery } from "@/features/dispatch/queries"
import { dutyQuery } from "@/features/drivers/queries"
import { exceptionsQuery } from "@/features/exceptions/queries"
import { at12 } from "./overviewFormat"

export function OnDuty() {
  const duty = useQuery(dutyQuery())
  const day = useQuery(dispatchDayQuery())
  const exceptions = useQuery(exceptionsQuery(false))

  const blocked = new Set(
    (exceptions.data?.vehicleChecks ?? []).filter((c) => c.unsafe && c.clearedAt === null).map((c) => c.driverName),
  )
  const onDuty = duty.data?.onDuty ?? []
  const waiting = Number(duty.data?.unassigned.readyToCollect ?? 0) + Number(duty.data?.unassigned.readyToDeliver ?? 0)
  const late = onDuty.find((d) => d.pastExpectedEnd)

  return (
    <Panel
      title="On duty now"
      description={
        duty.data
          ? `${onDuty.length} ${onDuty.length === 1 ? "driver" : "drivers"} · ${waiting} packages waiting for the next assignment pass`
          : undefined
      }
      actions={
        <Button variant="ghost" size="sm" asChild>
          <Link to="/drivers">Drivers</Link>
        </Button>
      }
      footer={
        late ? (
          <>
            <span className="min-w-0 flex-1 text-xs text-muted-foreground">
              {late.driverName}'s shift is running long
              {late.expectedEndAt ? ` — expected to finish ${at12(late.expectedEndAt)}` : ""}.
            </span>
            <Button variant="outline" size="sm" asChild>
              <Link to="/drivers/$driverId" params={{ driverId: late.driverId }}>
                Review
              </Link>
            </Button>
          </>
        ) : undefined
      }
      footerBetween
      flush
    >
      {duty.isPending ? (
        <div className="space-y-3 px-5 py-4">
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </div>
      ) : onDuty.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">
          Nobody is on duty. Drivers go on duty in the driver app.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {onDuty.map((d) => {
            const round = day.data?.rounds.find((r) => r.driverId === d.driverId)
            const isBlocked = blocked.has(d.driverName)
            const doing = isBlocked
              ? "Vehicle check found it unsafe — no work until cleared"
              : round
                ? `${round.round.kind === "collection" ? "Collection run" : "Delivery round"}${round.stageLabel ? ` · ${round.stageLabel}` : ""} · ${round.stopsRemaining} stops left`
                : "Nothing assigned yet"
            return (
              <li key={d.driverId} className="flex items-center gap-3 px-5 py-3">
                <span className="bo-avatar bo-avatar--sq">{initialsOf(d.driverName)}</span>
                <div className="min-w-0 flex-1">
                  <Link to="/drivers/$driverId" params={{ driverId: d.driverId }} className="bo-link">
                    {d.driverName}
                  </Link>
                  <span className="bo-sub truncate">{doing}</span>
                </div>
                {isBlocked ? (
                  <DotWord tone="alert">Blocked</DotWord>
                ) : d.pastExpectedEnd ? (
                  <DotWord tone="alert">Past finish</DotWord>
                ) : round ? (
                  <DotWord tone="busy">{round.round.kind === "collection" ? "On a run" : "On a round"}</DotWord>
                ) : (
                  <DotWord tone="on">Idle</DotWord>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
