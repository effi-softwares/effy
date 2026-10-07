import { Link } from "@tanstack/react-router";

import type { DispatchRoundSummaryDTO } from "@effy/shared-types";

import { momentText, roundLabel, roundOpenState } from "../model";

/**
 * Every round a driver holds, who holds it, when it opens and how much is left (FR-027, 072).
 *
 * ⚠ 072 — "TODAY" IS NO LONGER THE RIGHT WORD. Work is assigned the moment a driver can take it, so
 * this lists every unfinished round — this afternoon's, this evening's, tomorrow morning's — and
 * says which of them have opened. A round that has not opened and has nothing collected is not
 * behind; it cannot have started.
 *
 * ⚠ A TABLE, NOT CARDS (Principle V). Rounds are rows with the same columns; a dispatcher compares
 * them down a column — who is late, who has most left — which a card grid makes impossible.
 */
export function RoundTable({ rounds }: { rounds: DispatchRoundSummaryDTO[] }) {
  if (rounds.length === 0) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        No driver is holding a round.
      </p>
    );
  }

  const now = new Date();
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted text-left text-muted-foreground">
        <tr>
          <th scope="col" className="px-3 py-2 font-medium">Driver</th>
          <th scope="col" className="px-3 py-2 font-medium">Work</th>
          <th scope="col" className="px-3 py-2 font-medium">Stops left</th>
          <th scope="col" className="px-3 py-2 font-medium">Packages left</th>
          <th scope="col" className="px-3 py-2 font-medium">Opens</th>
          <th scope="col" className="px-3 py-2 font-medium">Due</th>
          <th scope="col" className="px-3 py-2 font-medium">State</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rounds.map((r) => (
          <tr key={r.round.id}>
            <td className="px-3 py-2">
              <Link to="/orders/assignments/rounds/$roundId" params={{ roundId: r.round.id }} className="underline">
                {r.driverName}
              </Link>
            </td>
            <td className="px-3 py-2">{roundLabel(r.round.kind)}</td>
            <td className="px-3 py-2">{r.stopsRemaining}</td>
            <td className="px-3 py-2">{r.packagesRemaining}</td>
            {/* ⚠ Words, never colour: "Open" and "Opens 1:15 pm" differ by text. */}
            <td className="px-3 py-2 tabular-nums">{roundOpenState(r.round, now).text}</td>
            {/* The day is said when it is not today — a round can be for tomorrow's run now. */}
            <td className="px-3 py-2 tabular-nums">{momentText(r.round.deadlineAt, now)}</td>
            <td className="px-3 py-2">
              {/* ⚠ Late is DERIVED on read, never stored — a stored flag is wrong every minute
                  nothing writes to it (027's counted-not-stored rule). */}
              {r.isLate ? (
                <span className="text-destructive">Late</span>

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
