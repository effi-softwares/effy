import { useState } from "react";

import type { AdminDriverProfile, DriverEmploymentStatus } from "@effy/shared-types";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from "@effy/design-system/ui";

import { track } from "@/lib/telemetry";

import { driverActionError, heldWorkItems } from "../errorText";
import { STATUS_MEANING } from "../model";
import { useSetDriverStatus } from "../queries";

/**
 * The employment lifecycle control (FR-015…FR-020).
 *
 * ⚠ THIS COMPONENT'S HARDEST JOB IS TELLING THE TRUTH ABOUT TIMING. Two things are true at once and
 * an operator will assume only the first:
 *
 *   ACCESS ends immediately — the record is authoritative and the sign-in account is disabled in the
 *   same operation, so no session can be obtained from this moment.
 *
 *   WORK does not come back immediately — un-started work returns to the pool on the assignment
 *   sweep's next round, and anything the driver has already PICKED UP does not come back at all
 *   until a person releases it.
 *
 * Implying a stood-down driver has been cleared of their work when they have not is the exact
 * failure this whole feature exists to prevent, so the copy says both, every time.
 */

const TRANSITIONS: Record<DriverEmploymentStatus, DriverEmploymentStatus[]> = {
  active: ["suspended", "offboarded"],
  suspended: ["active", "offboarded"],
  // ⚠ Terminal. Restoring a departed employee is a re-hire decision, not a button — and FR-014's
  // refusal already names an offboarded record when their address is reused, so the operator is
  // pointed at the choice deliberately rather than nudged into it.
  offboarded: [],
};

const VERB: Record<DriverEmploymentStatus, string> = {
  active: "Restore",
  suspended: "Suspend",
  offboarded: "Offboard",
};

export function StatusControl({ driver }: { driver: AdminDriverProfile }) {
  const [target, setTarget] = useState<DriverEmploymentStatus | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [held, setHeld] = useState<string[]>([]);

  const mutate = useSetDriverStatus(driver.id);
  const options = TRANSITIONS[driver.status];

  function close() {
    setTarget(null);
    setReason("");
    setError(null);
    setHeld([]);
  }

  function submit(acknowledgeHeldWork: boolean) {
    if (!target) return;
    setError(null);
    mutate.mutate(
      { status: target, reason, acknowledgeHeldWork },
      {
        onSuccess: () => {
          track({ name: "driver_status_changed", driverId: driver.id, status: target });
          close();
        },
        onError: (e) => {
          // ⚠ The itemised held work is carried in the refusal's field list. Showing only the
          // sentence would tell the operator that work is held without saying WHICH — and the whole
          // point of FR-020 is that they can go and deal with those orders.
          setHeld(heldWorkItems(e));
          setError(driverActionError(e, "status"));
        },
      },
    );
  }

  if (options.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This driver has left. Their record and work history are kept for audit; their sign-in is
        permanently closed.
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {options.map((s) => (
          <Button key={s} variant="outline" onClick={() => setTarget(s)}>
            {VERB[s]}
          </Button>
        ))}
      </div>

      <Dialog open={target !== null} onOpenChange={(o) => (o ? null : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {target ? VERB[target] : ""} {driver.name}
            </DialogTitle>
            <DialogDescription>{target ? STATUS_MEANING[target] : ""}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* ⚠ The timing truth, stated on every stand-down. */}
            {target !== "active" ? (
              <div className="border-l-2 border-foreground py-1 pl-3 text-sm">
                <p className="font-medium">They lose access straight away.</p>
                <p className="text-muted-foreground">
                  Work they have not started yet goes back to the pool on the next assignment round.
                  Anything they have already picked up stays with them until someone releases it —
                  you will find it under Stranded work.
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="status-reason">Reason</Label>
              <Textarea
                id="status-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  target === "active"
                    ? "e.g. returned from leave"
                    : target === "suspended"
                      ? "e.g. on leave until 15 September"
                      : "e.g. resigned, last day 29 August"
                }
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Kept on the driver's record and in the change history.
              </p>
            </div>

            {error ? (
              <div role="alert" className="space-y-2">
                <p className="text-sm font-medium text-destructive">{error}</p>
                {held.length > 0 ? (
                  <>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {held.map((item) => (
                        <li key={item}>· {item}</li>
                      ))}
                    </ul>
                    <p className="text-sm">
                      Going ahead will leave this work stranded until someone releases it.
                    </p>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            {/* ⚠ A SECOND, DIFFERENT BUTTON after the warning — not the same one clicked twice.
                Re-pressing an unchanged control is a reflex; pressing one whose label has changed to
                name the consequence is a decision. */}
            {held.length > 0 ? (
              <Button
                type="button"
                variant="destructive"
                disabled={mutate.isPending || reason.trim() === ""}
                onClick={() => submit(true)}
              >
                {mutate.isPending ? "Working…" : `${target ? VERB[target] : ""} and strand the work`}
              </Button>
            ) : (
              <Button
                type="button"
                disabled={mutate.isPending || reason.trim() === ""}
                onClick={() => submit(false)}
              >
                {mutate.isPending ? "Working…" : (target ? VERB[target] : "Confirm")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
