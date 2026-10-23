import { useState } from "react";

import type { AdminDriverProfile, AdminDriverUpdateRequest } from "@effy/shared-types";
import {
  Button,
  Input,
  Label,
  Textarea,
} from "@effy/design-system/ui";

import { driverActionError } from "../errorText";
import { useUpdateDriver } from "../queries";

/**
 * Edit the profile of record. Every emptied field sends `null`, never `undefined`: the server reads the
 * presence of a key, so `null` clears it (a zone can be un-assigned). Do not strip empty values.
 * `workEmail` is the sign-in identity and is not editable. `updatedAt` is echoed so a second save cannot
 * silently overwrite another.
 */
export function ProfileEditForm({
  driver,
  onDone,
}: {
  driver: AdminDriverProfile;
  onDone: () => void;
}) {
  const update = useUpdateDriver(driver.id);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(driver.name);
  const [contactPhone, setContactPhone] = useState(driver.contactPhone ?? "");
  // The vehicle type/plate fields are gone from this form. A vehicle is its own record now,
  // and what a driver drives is decided by issuing them one on the vehicle screen — not by typing a
  // string here that nobody maintained. The registration expiry went with them: it is a fact about a
  // vehicle, so a second driver holding the same van reads the same date.
  const [licenceReference, setLicenceReference] = useState(driver.credentials.licenceReference ?? "");
  const [licenceExpiresOn, setLicenceExpiresOn] = useState(driver.credentials.licenceExpiresOn ?? "");
  const [licenceClass, setLicenceClass] = useState<string>(driver.credentials.licenceClass ?? "");
  const [emergencyName, setEmergencyName] = useState(driver.emergencyContact.name ?? "");
  const [emergencyPhone, setEmergencyPhone] = useState(driver.emergencyContact.phone ?? "");
  const [startedOn, setStartedOn] = useState(driver.startedOn ?? "");
  const [notes, setNotes] = useState(driver.notes ?? "");

  /** An emptied text box means clear, so it becomes `null` rather than `""` or being dropped. */
  const orNull = (v: string): string | null => (v.trim() === "" ? null : v.trim());

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const body: AdminDriverUpdateRequest = {
      name: name.trim(),
      contactPhone: orNull(contactPhone),

      licenceReference: orNull(licenceReference),
      licenceExpiresOn: orNull(licenceExpiresOn),
      licenceClass: orNull(licenceClass) as AdminDriverUpdateRequest["licenceClass"],
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

        {/* The zone picker is gone. A driver's coverage is a set of clearances now
            (function × area), granted on the Clearances section below, because one zone could never
            express "delivers here, collects everywhere". */}

        <Field id="f-licence-class" label="Licence class">
          <select
            id="f-licence-class"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={licenceClass}
            onChange={(e) => setLicenceClass(e.target.value)}
          >
            <option value="">Not recorded</option>
            <option value="C">C — car and light vehicle</option>
            <option value="LR">LR — light rigid</option>
            <option value="MR">MR — medium rigid</option>
            <option value="HR">HR — heavy rigid</option>
          </select>
          <p className="text-xs text-muted-foreground">
            Recorded so the platform can check a driver may legally drive the vehicle they hold.
          </p>
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
