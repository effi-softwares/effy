import { useQuery } from "@tanstack/react-query";

import { RoundTable } from "./components/RoundTable";
import { UnassignedPanel } from "./components/UnassignedPanel";
import { dispatchDayQuery } from "./queries";

/**
 * The dispatcher's day (063, US4 — FR-027/FR-028, SC-008).
 *
 * ⚠ THE PAGE IS ORDERED BY WHAT NEEDS DOING, NOT BY WHAT EXISTS. "Needs attention" is first; the
 * rounds proceeding normally are below it. D15's manage-by-exception is the whole design premise:
 * the engine earns its place by making the common case automatic and the exceptional case VISIBLE.
 *
 * ⚠ NO METRIC CARDS AT THE TOP (Principle V). The counts that matter are said in words inside the
 * section they describe, so a dispatcher reads one thing and acts, rather than scanning a row of
 * tiles that each need a second look to interpret.
 */
export function DispatchDayScreen() {
  const { data, isPending, isError, refetch } = useQuery(dispatchDayQuery());

  if (isPending) {
    return <p className="p-6 text-sm text-muted-foreground">Loading today's work…</p>;
  }

  if (isError) {
    // ⚠ "We could not ask" must never look like "nothing is stuck" — an empty screen would tell a
    // dispatcher the opposite of the truth.
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">Today's work could not be loaded.</p>
        <button type="button" onClick={() => void refetch()} className="mt-2 text-sm underline">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-lg font-medium">Dispatch</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What the planner decided today, and anything it could not place.
        </p>
      </header>

      <UnassignedPanel items={data.unassigned} />

      <section aria-labelledby="rounds-heading">
        <h2 id="rounds-heading" className="text-base font-medium">
          Rounds today
        </h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-border">
          <RoundTable rounds={data.rounds} />
        </div>
      </section>

      <section aria-labelledby="waves-heading">
        <h2 id="waves-heading" className="text-base font-medium">
          Planning passes
        </h2>
        {/* ⚠ FR-006 — what ran and what it decided. Without this, "why did nobody get this package?"
            is unanswerable an hour later. */}
        <ul className="mt-3 divide-y divide-border text-sm">
          {data.waves.length === 0 ? (
            <li className="py-3 text-muted-foreground">No planning pass has run yet today.</li>
          ) : (
            data.waves.map((w) => (
              <li key={w.id} className="flex items-baseline justify-between gap-4 py-2">
                <span>
                  {w.kind === "collection" ? "Collection" : "Same-day delivery"}
                  <span className="ml-2 text-muted-foreground">
                    {new Date(w.startedAt).toLocaleTimeString("en-AU", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Australia/Melbourne",
                    })}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  {w.packagesAssigned} of {w.packagesConsidered} placed
                  {w.packagesUnassigned > 0 ? ` · ${w.packagesUnassigned} not placed` : ""}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
