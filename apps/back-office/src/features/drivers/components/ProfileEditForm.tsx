import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

import type { AdminDriverProfile, AdminDriverUpdateRequest } from "@effy/shared-types";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@effy/design-system/ui";

import { driverActionError } from "../errorText";
import { useUpdateDriver, zonesQuery } from "../queries";

const NO_ZONE = "none";

/**
 * Edit the profile of record (FR-009, FR-010, FR-012).
 *
 * ⚠ EVERY FIELD SENDS `null` WHEN EMPTIED, NEVER `undefined`. That is the entire point of FR-010:
 * the predecessor used `COALESCE($n, col)` server-side, which cannot distinguish "leave this alone"
 * from "clear this" — so a zone, once assigned, could never be un-assigned by any request the API
 * would accept. The server now reads the PRESENCE of a key, and this form always sends every key it
 * owns. Do not "tidy" this by stripping empty values.
 *
 * ⚠ `workEmail` IS NOT EDITABLE and is not in the payload. It is the sign-in identity; changing it
 * is a re-provisioning, not an edit.
 *
 * ⚠ `updatedAt` is echoed back so a second save cannot silently overwrite someone else's.
 */
export function ProfileEditForm({
  driver,
  onDone,
}: {
  driver: AdminDriverProfile;
  onDone: () => void;
}) {
  const zones = useQuery(zonesQuery());
  const update = useUpdateDriver(driver.id);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(driver.name);
  const [contactPhone, setContactPhone] = useState(driver.contactPhone ?? "");
  const [zoneId, setZoneId] = useState(driver.zoneId ?? NO_ZONE);
  const [vehicleType, setVehicleType] = useState(driver.vehicle.type ?? "");
  const [vehiclePlate, setVehiclePlate] = useState(driver.vehicle.plate ?? "");
  const [licenceReference, setLicenceReference] = useState(driver.credentials.licenceReference ?? "");
  const [licenceExpiresOn, setLicenceExpiresOn] = useState(driver.credentials.licenceExpiresOn ?? "");
  const [regExpiresOn, setRegExpiresOn] = useState(
    driver.credentials.vehicleRegistrationExpiresOn ?? "",
  );
  const [emergencyName, setEmergencyName] = useState(driver.emergencyContact.name ?? "");
  const [emergencyPhone, setEmergencyPhone] = useState(driver.emergencyContact.phone ?? "");
  const [startedOn, setStartedOn] = useState(driver.startedOn ?? "");
  const [notes, setNotes] = useState(driver.notes ?? "");

  /** An emptied text box means CLEAR, so it becomes `null` rather than `""` or being dropped. */
  const orNull = (v: string): string | null => (v.trim() === "" ? null : v.trim());

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const body: AdminDriverUpdateRequest = {
      name: name.trim(),
      contactPhone: orNull(contactPhone),
      zoneId: zoneId === NO_ZONE ? null : zoneId,
      vehicleType: orNull(vehicleType),
      vehiclePlate: orNull(vehiclePlate),
      licenceReference: orNull(licenceReference),
      licenceExpiresOn: orNull(licenceExpiresOn),
      vehicleRegistrationExpiresOn: orNull(regExpiresOn),
      emergencyContactName: orNull(emergencyName),
      emergencyContactPhone: orNull(emergencyPhone),
      startedOn: orNull(startedOn),
      notes: orNull(notes),
      updatedAt: driver.updatedAt,
    };
    update.mutate(body, {
      onSuccess: onDone,
      onError: (err) => setError(driverActionError(err, "update")),
    });
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="f-name" label="Name">
          <Input id="f-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>

        <Field id="f-email" label="Work email">
          {/* Shown because it is part of the record a person is reading, disabled because it is the
              sign-in identity. Hiding it would be worse: they would wonder where it went. */}
          <Input id="f-email" value={driver.workEmail} disabled />
          <p className="text-xs text-muted-foreground">
            The sign-in identity. It cannot be changed here.
          </p>
        </Field>

        <Field id="f-phone" label="Phone">
          <Input
            id="f-phone"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            autoComplete="off"
          />
        </Field>

        <Field id="f-started" label="Started on">
          <Input
            id="f-started"
            type="date"
            value={startedOn}
            onChange={(e) => setStartedOn(e.target.value)}
          />
        </Field>

        <Field id="f-zone" label="Delivery zone">
          <Select value={zoneId} onValueChange={setZoneId}>
            <SelectTrigger id="f-zone">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_ZONE}>Not assigned</SelectItem>
              {(zones.data ?? []).map((z) => (
                <SelectItem key={z.id} value={z.id}>
                  {z.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {zoneId === NO_ZONE ? (
            <p className="text-xs text-muted-foreground">
              Without a zone this driver cannot be given work.
            </p>
          ) : null}
        </Field>

        <Field id="f-vtype" label="Vehicle">
          <Input
            id="f-vtype"
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value)}
            placeholder="e.g. small van"
          />
        </Field>

        <Field id="f-plate" label="Registration plate">
          <Input id="f-plate" value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value)} />
        </Field>

        <Field id="f-reg-exp" label="Registration expires">
          <Input
            id="f-reg-exp"
            type="date"
            value={regExpiresOn}
            onChange={(e) => setRegExpiresOn(e.target.value)}
          />
        </Field>

        <Field id="f-licence" label="Licence reference">
          <Input
            id="f-licence"
            value={licenceReference}
            onChange={(e) => setLicenceReference(e.target.value)}
            autoComplete="off"
          />
        </Field>

        <Field id="f-licence-exp" label="Licence expires">
          <Input
            id="f-licence-exp"
            type="date"
            value={licenceExpiresOn}
            onChange={(e) => setLicenceExpiresOn(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Once this date passes, the driver cannot be given work.
          </p>
        </Field>

        <Field id="f-em-name" label="Emergency contact">
          <Input
            id="f-em-name"
            value={emergencyName}
            onChange={(e) => setEmergencyName(e.target.value)}
            autoComplete="off"
          />
        </Field>

        <Field id="f-em-phone" label="Emergency contact phone">
          <Input
            id="f-em-phone"
            value={emergencyPhone}
            onChange={(e) => setEmergencyPhone(e.target.value)}
            autoComplete="off"
          />
        </Field>
      </div>

      <Field id="f-notes" label="Notes">
        <Textarea id="f-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </Field>

      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
