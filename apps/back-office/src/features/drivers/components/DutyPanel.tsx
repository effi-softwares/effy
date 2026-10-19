import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Clock, Radio } from "lucide-react";

import { Button, Skeleton } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { Panel } from "@/components/patterns/Panel";
import { Callout } from "@/components/patterns/States";
import { useSessionRoles } from "@/features/auth/useSessionRoles";
import { dispatchDayQuery } from "@/features/dispatch/queries";

import { canManageDrivers } from "../access";
import { driverActionError } from "../errorText";
import { durationSince, formatTime } from "../model";
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
  const day = useQuery(dispatchDayQuery());

  if (isError) return <ErrorState error={queryError} onRetry={() => void refetch()} />;
  if (isPending) return <Skeleton className="h-40" />;

  const waiting = data.unassigned.readyToCollect + data.unassigned.readyToDeliver;
  // Who has a round right now, from today's dispatch read — what each driver is actually doing.
  const roundOf = (driverId: string) => day.data?.rounds.find((r) => r.driverId === driverId);

  return (
    <Panel
      title="On duty now"
      icon={<Radio aria-hidden="true" />}
      description={
        /* ⚠ THE SENTENCE THAT ANSWERS "WHY IS NOTHING MOVING?". With nobody on duty, an empty list
           reads as "nothing to see" — it is the waiting count beside it that turns silence into a
           cause. FR-036 exists because that state was invisible. */
        waiting > 0 && data.unassigned.driversOnDuty === 0 ? undefined : waiting > 0 ? (
          <>
            {data.onDuty.length} {data.onDuty.length === 1 ? "driver" : "drivers"} · <span className="tabular-nums">{waiting}</span>{" "}
            {waiting === 1 ? "package is" : "packages are"} waiting to be picked up on the next assignment round
            {data.unassigned.readyToDeliver > 0
              ? ` (${data.unassigned.readyToCollect} to collect, ${data.unassigned.readyToDeliver} to deliver)`
              : ""}
            .
          </>
        ) : (
          `${data.onDuty.length} ${data.onDuty.length === 1 ? "driver" : "drivers"}`
        )
      }
      actions={<span className="text-xs text-muted-foreground">Drivers go on duty from the driver app; back-office cannot do it for them.</span>}
      flush
    >
      {waiting > 0 && data.unassigned.driversOnDuty === 0 ? (
        <div className="px-5 pt-4">
          <Callout tone="destructive" title={<>Nobody is on duty, and <span className="tabular-nums">{waiting}</span> {waiting === 1 ? "package is" : "packages are"} waiting for a driver.</>}>
            Nothing will move until someone goes on duty in the driver app.
          </Callout>
        </div>
      ) : null}
      {error ? (
        <div className="px-5 pt-4">
          <Callout tone="destructive" title={error} />
        </div>
      ) : null}

      {data.onDuty.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">No drivers are on duty.</p>
      ) : (
        <div className="bo-table-scroll">
          <table className="bo-table bo-rtable bo-table--plain">
            <thead>
              <tr>
                <th>Driver</th>
                <th>Doing now</th>
                <th>Zone</th>
                <th>On duty</th>
                <th>Finish</th>
                <th className="is-actions">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.onDuty.map((d) => {
                const round = roundOf(d.driverId);
                return (
                  <tr key={d.sessionId}>
                    <td data-m="primary">
                      <div className="flex items-center gap-2">
                        <span aria-hidden="true" className={`bo-dot ${round ? "bo-dot--busy" : "bo-dot--on"}`} />
                        <Link to="/drivers/$driverId" params={{ driverId: d.driverId }} className="bo-link">
                          {d.driverName}
                        </Link>
                      </div>
                    </td>
                    <td data-m="meta">
                      {round
                        ? `${round.round.kind === "collection" ? "Collection run" : "Delivery round"}${round.stageLabel ? ` · ${round.stageLabel}` : ""}`
                        : "Idle — nothing is assigned"}
                    </td>
                    <td data-m="hide" className="is-muted">
                      {d.zone ?? "No zone"}
                    </td>
                    <td data-m="trail" className="whitespace-nowrap tabular-nums">
                      {durationSince(d.onDutySince)}
                    </td>
                    <td data-m="meta" data-label="Finish">
                      {/* ⚠ 061 FR-033 — "unknown" is a real answer and is SAID, not implied by a blank. */}
                      <span className={d.pastExpectedEnd ? "font-medium" : d.expectedEndAt ? undefined : "text-muted-foreground"}>
                        {d.pastExpectedEnd ? "Past their expected finish" : d.expectedEndAt ? `Expects to finish ${formatTime(d.expectedEndAt)}` : "Finish time unknown"}
                      </span>
                      {d.overdue ? (
                        <span className="bo-late mt-0.5 flex">
                          <Clock aria-hidden="true" />
                          Shift running long
                        </span>
                      ) : null}
                    </td>
                    <td data-m="full" className="is-actions w-auto!">
                      {d.overdue && canManage ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={endSession.isPending}
                          onClick={() => {
                            setError(null);
                            endSession.mutate(d.sessionId, { onError: (e) => setError(driverActionError(e, "end-duty")) });
                          }}
                        >
                          End shift
                        </Button>
                      ) : null}
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
