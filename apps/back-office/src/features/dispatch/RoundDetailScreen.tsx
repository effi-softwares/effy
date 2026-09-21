import { useQuery } from "@tanstack/react-query";

import { dispatchRoundQuery } from "./queries";

interface RoundDetail {
  id: string;
  kind: string;
  status: string;
  driverId: string;
  lockedBy: string | null;
  updatedAt: string;
  stops: Array<{
    stopId: string;
    seq: number | null;
    kind: string;
    status: string;
    zoneName: string | null;
    label: string;
    orderNumber: string | null;
  }>;
}

/**
 * One round: its stops, their order, and who holds it (FR-027, FR-031, FR-032).
 *
 * ⚠ A LIST OF DETAIL ROWS, NOT CARDS (Principle V). The stops are a sequence — the dispatcher reads
 * them in order and moves one — which is exactly what a card grid destroys.
 */
export function RoundDetailScreen({ roundId }: { roundId: string }) {
  const { data, isPending, isError } = useQuery(dispatchRoundQuery(roundId));

  if (isPending) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (isError) return <p className="p-6 text-sm text-destructive">That round could not be loaded.</p>;

  const round = data as RoundDetail;

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-lg font-medium">
          {round.kind === "collection" ? "Collection round" : "Same-day delivery round"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {round.status.replace("_", " ")}
          {round.lockedBy ? " · locked by a person, the planner will leave it alone" : ""}
        </p>
      </header>

      <section aria-labelledby="stops-heading">
        <h2 id="stops-heading" className="text-base font-medium">
          Stops
        </h2>
        <ol className="mt-3 divide-y divide-border">
          {round.stops.map((s, i) => (
            <li key={s.stopId} className="flex items-baseline justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                  {s.label}
                </p>
                {s.orderNumber ? (
                  <p className="mt-0.5 text-sm text-muted-foreground">{s.orderNumber}</p>
                ) : null}
              </div>
              <div className="shrink-0 text-right text-sm text-muted-foreground">
                <p>{s.zoneName ?? "No zone"}</p>
                <p>{s.status}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
