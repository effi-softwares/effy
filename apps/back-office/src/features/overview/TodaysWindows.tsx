import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowRight, CircleSlash, Clock } from "lucide-react"

import { Badge, Button, Skeleton } from "@effy/design-system/ui"
import { leastAdvanced, type DispatchWindowDTO, type DeliverySlotDTO } from "@effy/shared-types"
import { PackageStatusPill } from "@effy/web-kit/console"
import { Panel, Meter, StatusWord } from "@effy/web-kit/patterns"
import { slotGridQuery } from "@/features/delivery/queries"
import { dispatchWindowsQuery } from "@/features/dispatch/queries"
import { ampm, at12, hhmm } from "./overviewFormat"

export function TodaysWindows() {
  const grid = useQuery(slotGridQuery())
  const windows = useQuery(dispatchWindowsQuery(null))

  const slots = (grid.data?.items ?? []).filter((s) => s.status === "active")
  const byKey = new Map<string, DispatchWindowDTO>()
  for (const w of windows.data?.windows ?? []) {
    byKey.set(w.anyTime ? "any" : `${hhmm.format(new Date(w.windowStart))}-${hhmm.format(new Date(w.windowEnd))}`, w)
  }
  const keyOf = (s: DeliverySlotDTO) => (s.anyTime ? "any" : `${s.startTime.slice(0, 5)}-${s.endTime.slice(0, 5)}`)

  return (
    <Panel
      title="Today's delivery windows"
      description="Booked against each window's limit, what is at the hub, and who has the round."
      actions={
        <Button variant="ghost" size="sm" asChild>
          <Link to="/orders/assignments">
            All of today
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      }
      flush
    >
      <div className="ef-table-scroll">
        <table className="ef-table ef-rtable ef-table--plain">
          <thead>
            <tr>
              <th>Window</th>
              <th>Booked</th>
              <th className="is-num">At the hub</th>
              <th>Round</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {grid.isPending ? (
              [0, 1, 2].map((i) => (
                <tr key={i}>
                  <td colSpan={5}>
                    <Skeleton className="h-6" />
                  </td>
                </tr>
              ))
            ) : slots.length === 0 ? (
              <tr>
                <td colSpan={5} className="is-muted">
                  No delivery windows are set up. Add them under Delivery › Delivery windows.
                </td>
              </tr>
            ) : (
              slots.map((s) => {
                const w = byKey.get(keyOf(s))
                const atHub = w?.parcels.filter((p) => p.status.status === "at_hub").length ?? 0
                const round = w?.rounds[0]
                const state = w ? leastAdvanced(w.parcels.map((p) => p.status)) : null
                const full = s.capacity !== null && s.bookedToday >= s.capacity
                const pct = s.capacity ? (s.bookedToday / s.capacity) * 100 : 0
                return (
                  <tr key={s.id}>
                    <td data-m="primary">
                      <span className="ef-code font-medium">
                        {s.startTime.slice(0, 5)} – {s.endTime.slice(0, 5)}
                      </span>
                      {s.anyTime ? (
                        <Badge variant="outline" className="ml-2">
                          Any time
                        </Badge>
                      ) : null}
                      <span className="ef-sub">Order by {ampm(s.cutoffTime)}</span>
                    </td>
                    <td data-m="full" className="min-w-45">
                      <Meter
                        booked={pct}
                        label={`${s.bookedToday} booked`}
                        limit={s.capacity === null ? "no limit" : `limit ${s.capacity}`}
                      />
                    </td>
                    <td data-m="meta" data-label="At the hub" className="is-num">
                      {atHub}
                    </td>
                    <td data-m="meta" data-label="Round">
                      {round ? (
                        <>
                          {round.driver.name}
                          {w && w.rounds.length > 1 ? ` +${w.rounds.length - 1}` : ""}
                          {round.opensAt ? <span className="ef-sub">Opens {at12(round.opensAt)}</span> : null}
                        </>
                      ) : (
                        <span className="text-muted-foreground">No round yet</span>
                      )}
                    </td>
                    <td data-m="badge">
                      {state ? (
                        <PackageStatusPill view={state} showDetail={false} icons />
                      ) : full ? (
                        <StatusWord tone="waiting" icon={CircleSlash}>
                          Full
                        </StatusWord>
                      ) : (
                        <StatusWord tone="muted" icon={Clock}>
                          Open
                        </StatusWord>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
