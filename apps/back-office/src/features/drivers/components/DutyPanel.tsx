import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Button } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { useSessionRoles } from "@/features/auth/useSessionRoles";

import { StrandedWorkPanel } from "./StrandedWorkPanel";
import { canManageDrivers } from "../access";
import { driverActionError } from "../errorText";
import { durationSince, RUN_TYPE_LABEL } from "../model";
import { dutyQuery, useEndDutySession } from "../queries";
import { useState } from "react";

/**
 * Who is working right now (US4, FR-034…FR-037).
 *
 * ⚠ WHY THIS PANEL EXISTS. Assignment on this platform is automatic and driverless by design — 049
 * settled "no dispatcher, no accept/decline", and that is the right model for a small fleet. But a
 * system that decides on its own is only safe if a human can OBSERVE what it decided. Before this,
 * nobody at Effy could see whether a single driver was on duty, and the only symptom of "nobody is
 * working" was orders quietly not moving.
 *
 * ⚠ A LIST AND A SENTENCE, NOT METRIC TILES (Principle V). "3 on duty / 12 waiting / 1 overdue" as
 * three cards is the obvious design and the constitution forbids it — and the sentence below is more
 * useful anyway, because it says what the numbers MEAN together.
 */
export function DutyPanel() {
  const roles = useSessionRoles();
  const canManage = canManageDrivers(roles);
  const [error, setError] = useState<string | null>(null);

  const { data, error: queryError, isPending, isError, refetch } = useQuery(dutyQuery());
  const endSession = useEndDutySession();

  if (isError) return <ErrorState error={queryError} onRetry={() => void refetch()} />;
  if (isPending) return <p className="text-sm text-muted-foreground">Loading duty…</p>;

  const waiting = data.unassigned.readyToCollect + data.unassigned.readyToDeliver;

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold">On duty now</h2>

      {/* ⚠ THE SENTENCE THAT ANSWERS "WHY IS NOTHING MOVING?". With nobody on duty, an empty list
          reads as "nothing to see" — it is the waiting count beside it that turns silence into a
          cause. FR-036 exists because that state was invisible. */}
      {waiting > 0 && data.unassigned.driversOnDuty === 0 ? (
        <p className="border-l-2 border-destructive py-1 pl-3 text-sm">
          <span className="font-semibold">Nobody is on duty</span>, and{" "}
          <span className="font-semibold tabular-nums">{waiting}</span>{" "}
          {waiting === 1 ? "package is" : "packages are"} waiting for a driver. Nothing will move
          until someone goes on duty in the driver app.
        </p>
      ) : waiting > 0 ? (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium tabular-nums text-foreground">{waiting}</span>{" "}
          {waiting === 1 ? "package is" : "packages are"} waiting to be picked up on the next
          assignment round
          {data.unassigned.readyToDeliver > 0
            ? ` (${data.unassigned.readyToCollect} to collect, ${data.unassigned.readyToDeliver} to deliver)`
            : ""}
          .
        </p>
      ) : null}

      {data.onDuty.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No drivers are on duty. Drivers go on duty from the driver app; back-office cannot do it
          for them.
        </p>
      ) : (
        <ul className="divide-y border-y">
          {data.onDuty.map((d) => (
            <li key={d.sessionId} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3">
              <Link
                to="/drivers/$driverId"
                params={{ driverId: d.driverId }}
                className="font-medium text-primary hover:underline"
              >
                {d.driverName}
              </Link>
              <span className="text-sm text-muted-foreground">{d.zone ?? "No zone"}</span>
              <span className="text-sm tabular-nums text-muted-foreground">
                {durationSince(d.onDutySince)} on duty
              </span>
              <span className="text-sm">
                {d.currentRunId ? (
                  <>
                    {RUN_TYPE_LABEL[d.currentRunType ?? ""] ?? d.currentRunType} ·{" "}
                    <span className="tabular-nums">
                      {d.completedStops} of {d.totalStops}
                    </span>
                    {d.nextStop ? <> · next: {d.nextStop}</> : null}
                  </>
                ) : (
                  <span className="text-muted-foreground">Idle — no run assigned</span>
                )}
              </span>
              {d.overdue ? (
                <span className="flex items-center gap-2 text-sm">
                  <span className="font-medium">Shift running long</span>
                  {canManage ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={endSession.isPending}
                      onClick={() => {
                        setError(null);
                        endSession.mutate(d.sessionId, {
                          onError: (e) => setError(driverActionError(e, "end-duty")),
                        });
                      }}
                    >
                      End shift
                    </Button>
                  ) : null}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <StrandedWorkPanel />
    </section>
  );
}
