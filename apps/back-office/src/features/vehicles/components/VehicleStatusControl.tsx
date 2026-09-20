import { useState } from "react";

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
import type { VehicleDetail, VehicleStatus } from "@effy/shared-types";

import { STATUS_MEANING } from "../model";
import { vehicleActionError, vehicleFieldErrors } from "../errorText";
import { useSetVehicleStatus } from "../queries";

/** Where each status can go. ⚠ Retired is TERMINAL — there is no transition out of it. */
const TRANSITIONS: Record<VehicleStatus, VehicleStatus[]> = {
  active: ["off_road", "retired"],
  off_road: ["active", "retired"],
  retired: [],
};

const VERB: Record<VehicleStatus, string> = {
  active: "Return to service",
  off_road: "Take off the road",
  retired: "Retire",
};

export function VehicleStatusControl({ vehicle }: { vehicle: VehicleDetail }) {
  const [target, setTarget] = useState<VehicleStatus | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ field: string; message: string }[]>([]);

  const mutate = useSetVehicleStatus(vehicle.id);
  const options = TRANSITIONS[vehicle.status];

  function close() {
    setTarget(null);
    setReason("");
    setError(null);
    setFieldErrors([]);
  }

  if (options.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This vehicle has been retired. Its record and handover history are kept for audit; it can
        never be issued again.
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {options.map((s) => (
          <Button
            key={s}
            variant={s === "retired" ? "destructive" : "outline"}
            size="sm"
            onClick={() => setTarget(s)}
          >
            {VERB[s]}
          </Button>
        ))}
      </div>

      <Dialog open={target !== null} onOpenChange={(o) => (o ? null : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {target ? VERB[target] : ""} {vehicle.registrationPlate}
            </DialogTitle>
            <DialogDescription>{target ? STATUS_MEANING[target] : ""}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* ⚠ Retiring a vehicle that is still OUT is refused by the service, and the refusal
                names the holder. The van is in a carpark somewhere; retiring it would take it off
                the fleet while a person physically has it, and nothing would say so — 056's
                stranded-work shape, which was in no register because nobody knew. */}
            {target === "retired" && vehicle.currentHolderDriverId ? (
              <p className="text-sm font-medium">
                {vehicle.registrationPlate} is still out with {vehicle.currentHolderName}. Record its
                return first — retiring it now would leave the fleet unable to say who has it.
              </p>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="v-status-reason">Reason</Label>
              <Textarea
                id="v-status-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Kept on the vehicle's record and in the change history.
              </p>
            </div>

            {error ? (
              <div role="alert" className="space-y-1">
                <p className="text-sm font-medium text-destructive">{error}</p>
                {fieldErrors.map((f) => (
                  <p key={f.field} className="text-sm text-muted-foreground">
                    · {f.message}
                  </p>
                ))}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={target === "retired" ? "destructive" : "default"}
              disabled={mutate.isPending || reason.trim() === "" || !target}
              onClick={() => {
                if (!target) return;
                setError(null);
                setFieldErrors([]);
                mutate.mutate(
                  { status: target, reason },
                  {
                    onSuccess: close,
                    onError: (e) => {
                      setError(vehicleActionError(e, "status"));
                      setFieldErrors(vehicleFieldErrors(e));
                    },
                  },
                );
              }}
            >
              {mutate.isPending ? "Working…" : target ? VERB[target] : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
