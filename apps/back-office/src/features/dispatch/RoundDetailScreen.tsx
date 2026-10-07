import { useQuery } from "@tanstack/react-query";

import { useSessionRoles } from "@/features/auth/useSessionRoles";

import { canDispatch } from "./access";
import { ReassignDialog } from "./components/ReassignDialog";
import { ReorderControl } from "./components/ReorderControl";
import type { DeliveryWindow } from "@effy/shared-types";

import { WINDOW_STATE_LABEL, momentText, roundOpenState, windowNoteFor } from "./model";
import { dispatchDayQuery, dispatchRoundQuery } from "./queries";

interface RoundDetail {
  id: string;
  kind: string;
  status: string;
  driverId: string;
  updatedAt: string;
  /** 072 — when the round must be finished. */
  deadlineAt: string;
  /** 072 — when it opens to its driver; null = no opening time (a delivery with no window). */
  opensAt: string | null;
  stops: Array<{
    stopId: string;
    seq: number | null;
    kind: string;
    status: string;
    zoneName: string | null;
    label: string;
    orderNumber: string | null;
    /** 069 — the customer's delivery window; null for a pickup, the hub, or an order before 069. */
    deliveryWindow?: DeliveryWindow | null;
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
  // The day view already carries every driver and their name — reusing its cache entry avoids a
  // second endpoint whose only job would be "list drivers for a picker".
  const day = useQuery(dispatchDayQuery());
  const roles = useSessionRoles();

  if (isPending) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (isError) return <p className="p-6 text-sm text-destructive">That round could not be loaded.</p>;

  const round = data as RoundDetail;
  // ⚠ ABSENT, NOT DISABLED. A csa never sees a control it cannot use — and this is a COURTESY: the
  // gate that decides is in edge-fleet, per route, and is independently enforced.
  const mayChange = canDispatch(roles);
  const drivers = (day.data?.rounds ?? []).map((r) => ({ driverId: r.driverId, driverName: r.driverName }));
  const holder = drivers.find((d) => d.driverId === round.driverId)?.driverName ?? "This driver";
  const now = new Date();
  const opening = roundOpenState(round, now);

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-lg font-medium">
          {round.kind === "collection" ? "Collection round" : "Same-day delivery round"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {round.status.replace("_", " ")}
        </p>
        {/* 072 — a round is assigned hours before it can be worked. Its driver can read it and
            cannot act on it until it opens; every control below works either way. */}
        {opening.text ? (
          <p className="mt-1 text-sm tabular-nums">
            {opening.text}
            <span className="ml-2 text-muted-foreground">· due {momentText(round.deadlineAt, now)}</span>
            {opening.open ? null : (
              <span className="ml-2 text-muted-foreground">· the driver can see it but cannot start it yet</span>
            )}
          </p>
        ) : null}

        {mayChange ? (
          <div className="mt-4 flex flex-wrap items-start gap-3">
            <ReassignDialog
              roundId={round.id}
              currentDriverName={holder}
              expectedUpdatedAt={round.updatedAt}
              drivers={drivers.filter((d) => d.driverId !== round.driverId)}
            />
          </div>
        ) : null}
      </header>

      <section aria-labelledby="stops-heading">
        <h2 id="stops-heading" className="text-base font-medium">
          Stops
        </h2>

        {mayChange ? (
          <div className="mt-3 rounded-lg border border-border p-3">
            <ReorderControl
              roundId={round.id}
              stopIds={round.stops.map((s) => s.stopId)}
              expectedUpdatedAt={round.updatedAt}
            />
          </div>
        ) : null}
        <ol className="mt-3 divide-y divide-border">
          {round.stops.map((s, i) => {
            // 069 — the window the customer was sold. The stops arrive already ordered earliest
            // window first, by the same shared rule the driver's app uses.
            const note = windowNoteFor(s, new Date());
            return (
            <li key={s.stopId} className="flex items-baseline justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                  {s.label}
                </p>
                {s.orderNumber ? (
                  <p className="mt-0.5 text-sm text-muted-foreground">{s.orderNumber}</p>
                ) : null}
                {note ? (
                  <p className="mt-0.5 text-sm tabular-nums">
                    {note.text}
                    {/* ⚠ A WORD, never colour alone. */}
                    {WINDOW_STATE_LABEL[note.state] ? (
                      <span className={note.state === "late" ? "ml-2 text-destructive" : "ml-2 text-warning"}>
                        {WINDOW_STATE_LABEL[note.state]}
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </div>
              <div className="shrink-0 text-right text-sm text-muted-foreground">
                <p>{s.zoneName ?? "No zone"}</p>
                <p>{s.status}</p>
              </div>
            </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
