import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowRight } from "lucide-react"

import { Avatar, AvatarFallback, Button } from "@effy/design-system/ui"
import type { VehicleCheckDTO } from "@effy/shared-types"
import { Bone, DotWord, Loading } from "@effy/web-kit/patterns"

import { initialsOf } from "@/components/shell/identity"
import { dispatchDayQuery } from "@/features/dispatch/queries"
import { dutyQuery } from "@/features/drivers/queries"

import { plural } from "./model"
import { at12 } from "./overviewFormat"
import { CouldNotLoad, Section } from "./Section"

type Tone = "alert" | "busy" | "on"
const RANK: Record<Tone, number> = { alert: 0, busy: 1, on: 2 }

/** Who is working, problems first. `waiting` is the same figure as "Packages need a driver". */
export function OnDuty({ unsafe, waiting }: { unsafe: readonly VehicleCheckDTO[]; waiting: number | undefined }) {
  const duty = useQuery(dutyQuery())
  const day = useQuery(dispatchDayQuery())
  const blocked = new Set(unsafe.map((c) => c.driverId))
  const onDuty = duty.data?.onDuty ?? []
  const late = onDuty.find((d) => d.pastExpectedEnd)

  const drivers = onDuty
    .map((d) => {
      const round = day.data?.rounds.find((r) => r.driverId === d.driverId && r.round.status !== "completed")
      const kind = round?.round.kind === "collection" ? "Collection run" : "Delivery round"
      const [word, tone]: [string, Tone] = blocked.has(d.driverId)
        ? ["Blocked", "alert"]
        : d.pastExpectedEnd
          ? ["Past finish", "alert"]
          : round?.isLate
            ? ["Running late", "alert"]
            : round
              ? [round.round.kind === "collection" ? "On a run" : "On a round", "busy"]
              : ["Idle", "on"]
      const doing = blocked.has(d.driverId)
        ? "Vehicle check found it unsafe - no work until cleared"
        : round
          ? `${kind}${round.stageLabel ? ` · ${round.stageLabel}` : ""} · ${plural(Number(round.stopsRemaining), "stop")} left`
          : "Nothing assigned yet"
      return { d, word, tone, doing }
    })
    .sort((a, b) => RANK[a.tone] - RANK[b.tone] || a.d.driverName.localeCompare(b.d.driverName))

  return (
    <Section
      id="ov-duty-t"
      tour="overview.duty"
      order={3}
      title="On duty now"
      description={
        duty.data
          ? `${plural(onDuty.length, "driver")}${waiting !== undefined ? ` · ${plural(waiting, "package")} waiting for a driver` : ""}`
          : undefined
      }
      actions={
        <Button variant="ghost" size="sm" asChild>
          <Link to="/drivers">
            Drivers
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      {duty.isError ? (
        <CouldNotLoad what="who is on duty" service="fleet service" />
      ) : duty.isPending ? (
        <Loading label="Loading who is on duty">
          <ul>
            {[0, 1, 2].map((i) => (
              <li key={i} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-x-2.5 border-t py-2">
                <Bone className="size-8 rounded-lg" />
                <span className="space-y-1.5">
                  <Bone className="h-3 w-24" />
                  <Bone className="h-3 w-44" />
                </span>
                <Bone className="h-3 w-12" />
              </li>
            ))}
          </ul>
        </Loading>
      ) : drivers.length === 0 ? (
        <p className="border-t py-3.5 text-sm text-muted-foreground">
          {waiting ? "Nobody is on duty." : "Nobody is on duty yet."} Drivers go on duty in the driver app.
        </p>
      ) : (
        <ul>
          {drivers.map(({ d, word, tone, doing }) => (
            <li
              key={d.driverId}
              className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-x-2.5 border-t py-2"
            >
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg text-xs">{initialsOf(d.driverName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <Link to="/drivers/$driverId" params={{ driverId: d.driverId }} className="link">
                  {d.driverName}
                </Link>
                <small className="block truncate text-[13px] leading-[18px] text-muted-foreground" title={doing}>
                  {doing}
                </small>
              </div>
              <DotWord tone={tone}>{word}</DotWord>
            </li>
          ))}
        </ul>
      )}
      {late ? (
        <div className="flex items-center gap-2.5 border-t pt-2.5 text-[13px] text-muted-foreground">
          <span className="min-w-0 flex-1">
            {late.driverName}’s shift is running long
            {late.expectedEndAt ? ` - expected to finish ${at12(late.expectedEndAt)}` : ""}.
          </span>
          <Button variant="outline" size="sm" asChild>
            <Link to="/drivers/$driverId" params={{ driverId: late.driverId }}>
              Review
            </Link>
          </Button>
        </div>
      ) : null}
    </Section>
  )
}
