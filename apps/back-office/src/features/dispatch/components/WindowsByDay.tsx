import { useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { CalendarClock, Clock, Route, Snowflake } from "lucide-react"

import type { DispatchWindowDTO } from "@effy/shared-types"
import {
  Badge,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableRow,
  ToggleGroup,
  ToggleGroupItem,
} from "@effy/design-system/ui"
import { PackageStatusPill } from "@effy/web-kit/console"

import { Bone, boneWidth, Loading, Panel } from "@effy/web-kit/patterns"

import { dispatchWindowsQuery } from "../queries"

export function roundLine(w: DispatchWindowDTO, isToday: boolean): string {
  if (w.rounds.length === 0)
    return isToday ? "No round yet - auto-assign plans it as parcels reach the hub" : "Planned on the day"
  return w.rounds.map((r) => `${r.driver.name} (${r.parcels})`).join(", ")
}

export function WindowsByDay() {
  const [date, setDate] = useState<string | null>(null)
  const { data, isPending, isError } = useQuery(dispatchWindowsQuery(date))

  return (
    <Panel
      title={<span id="windows-heading">Delivery windows</span>}
      icon={<CalendarClock aria-hidden="true" />}
      description="Parcels booked into each window, and the round that carries them."
      actions={
        data ? (
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            className="max-w-full overflow-x-auto"
            aria-label="Day"
            value={data.date}
            onValueChange={(v) => {
              const d = data.days.find((x) => x.date === v)
              if (d) setDate(d.isToday ? null : d.date)
            }}
          >
            {data.days.map((d) => (
              <ToggleGroupItem key={d.date} value={d.date} className="px-3">
                {d.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : undefined
      }
      flush
    >
      {isError ? (
        <p className="px-5 py-4 text-sm font-medium" role="alert">
          The delivery windows could not be loaded.
        </p>
      ) : isPending ? (
        <Loading label="Loading delivery windows">
          <div className="divide-y divide-border">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-3 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Bone className="w-28" />
                    <Bone kind="small" className="w-16" />
                  </div>
                  <div className="flex min-w-55 items-center gap-3">
                    <Bone kind="small" className="h-2 min-w-16 flex-1 rounded-full" />
                    <Bone kind="small" className="w-16" />
                  </div>
                </div>
                <Bone className={boneWidth(i)} />
              </div>
            ))}
          </div>
        </Loading>
      ) : data.windows.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">No deliveries are booked for this day yet.</p>
      ) : (
        <div className="divide-y divide-border">
          {data.windows.map((w) => {
            const isToday = data.days.find((d) => d.date === data.date)?.isToday ?? false
            const delivered = w.parcels.filter((p) => p.status.status === "delivered").length
            const moving = w.parcels.filter((p) =>
              ["with_driver", "at_hub", "out_for_delivery"].includes(p.status.status),
            ).length
            const n = w.parcels.length || 1
            const summary = `${w.parcels.length} ${w.parcels.length === 1 ? "parcel" : "parcels"} · ${roundLine(w, isToday)}`
            return (
              <div key={w.windowStart} className="space-y-3 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="font-mono text-sm font-semibold">{w.label}</span>
                    {w.anyTime ? <Badge variant="outline">Any time</Badge> : null}
                    <span className="text-sm text-muted-foreground">
                      {w.parcels.length} {w.parcels.length === 1 ? "parcel" : "parcels"}
                    </span>
                  </div>
                  <div className="flex min-w-55 items-center gap-3">
                    <div
                      className="flex h-2 min-w-16 flex-1 overflow-hidden rounded-full bg-muted"
                      role="img"
                      aria-label={`${delivered} delivered, ${moving} on the way, of ${w.parcels.length}`}
                    >
                      <i className="block h-full bg-success" style={{ width: `${(delivered / n) * 100}%` }} />
                      <i className="block h-full bg-primary-fill" style={{ width: `${(moving / n) * 100}%` }} />
                    </div>
                    <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                      {delivered} delivered
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Route aria-hidden="true" className="size-4 text-muted-foreground" />
                  <span>{roundLine(w, isToday)}</span>
                </div>
                {w.parcels.length > 0 ? (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <Table className="ef-rtable [&_td]:py-2" aria-label={w.label}>
                      <TableCaption className="sr-only">{summary}</TableCaption>
                      <TableBody>
                        {w.parcels.map((p) => (
                          <TableRow key={p.packageId}>
                            <TableCell data-m="primary" className="w-40">
                              <span className="font-mono font-medium">{p.orderNumber}</span>
                            </TableCell>
                            <TableCell data-m="badge">
                              <PackageStatusPill view={p.status} icons />
                            </TableCell>
                            <TableCell data-m="meta" className="text-muted-foreground">
                              {p.group ?? "No area"}
                            </TableCell>
                            <TableCell data-m="meta">
                              <span className="flex flex-wrap gap-2">
                                {p.collectLate ? (
                                  <span className="late">
                                    <Clock aria-hidden="true" />
                                    Late for its run
                                  </span>
                                ) : null}
                                {p.coldOvernight ? (
                                  <Badge variant="outline">
                                    <Snowflake aria-hidden="true" />
                                    Needs cold storage
                                  </Badge>
                                ) : null}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}
