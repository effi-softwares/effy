import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Clock, Route, Snowflake } from "lucide-react";

import type { DispatchWindowDTO } from "@effy/shared-types";
import { Badge, Skeleton } from "@effy/design-system/ui";
import { PackageStatusPill } from "@effy/web-kit/console";

import { Panel } from "@effy/web-kit/patterns";

import { dispatchWindowsQuery } from "../queries";

/** The round line under a window: who has it, or what will happen. */
export function roundLine(w: DispatchWindowDTO, isToday: boolean): string {
  if (w.rounds.length === 0) return isToday ? "No round yet — auto-assign plans it as parcels reach the hub" : "Planned on the day";
  return w.rounds.map((r) => `${r.driver.name} (${r.parcels})`).join(", ");
}

/**
 * Delivery windows by day (082; redesign, board "Dispatch — today", Delivery windows tab): every day
 * on sale, each window's parcels, and the round that carries them.
 */
export function WindowsByDay() {
  const [date, setDate] = useState<string | null>(null);
  const { data, isPending, isError } = useQuery(dispatchWindowsQuery(date));

  return (
    <Panel
      title={<span id="windows-heading">Delivery windows</span>}
      icon={<CalendarClock aria-hidden="true" />}
      description="Parcels booked into each window, and the round that carries them."
      actions={
        data ? (
          <div className="bo-seg max-w-full overflow-x-auto" role="group" aria-label="Day">
            {data.days.map((d) => (
              <button
                key={d.date}
                type="button"
                aria-pressed={d.date === data.date}
                className={d.date === data.date ? "is-active" : undefined}
                onClick={() => setDate(d.isToday ? null : d.date)}
              >
                {d.label}
              </button>
            ))}
          </div>
        ) : undefined
      }
      flush
    >
      {isError ? (
        <p className="px-5 py-4 text-sm font-medium" role="alert">
          The delivery windows could not be loaded.
        </p>
      ) : isPending ? (
        <div className="space-y-3 px-5 py-4" aria-busy="true">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-24" />
        </div>
      ) : data.windows.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">No deliveries are booked for this day yet.</p>
      ) : (
        <div className="divide-y divide-border">
          {data.windows.map((w) => {
            const isToday = data.days.find((d) => d.date === data.date)?.isToday ?? false;
            const delivered = w.parcels.filter((p) => p.status.status === "delivered").length;
            const moving = w.parcels.filter((p) => ["with_driver", "at_hub", "out_for_delivery"].includes(p.status.status)).length;
            const n = w.parcels.length || 1;
            const summary = `${w.parcels.length} ${w.parcels.length === 1 ? "parcel" : "parcels"} · ${roundLine(w, isToday)}`;
            return (
              <div key={w.windowStart} className="space-y-3 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="bo-code text-sm font-semibold">{w.label}</span>
                    {w.anyTime ? <Badge variant="outline">Any time</Badge> : null}
                    <span className="text-sm text-muted-foreground">
                      {w.parcels.length} {w.parcels.length === 1 ? "parcel" : "parcels"}
                    </span>
                  </div>
                  <div className="flex min-w-[220px] items-center gap-3">
                    <div className="bo-meter flex-1" role="img" aria-label={`${delivered} delivered, ${moving} on the way, of ${w.parcels.length}`}>
                      <i className="bo-meter__done" style={{ width: `${(delivered / n) * 100}%` }} />
                      <i className="bo-meter__booked" style={{ width: `${(moving / n) * 100}%` }} />
                    </div>
                    <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{delivered} delivered</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Route aria-hidden="true" className="size-3.5 text-muted-foreground" />
                  <span>{roundLine(w, isToday)}</span>
                </div>
                {w.parcels.length > 0 ? (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="bo-table bo-rtable bo-table--compact bo-table--plain" aria-label={w.label}>
                      <caption className="sr-only">{summary}</caption>
                      <tbody>
                        {w.parcels.map((p) => (
                          <tr key={p.packageId}>
                            <td data-m="primary" className="w-40">
                              <span className="bo-code font-medium">{p.orderNumber}</span>
                            </td>
                            <td data-m="badge">
                              <PackageStatusPill view={p.status} icons />
                            </td>
                            <td data-m="meta" className="is-muted">
                              {p.group ?? "No area"}
                            </td>
                            <td data-m="meta">
                              <span className="flex flex-wrap gap-2">
                                {p.collectLate ? (
                                  <span className="bo-late">
                                    <Clock aria-hidden="true" />
                                    Late for its run
                                  </span>
                                ) : null}
                                {p.coldOvernight ? (
                                  <span className="bo-tag">
                                    <Snowflake aria-hidden="true" />
                                    Needs cold storage
                                  </span>
                                ) : null}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
