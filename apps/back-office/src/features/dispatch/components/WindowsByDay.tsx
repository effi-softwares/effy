import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

import type { DispatchWindowDTO } from "@effy/shared-types";
import { PackageStatusPill } from "@effy/web-kit/console";

import { dispatchWindowsQuery } from "../queries";

/** Who has a window's round — or that there is none yet, and why that is not a problem. */
export function roundLine(w: DispatchWindowDTO, isToday: boolean): string {
  if (w.rounds.length === 0) return isToday ? "No round yet — auto-assign plans it as parcels reach the hub" : "Planned on the day";
  return w.rounds.map((r) => `${r.driver.name} (${r.parcels})`).join(", ");
}

/**
 * Delivery windows by day (082) — today, or any later day with windows on sale.
 *
 * ⚠ A LATER DAY'S WINDOW HAS NO DRIVER, AND SAYS "Planned on the day". A delivery round is planned on
 * its own day; until then this shows the LOAD — which parcels, and where each is — so a dispatcher
 * sees tomorrow today. A parcel waiting at the hub for a later day is waiting, not unassigned.
 *
 * ⚠ Day buttons and a table per window; no cards and no totals strip (Principle V). The two things
 * worth a second look are said in words on the row: "Late for its run", "Needs cold storage".
 */
export function WindowsByDay() {
  const [date, setDate] = useState<string | null>(null);
  const { data, isPending, isError } = useQuery(dispatchWindowsQuery(date));

  return (
    <section aria-labelledby="windows-heading" className="space-y-3">
      <h2 id="windows-heading" className="text-base font-medium">Delivery windows</h2>

      {isError ? (
        <p className="text-sm text-destructive" role="alert">The delivery windows could not be loaded.</p>
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Loading windows…</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Day">
            {data.days.map((d) => (
              <button
                key={d.date}
                type="button"
                aria-pressed={d.date === data.date}
                onClick={() => setDate(d.isToday ? null : d.date)}
                className={`rounded-md border px-3 py-1.5 text-sm ${d.date === data.date ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}
              >
                {d.label}
              </button>
            ))}
          </div>

          {data.windows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No deliveries are booked for this day yet.</p>
          ) : (
            data.windows.map((w) => {
              const isToday = data.days.find((d) => d.date === data.date)?.isToday ?? false;
              return (
                <div key={w.windowStart} className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm" aria-label={w.label}>
                    <caption className="border-b px-3 py-2 text-left">
                      <span className="font-medium">{w.label}</span>
                      <span className="text-muted-foreground"> · {w.parcels.length} {w.parcels.length === 1 ? "parcel" : "parcels"} · {roundLine(w, isToday)}</span>
                    </caption>
                    <tbody className="divide-y">
                      {w.parcels.map((p) => (
                        <tr key={p.packageId}>
                          <td className="w-40 px-3 py-2 font-medium">{p.orderNumber}</td>
                          <td className="px-3 py-2"><PackageStatusPill view={p.status} /></td>
                          <td className="px-3 py-2 text-muted-foreground">{p.group ?? "No area"}</td>
                          <td className="px-3 py-2">
                            {p.collectLate ? <span className="font-medium">Late for its run</span> : null}
                            {p.collectLate && p.coldOvernight ? " · " : null}
                            {p.coldOvernight ? <span className="font-medium">Needs cold storage</span> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })
          )}
        </>
      )}
    </section>
  );
}
