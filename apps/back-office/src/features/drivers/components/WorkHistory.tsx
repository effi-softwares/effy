import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { Button } from "@effy/design-system/ui";

import { formatDate, formatDateTime, RUN_TYPE_LABEL } from "../model";
import { driverHistoryQuery, runDetailQuery } from "../queries";
import { ProofViewer } from "./ProofViewer";

/**
 * A driver's work record (US5, FR-039…FR-043).
 *
 * ⚠ COUNTS, NEVER CURRENCY (FR-049). This is what makes the profile a record of EMPLOYMENT rather
 * than a contact card, and it is the only way to answer a customer who says a delivery never
 * arrived — but it is deliberately not a timesheet and must never be presented as one. The driver
 * domain has never carried money and back-office does not introduce it here.
 *
 * ⚠ A LIST, and the period counts are a SENTENCE — not five metric tiles (Principle V).
 */
export function WorkHistory({ driverId }: { driverId: string }) {
  const { data, isPending } = useQuery(driverHistoryQuery(driverId));
  const [openRun, setOpenRun] = useState<string | null>(null);

  if (isPending) return <p className="text-sm text-muted-foreground">Loading work history…</p>;
  if (!data) return null;

  const s = data.summary;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Between {formatDate(s.from)} and {formatDate(s.to)}: worked on{" "}
        <span className="font-medium tabular-nums text-foreground">{s.daysWorked}</span>{" "}
        {s.daysWorked === 1 ? "day" : "days"}, completed{" "}
        <span className="font-medium tabular-nums text-foreground">{s.runsCompleted}</span>{" "}
        {s.runsCompleted === 1 ? "round" : "rounds"}, picked up{" "}
        <span className="font-medium tabular-nums text-foreground">{s.packagesCollected}</span>{" "}
        {s.packagesCollected === 1 ? "package" : "packages"}, delivered{" "}
        <span className="font-medium tabular-nums text-foreground">{s.dropsDelivered}</span>
        {s.dropsFailed > 0 ? (
          <>
            , and could not deliver{" "}
            <span className="font-medium tabular-nums text-foreground">{s.dropsFailed}</span>
          </>
        ) : null}
        .
      </p>

      {data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This driver has not been assigned any work yet. Rounds appear here once the assignment
          round gives them one.
        </p>
      ) : (
        <ul className="divide-y border-y">
          {data.items.map((run) => (
            <li key={run.runId} className="space-y-2 py-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                <span className="tabular-nums font-medium">{formatDate(run.businessDate)}</span>
                <span>{RUN_TYPE_LABEL[run.type] ?? run.type}</span>
                <span className="tabular-nums text-muted-foreground">
                  {run.completedStops} of {run.totalStops} stops
                </span>
                <span className="text-muted-foreground">{run.status}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setOpenRun(openRun === run.runId ? null : run.runId)}
                >
                  {openRun === run.runId ? "Hide" : "Open"}
                </Button>
              </div>
              {openRun === run.runId ? <RunDetail runId={run.runId} /> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RunDetail({ runId }: { runId: string }) {
  const { data, isPending } = useQuery(runDetailQuery(runId));
  const [openProof, setOpenProof] = useState<string | null>(null);

  if (isPending) return <p className="text-sm text-muted-foreground">Loading stops…</p>;
  if (!data) return null;

  if (data.stops.length === 0) {
    return <p className="text-sm text-muted-foreground">This round has no stops recorded.</p>;
  }

  return (
    <ol className="space-y-2 border-l pl-4">
      {data.stops.map((stop) => (
        <li key={stop.taskId} className="space-y-1 text-sm">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="tabular-nums text-muted-foreground">{stop.sequence + 1}.</span>
            <span className="font-medium">{stop.label}</span>
            <span className="text-muted-foreground">{stop.status}</span>
            {stop.orderReference ? (
              <span className="font-mono text-muted-foreground">{stop.orderReference}</span>
            ) : null}
            {stop.hasProof ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setOpenProof(openProof === stop.taskId ? null : stop.taskId)}
              >
                {openProof === stop.taskId ? "Hide proof" : "View proof"}
              </Button>
            ) : null}
          </div>
          {stop.timeline.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {stop.timeline.map((t) => `${t.status} ${formatDateTime(t.at)}`).join(" → ")}
            </p>
          ) : null}
          {openProof === stop.taskId ? <ProofViewer deliveryTaskId={stop.taskId} /> : null}
        </li>
      ))}
    </ol>
  );
}
