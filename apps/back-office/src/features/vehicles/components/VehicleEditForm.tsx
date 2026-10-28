import { useState } from "react"

import {
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@effy/design-system/ui"
import type { VehicleDetail, VehicleFuelType, VehicleUpdateRequest } from "@effy/shared-types"

import { FUEL_TYPE_LABEL } from "../model"
import { vehicleActionError, vehicleFieldErrors } from "../errorText"
import { useUpdateVehicle } from "../queries"

const FUEL_TYPES = Object.keys(FUEL_TYPE_LABEL) as VehicleFuelType[]

function orNull(v: string): string | null {
  const t = v.trim()
  return t === "" ? null : t
}

function numOrNull(v: string): number | null {
  const t = v.trim()
  if (t === "") return null
  const n = Number(t)
  return Number.isInteger(n) ? n : null
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}

export function VehicleEditForm({ vehicle }: { vehicle: VehicleDetail }) {
  const [year, setYear] = useState(vehicle.year?.toString() ?? "")
  const [fuelType, setFuelType] = useState<string>(vehicle.fuelType ?? "")
  const [payloadKg, setPayload] = useState(vehicle.payloadKg?.toString() ?? "")
  const [loadVolumeLitres, setVolume] = useState(vehicle.loadVolumeLitres?.toString() ?? "")
  const [crateCapacity, setCrates] = useState(vehicle.crateCapacity?.toString() ?? "")
  const [canCarryChilled, setChilled] = useState(vehicle.canCarryChilled)
  const [canCarryFrozen, setFrozen] = useState(vehicle.canCarryFrozen)
  const [registrationExpiresOn, setReg] = useState(vehicle.registrationExpiresOn ?? "")
  const [insurancePolicyReference, setPolicy] = useState(vehicle.insurancePolicyReference ?? "")
  const [insuranceExpiresOn, setIns] = useState(vehicle.insuranceExpiresOn ?? "")
  const [roadworthyExpiresOn, setRwc] = useState(vehicle.roadworthyExpiresOn ?? "")
  const [odometerKm, setOdo] = useState(vehicle.odometerKm?.toString() ?? "")
  const [notes, setNotes] = useState(vehicle.notes ?? "")

  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ field: string; message: string }[]>([])
  const [saved, setSaved] = useState(false)

  const update = useUpdateVehicle(vehicle.id)

  function submit() {
    setError(null)
    setFieldErrors([])
    setSaved(false)

    const body: VehicleUpdateRequest = {
      updatedAt: vehicle.updatedAt,
      year: numOrNull(year),
      fuelType: (orNull(fuelType) as VehicleFuelType | null) ?? null,
      payloadKg: numOrNull(payloadKg),
      loadVolumeLitres: numOrNull(loadVolumeLitres),
      crateCapacity: numOrNull(crateCapacity),
      canCarryChilled,
      canCarryFrozen,
      registrationExpiresOn: orNull(registrationExpiresOn),
      insurancePolicyReference: orNull(insurancePolicyReference),
      insuranceExpiresOn: orNull(insuranceExpiresOn),
      roadworthyExpiresOn: orNull(roadworthyExpiresOn),
      odometerKm: numOrNull(odometerKm),
      notes: orNull(notes),
    }

    update.mutate(body, {
      onSuccess: () => setSaved(true),
      onError: (e) => {
        setError(vehicleActionError(e, "update"))
        setFieldErrors(vehicleFieldErrors(e))
      },
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="ve-year" label="Year">
          <Input id="ve-year" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} />
        </Field>
        <Field id="ve-fuel" label="Fuel">
          <Select
            value={fuelType || "__none"}
            onValueChange={(raw) => {
              const next = raw === "__none" ? "" : raw
              setFuelType(next)
            }}
          >
            <SelectTrigger id="ve-fuel" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Not recorded</SelectItem>
              {FUEL_TYPES.map((f) => (
                <SelectItem key={f} value={f}>
                  {FUEL_TYPE_LABEL[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="ve-payload" label="Payload (kg)">
          <Input id="ve-payload" inputMode="numeric" value={payloadKg} onChange={(e) => setPayload(e.target.value)} />
        </Field>
        <Field id="ve-volume" label="Load volume (L)">
          <Input
            id="ve-volume"
            inputMode="numeric"
            value={loadVolumeLitres}
            onChange={(e) => setVolume(e.target.value)}
          />
        </Field>
        <Field id="ve-crates" label="Crate capacity">
          <Input id="ve-crates" inputMode="numeric" value={crateCapacity} onChange={(e) => setCrates(e.target.value)} />
        </Field>
        <Field id="ve-odo" label="Odometer (km)">
          <Input id="ve-odo" inputMode="numeric" value={odometerKm} onChange={(e) => setOdo(e.target.value)} />
        </Field>
        <Field id="ve-reg" label="Registration expires">
          <Input id="ve-reg" type="date" value={registrationExpiresOn} onChange={(e) => setReg(e.target.value)} />
        </Field>
        <Field id="ve-policy" label="Insurance policy">
          <Input id="ve-policy" value={insurancePolicyReference} onChange={(e) => setPolicy(e.target.value)} />
        </Field>
        <Field id="ve-ins" label="Insurance expires">
          <Input id="ve-ins" type="date" value={insuranceExpiresOn} onChange={(e) => setIns(e.target.value)} />
        </Field>
        <Field id="ve-rwc" label="Roadworthy expires">
          <Input id="ve-rwc" type="date" value={roadworthyExpiresOn} onChange={(e) => setRwc(e.target.value)} />
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">What it can carry</legend>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={canCarryChilled} onCheckedChange={(v) => setChilled(v === true)} />
          Chilled goods
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={canCarryFrozen} onCheckedChange={(v) => setFrozen(v === true)} />
          Frozen goods
        </label>
      </fieldset>

      <Field id="ve-notes" label="Notes">
        <Input id="ve-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

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
      {saved ? <p className="text-sm text-muted-foreground">Saved.</p> : null}

      <Button type="button" disabled={update.isPending} onClick={submit}>
        {update.isPending ? "Saving…" : "Save changes"}
      </Button>
    </div>
  )
}
