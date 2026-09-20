import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { Button, Input, Label } from "@effy/design-system/ui";
import type { VehicleDetail } from "@effy/shared-types";

import { driversListQuery } from "@/features/drivers/queries";

import { vehicleActionError, vehicleFieldErrors } from "../errorText";
import { useIssueVehicle, useReturnVehicle } from "../queries";

/**
 * Hand a vehicle to a driver, and take it back (061 US2, FR-010/FR-011).
 *
 * ⚠ THE REFUSALS ARE THE POINT OF THIS COMPONENT, not the happy path. "That vehicle is already out
 * with Sam Rivers" and "that driver already has EFY-002" are composed by the service because only it
 * knows those facts — and 053 shipped a console that threw exactly this information away. The field
 * messages are rendered beside the form, not just the headline sentence.
 */
export function HoldingControl({ vehicle }: { vehicle: VehicleDetail }) {
  const [driverId, setDriverId] = useState("");
  const [odometer, setOdometer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ field: string; message: string }[]>([]);

  const issue = useIssueVehicle(vehicle.id);
  const back = useReturnVehicle(vehicle.id);
  const drivers = useQuery(driversListQuery({ status: "active" }));

  const held = Boolean(vehicle.currentHolderDriverId);
  const busy = issue.isPending || back.isPending;

  function reset() {
    setError(null);
    setFieldErrors([]);
  }

  function parseOdo(): number | null {
    const t = odometer.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isInteger(n) && n >= 0 ? n : null;
  }

  function onError(e: unknown, action: "issue" | "return") {
    setError(vehicleActionError(e, action));
    setFieldErrors(vehicleFieldErrors(e));
  }

  if (vehicle.status === "retired") {
    return (
      <p className="text-sm text-muted-foreground">
        This vehicle is retired. Its history is kept, but it can no longer be issued to anybody.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {held ? (
        <>
          <p className="text-sm">
            Out with <span className="font-medium">{vehicle.currentHolderName}</span>.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="odo-in">Closing odometer (km)</Label>
              <Input
                id="odo-in"
                inputMode="numeric"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
                className="w-48"
              />
            </div>
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                reset();
                back.mutate(
                  { odometerEndKm: parseOdo() },
                  { onSuccess: () => setOdometer(""), onError: (e) => onError(e, "return") },
                );
              }}
            >
              {back.isPending ? "Recording…" : "Record its return"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Available — nobody has this vehicle.</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="hold-driver">Issue to</Label>
              <select
                id="hold-driver"
                className="h-9 w-64 rounded-md border border-input bg-background px-3 text-sm"
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
              >
                <option value="">Choose a driver…</option>
                {(drivers.data?.items ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="odo-out">Opening odometer (km)</Label>
              <Input
                id="odo-out"
                inputMode="numeric"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
                className="w-48"
              />
            </div>
            <Button
              type="button"
              disabled={busy || driverId === ""}
              onClick={() => {
                reset();
                issue.mutate(
                  { driverId, odometerStartKm: parseOdo() },
                  {
                    onSuccess: () => {
                      setDriverId("");
                      setOdometer("");
                    },
                    onError: (e) => onError(e, "issue"),
                  },
                );
              }}
            >
              {issue.isPending ? "Issuing…" : "Issue vehicle"}
            </Button>
          </div>
        </>
      )}

      {error ? (
        <div role="alert" className="space-y-1">
          <p className="text-sm font-medium text-destructive">{error}</p>
          {/* ⚠ The field messages carry WHO or WHAT is in the way. Rendering only the headline is
              how 053's console lost the information the server had already worked out. */}
          {fieldErrors.map((f) => (
            <p key={f.field} className="text-sm text-muted-foreground">
              · {f.message}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
