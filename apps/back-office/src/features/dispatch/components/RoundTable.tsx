import { useState } from "react"

import { Link } from "@tanstack/react-router"
import { Clock, Truck } from "lucide-react"

import type { DispatchRoundSummaryDTO } from "@effy/shared-types"

import { Panel, StatusWord } from "@effy/web-kit/patterns"
import { initialsOf } from "@/components/shell/identity"

import { momentText, roundLabel, roundOpenState } from "../model"

export function RoundTable({ rounds }: { rounds: DispatchRoundSummaryDTO[] }) {
  const [kind, setKind] = useState<"all" | "collection" | "delivery">("all")
  const shown = rounds.filter((r) => kind === "all" || r.round.kind === kind)
  const now = new Date()

  return (
    <Panel
      title={
        <>
          Rounds <span className="font-normal text-muted-foreground">· {rounds.length} held today</span>
        </>
      }
      icon={<Truck aria-hidden="true" />}
      description="Collection runs bring parcels from shops to the hub; delivery rounds take them to customers."
      actions={
        <div className="ef-seg" role="group" aria-label="Work">
          {(["all", "collection", "delivery"] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={kind === k ? "is-active" : undefined}
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
            >
              {k === "all" ? "All" : k === "collection" ? "Collection" : "Delivery"}
            </button>
          ))}
        </div>
      }
      flush
    >
      {shown.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">No driver is holding a round.</p>
      ) : (
        <div className="ef-table-scroll">
          <table className="ef-table ef-rtable ef-table--plain">
            <thead>
              <tr>
                <th>Driver</th>
                <th>Work</th>
                <th>Progress</th>
                <th className="is-num">Packages left</th>
                <th>Opens</th>
                <th>Due</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const total = r.round.stops?.length ?? 0
                const done = Math.max(0, total - Number(r.stopsRemaining))
                const pct = total > 0 ? Math.round((done / total) * 100) : 0
                const open = roundOpenState(r.round, now)
                return (
                  <tr key={r.round.id}>
                    <td data-m="primary">
                      <div className="flex items-center gap-2">
                        <span className="avatar avatar--sq" aria-hidden="true">
                          {initialsOf(r.driverName)}
                        </span>
                        <Link
                          to="/orders/assignments/rounds/$roundId"
                          params={{ roundId: r.round.id }}
                          className="link"
                        >
                          {r.driverName}
                        </Link>
                      </div>
                    </td>
                    <td data-m="meta">{roundLabel(r.round.kind)}</td>
                    <td data-m="full" className="min-w-40">
                      {total > 0 ? (
                        <>
                          <div className="ef-progress-label">
                            <span>
                              {done} of {total} stops
                            </span>
                            <span>{pct}%</span>
                          </div>
                          <div className="ef-meter">
                            <i className="ef-meter__booked" style={{ width: `${pct}%` }} />
                          </div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">{r.stopsRemaining} stops left</span>
                      )}
                    </td>
                    <td data-m="meta" data-label="Packages left" className="is-num">
                      {r.packagesRemaining}
                    </td>
                    <td data-m="meta" data-label="Opens">
                      {open.text || "—"}
                    </td>
                    <td data-m="hide" className="whitespace-nowrap">
                      {momentText(r.round.deadlineAt, now)}
                    </td>
                    <td data-m="badge">
                      <span className="flex flex-wrap items-center gap-2">
                        <StatusWord
                          tone={
                            r.round.status === "completed"
                              ? "done"
                              : r.round.status === "cancelled"
                                ? "quiet"
                                : "moving"
                          }
                        >
                          {r.stageLabel ?? r.round.status.replace("_", " ")}
                        </StatusWord>
                        {r.isLate ? (
                          <span className="late">
                            <Clock aria-hidden="true" />
                            Late
                          </span>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}
