import { useState } from "react";

import { Link } from "@tanstack/react-router";
import { Clock, Truck } from "lucide-react";

import type { DispatchRoundSummaryDTO } from "@effy/shared-types";

import { Panel } from "@/components/patterns/Panel";
import { StatusWord } from "@/components/patterns/StatusWord";
import { initialsOf } from "@/components/shell/identity";

import { momentText, roundLabel, roundOpenState } from "../model";

/**
 * Today's rounds (redesign, board "Dispatch — today", Rounds tab): who holds which run, how far
 * through it they are, when it opens and when it is due.
 *
 * ⚠ Late is DERIVED on read, never stored — a stored flag is wrong every minute nothing writes to it.
 */
export function RoundTable({ rounds }: { rounds: DispatchRoundSummaryDTO[] }) {
  const [kind, setKind] = useState<"all" | "collection" | "delivery">("all");
  const shown = rounds.filter((r) => kind === "all" || r.round.kind === kind);
  const now = new Date();

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
        <div className="bo-seg" role="group" aria-label="Work">
          {(["all", "collection", "delivery"] as const).map((k) => (
            <button key={k} type="button" className={kind === k ? "is-active" : undefined} aria-pressed={kind === k} onClick={() => setKind(k)}>
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
        <div className="bo-table-scroll">
          <table className="bo-table bo-rtable bo-table--plain">
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
                const total = r.round.stops?.length ?? 0;
                const done = Math.max(0, total - Number(r.stopsRemaining));
                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                const open = roundOpenState(r.round, now);
                return (
                  <tr key={r.round.id}>
                    <td data-m="primary">
                      <div className="flex items-center gap-2">
                        <span className="bo-avatar bo-avatar--sq" aria-hidden="true">
                          {initialsOf(r.driverName)}
                        </span>
                        <Link to="/orders/assignments/rounds/$roundId" params={{ roundId: r.round.id }} className="bo-link">
                          {r.driverName}
                        </Link>
                      </div>
                    </td>
                    <td data-m="meta">{roundLabel(r.round.kind)}</td>
                    <td data-m="full" className="min-w-[160px]">
                      {total > 0 ? (
                        <>
                          <div className="bo-progress-label">
                            <span>
                              {done} of {total} stops
                            </span>
                            <span>{pct}%</span>
                          </div>
                          <div className="bo-meter">
                            <i className="bo-meter__booked" style={{ width: `${pct}%` }} />
                          </div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">{r.stopsRemaining} stops left</span>
                      )}
                    </td>
                    <td data-m="meta" data-label="Packages left" className="is-num">
                      {r.packagesRemaining}
                    </td>
                    {/* ⚠ Words, never colour: "Open" and "Opens 1:15 pm" differ by text. */}
                    <td data-m="meta" data-label="Opens">
                      {open.text || "—"}
                    </td>
                    {/* The day is said when it is not today — a round can be for tomorrow's run now. */}
                    <td data-m="hide" className="whitespace-nowrap">
                      {momentText(r.round.deadlineAt, now)}
                    </td>
                    <td data-m="badge">
                      <span className="flex flex-wrap items-center gap-2">
                        {/* 093 — where the run is, in the words the driver's app uses ("Out 4 of 9"). */}
                        <StatusWord tone={r.round.status === "completed" ? "done" : r.round.status === "cancelled" ? "quiet" : "moving"}>
                          {r.stageLabel ?? r.round.status.replace("_", " ")}
                        </StatusWord>
                        {r.isLate ? (
                          <span className="bo-late">
                            <Clock aria-hidden="true" />
                            Late
                          </span>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
