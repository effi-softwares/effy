import { useState } from "react"

import type { AdminDriverProfile, AdminDriverUpdateRequest } from "@effy/shared-types"
import {
  Button,
  DateField,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@effy/design-system/ui"

import { driverActionError } from "../errorText"
import { useUpdateDriver } from "../queries"

export function ProfileEditForm({ driver, onDone }: { driver: AdminDriverProfile; onDone: () => void }) {
  const update = useUpdateDriver(driver.id)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(driver.name)
  const [contactPhone, setContactPhone] = useState(driver.contactPhone ?? "")
  const [licenceReference, setLicenceReference] = useState(driver.credentials.licenceReference ?? "")
  const [licenceExpiresOn, setLicenceExpiresOn] = useState(driver.credentials.licenceExpiresOn ?? "")
  const [licenceClass, setLicenceClass] = useState<string>(driver.credentials.licenceClass ?? "")
  const [emergencyName, setEmergencyName] = useState(driver.emergencyContact.name ?? "")
  const [emergencyPhone, setEmergencyPhone] = useState(driver.emergencyContact.phone ?? "")
  const [startedOn, setStartedOn] = useState(driver.startedOn ?? "")
  const [notes, setNotes] = useState(driver.notes ?? "")

  const orNull = (v: string): string | null => (v.trim() === "" ? null : v.trim())

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
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
    }
    update.mutate(body, {
      onSuccess: onDone,
      onError: (err) => setError(driverActionError(err, "update")),
    })
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="f-name" label="Name">
          <Input id="f-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>

        <Field id="f-email" label="Work email">
          <Input id="f-email" value={driver.workEmail} disabled />
          <p className="text-xs text-muted-foreground">The sign-in identity. It cannot be changed here.</p>
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
          <DateField id="f-started" value={startedOn} onChange={(v) => setStartedOn(v)} />
        </Field>

        <Field id="f-licence-class" label="Licence class">
          <Select
            value={licenceClass || "__none"}
            onValueChange={(raw) => {
              const next = raw === "__none" ? "" : raw
              setLicenceClass(next)
            }}
          >
            <SelectTrigger id="f-licence-class" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Not recorded</SelectItem>
              <SelectItem value="C">C — car and light vehicle</SelectItem>
              <SelectItem value="LR">LR — light rigid</SelectItem>
              <SelectItem value="MR">MR — medium rigid</SelectItem>
              <SelectItem value="HR">HR — heavy rigid</SelectItem>
            </SelectContent>
          </Select>
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
          <DateField id="f-licence-exp" value={licenceExpiresOn} onChange={(v) => setLicenceExpiresOn(v)} />
          <p className="text-xs text-muted-foreground">Once this date passes, the driver cannot be given work.</p>
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
  )
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}
