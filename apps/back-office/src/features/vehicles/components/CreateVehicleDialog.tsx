import { useState } from "react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
} from "@effy/design-system/ui";
import type { VehicleBodyType, VehicleCreateRequest, VehicleOwnership } from "@effy/shared-types";

import { BODY_TYPE_LABEL, OWNERSHIP_LABEL } from "../model";
import { vehicleActionError, vehicleFieldErrors } from "../errorText";
import { useCreateVehicle } from "../queries";

const BODY_TYPES = Object.keys(BODY_TYPE_LABEL) as VehicleBodyType[];
const OWNERSHIPS = Object.keys(OWNERSHIP_LABEL) as VehicleOwnership[];

function Field({ id, label, children, hint }: { id: string; label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * Add a vehicle (061 FR-001…FR-006).
 *
 * ⚠ ONLY THE FOUR FIELDS THE BUSINESS CANNOT DO WITHOUT ARE REQUIRED. Everything else — capacity,
 * refrigeration, compliance dates — is editable afterwards on the detail screen. A create form that
 * demands a roadworthy date an operator does not have in front of them is a form they will fill with
 * something wrong to get past it.
 */
export function CreateVehicleDialog() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ field: string; message: string }[]>([]);

  const [registrationPlate, setPlate] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [bodyType, setBodyType] = useState<VehicleBodyType>("van");
  const [ownership, setOwnership] = useState<VehicleOwnership>("effy_owned");
  const [canCarryChilled, setChilled] = useState(false);
  const [canCarryFrozen, setFrozen] = useState(false);

  const create = useCreateVehicle();

  function close() {
    setOpen(false);
    setError(null);
    setFieldErrors([]);
    setPlate("");
    setMake("");
    setModel("");
    setBodyType("van");
    setOwnership("effy_owned");
    setChilled(false);
    setFrozen(false);
  }

  function submit() {
    setError(null);
    setFieldErrors([]);
    const body: VehicleCreateRequest = {
      registrationPlate: registrationPlate.trim(),
      make: make.trim(),
      model: model.trim(),
      bodyType,
      ownership,
      canCarryChilled,
      canCarryFrozen,
    };
    create.mutate(body, {
      onSuccess: close,
      onError: (e) => {
        setError(vehicleActionError(e, "create"));
        setFieldErrors(vehicleFieldErrors(e));
      },
    });
  }

  const disabled =
    create.isPending || !registrationPlate.trim() || !make.trim() || !model.trim();

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogTrigger asChild>
        <Button>Add vehicle</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a vehicle</DialogTitle>
          <DialogDescription>
            Capacity and compliance dates can be filled in afterwards on the vehicle's record.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field id="v-plate" label="Registration plate">
            <Input
              id="v-plate"
              value={registrationPlate}
              onChange={(e) => setPlate(e.target.value)}
              autoComplete="off"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field id="v-make" label="Make">
              <Input id="v-make" value={make} onChange={(e) => setMake(e.target.value)} />
            </Field>
            <Field id="v-model" label="Model">
              <Input id="v-model" value={model} onChange={(e) => setModel(e.target.value)} />
            </Field>
          </div>

          <Field id="v-body" label="Body type">
            <select
              id="v-body"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={bodyType}
              onChange={(e) => setBodyType(e.target.value as VehicleBodyType)}
            >
              {BODY_TYPES.map((b) => (
                <option key={b} value={b}>
                  {BODY_TYPE_LABEL[b]}
                </option>
              ))}
            </select>
          </Field>

          {/* ⚠ Ownership is a FACT ABOUT THE VEHICLE, not a different kind of record. A driver-owned
              van is issued, inspected and retired exactly like an Effy-owned one. */}
          <Field
            id="v-owner"
            label="Owner"
            hint="A driver-owned vehicle is managed exactly like an Effy-owned one."
          >
            <select
              id="v-owner"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={ownership}
              onChange={(e) => setOwnership(e.target.value as VehicleOwnership)}
            >
              {OWNERSHIPS.map((o) => (
                <option key={o} value={o}>
                  {OWNERSHIP_LABEL[o]}
                </option>
              ))}
            </select>
          </Field>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">What it can carry</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={canCarryChilled} onChange={(e) => setChilled(e.target.checked)} />
              Chilled goods
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={canCarryFrozen} onChange={(e) => setFrozen(e.target.checked)} />
              Frozen goods
            </label>
          </fieldset>

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
          <Button type="button" disabled={disabled} onClick={submit}>
            {create.isPending ? "Adding…" : "Add vehicle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
