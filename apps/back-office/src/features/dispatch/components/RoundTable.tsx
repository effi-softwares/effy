import { Link } from "@tanstack/react-router";

import type { DispatchRoundSummaryDTO } from "@effy/shared-types";

import { roundLabel } from "../model";

/**
 * Every round today, who holds it, and how much is left (FR-027).
 *
 * ⚠ A TABLE, NOT CARDS (Principle V). Rounds are rows with the same columns; a dispatcher compares
 * them down a column — who is late, who has most left — which a card grid makes impossible.
 */
export function RoundTable({ rounds }: { rounds: DispatchRoundSummaryDTO[] }) {
  if (rounds.length === 0) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        No rounds have been planned today.
      </p>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead className="bg-muted text-left text-muted-foreground">
        <tr>
          <th scope="col" className="px-3 py-2 font-medium">Driver</th>
          <th scope="col" className="px-3 py-2 font-medium">Work</th>
          <th scope="col" className="px-3 py-2 font-medium">Stops left</th>
          <th scope="col" className="px-3 py-2 font-medium">Packages left</th>
          <th scope="col" className="px-3 py-2 font-medium">Due</th>
          <th scope="col" className="px-3 py-2 font-medium">State</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rounds.map((r) => (
          <tr key={r.round.id}>
            <td className="px-3 py-2">
              <Link to="/dispatch/rounds/$roundId" params={{ roundId: r.round.id }} className="underline">
                {r.driverName}
              </Link>
            </td>
            <td className="px-3 py-2">{roundLabel(r.round.kind)}</td>
            <td className="px-3 py-2">{r.stopsRemaining}</td>
            <td className="px-3 py-2">{r.packagesRemaining}</td>
            <td className="px-3 py-2">
              {new Date(r.round.deadlineAt).toLocaleTimeString("en-AU", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Australia/Melbourne",
              })}
            </td>
            <td className="px-3 py-2">
              {/* ⚠ Late is DERIVED on read, never stored — a stored flag is wrong every minute
                  nothing writes to it (027's counted-not-stored rule). */}
              {r.isLate ? (
                <span className="text-destructive">Late</span>
              ) : r.round.lockedBy ? (
                <span className="text-muted-foreground">Locked by a person</span>
              ) : (
                <span className="text-muted-foreground">{r.round.status.replace("_", " ")}</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
