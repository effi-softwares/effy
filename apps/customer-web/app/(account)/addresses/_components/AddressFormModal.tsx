"use client"

import { useEffect, useState } from "react"

import type { CreateAddressRequest, UpdateAddressRequest } from "@effy/shared-types"
import {
  Button,
  Input,
  Label,
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@effy/design-system/ui"

import { createAddress, updateAddress, type SaveResult } from "@/lib/addresses/repo"
import {
  chipForLabel,
  customLabelForLabel,
  labelForChip,
  LABEL_CHIPS,
  type Address,
  type LabelChip,
} from "@/lib/addresses/model"
import { capture } from "@/lib/telemetry"

/**
 * The add / edit address form (US2/US5), mounted in a {@link ResponsiveModal} — a Dialog at/above the
 * 768px breakpoint and a bottom Drawer below it (FR-007). One form serves both: `address` present →
 * edit (pre-filled, PATCH); absent → add (POST).
 *
 * The label is chosen from **Home / Work / Other** chips over the free-text column (FR-006a); Other
 * reveals a text field. Required fields (recipient, line 1, city, postcode) are validated inline and
 * the customer's input is preserved on error (FR-009). Dismissing saves nothing (SC-009) — no request
 * is made until Save succeeds, and there is no draft persistence.
 */

interface FormState {
  recipientName: string
  phone: string
  line1: string
  line2: string
  city: string
  region: string
  postalCode: string
}

const EMPTY: FormState = {
  recipientName: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: "",
}

function fromAddress(a: Address): FormState {
  return {
    recipientName: a.recipientName,
    phone: a.phone ?? "",
    line1: a.line1,
    line2: a.line2 ?? "",
    city: a.city,
    region: a.region ?? "",
    postalCode: a.postalCode,
  }
}

type Errors = Partial<Record<keyof FormState, string>>

export function AddressFormModal({
  open,
  onOpenChange,
  address,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  address?: Address
  onSaved: (address: Address) => void
}) {
  const editing = !!address
  const [form, setForm] = useState<FormState>(EMPTY)
  const [chip, setChip] = useState<LabelChip | null>(null)
  const [customLabel, setCustomLabel] = useState("")
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Re-seed whenever the modal opens (fresh for add; from the stored values for edit) so a reopen
  // never shows a stale draft — SC-009's "reopening starts fresh (add) or from stored (edit)".
  useEffect(() => {
    if (!open) return
    setForm(address ? fromAddress(address) : EMPTY)
    setChip(address ? chipForLabel(address.label) : null)
    setCustomLabel(address ? customLabelForLabel(address.label) : "")
    setErrors({})
    setFormError(null)
    setBusy(false)
  }, [open, address])

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  function validate(): Errors {
    const next: Errors = {}
    if (!form.recipientName.trim()) next.recipientName = "Recipient name is required."
    if (!form.line1.trim()) next.line1 = "Address line 1 is required."
    if (!form.city.trim()) next.city = "City is required."
    if (!form.postalCode.trim()) next.postalCode = "Postcode is required."
    return next
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const found = validate()
    if (Object.keys(found).length > 0) {
      setErrors(found)
      return
    }
    setErrors({})
    setFormError(null)
    setBusy(true)

    const label = labelForChip(chip, customLabel)
    let result: SaveResult
    if (editing && address) {
      const body: UpdateAddressRequest = {
        label,
        recipientName: form.recipientName.trim(),
        phone: form.phone.trim() || null,
        line1: form.line1.trim(),
        line2: form.line2.trim() || null,
        city: form.city.trim(),
        region: form.region.trim() || null,
        postalCode: form.postalCode.trim(),
      }
      result = await updateAddress(address.id, body)
    } else {
      const body: CreateAddressRequest = {
        label,
        recipientName: form.recipientName.trim(),
        phone: form.phone.trim() || null,
        line1: form.line1.trim(),
        line2: form.line2.trim() || null,
        city: form.city.trim(),
        region: form.region.trim() || null,
        postalCode: form.postalCode.trim(),
      }
      result = await createAddress(body)
    }

    setBusy(false)
    if (!result.ok) {
      setFormError(result.error)
      return
    }
    capture({ name: editing ? "address_edited" : "address_added" })
    onSaved(result.address)
    onOpenChange(false)
  }

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange}>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>{editing ? "Edit address" : "Add address"}</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            {editing
              ? "Update this delivery address."
              : "Save a delivery address to your account."}
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        <form onSubmit={submit} className="space-y-4 px-4 pb-4 md:px-0" noValidate>
          <div className="space-y-2">
            <Label>Label</Label>
            <div className="flex flex-wrap gap-2">
              {LABEL_CHIPS.map((c) => {
                const selected = chip === c
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setChip(selected ? null : c)}
                    className={
                      "rounded-full border px-3 py-1 text-sm transition-colors " +
                      (selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input hover:bg-accent")
                    }
                  >
                    {c}
                  </button>
                )
              })}
            </div>
            {chip === "Other" && (
              <Input
                aria-label="Custom label"
                placeholder="e.g. Mum’s place"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
              />
            )}
          </div>

          <Field
            id="recipientName"
            label="Recipient name"
            value={form.recipientName}
            onChange={set("recipientName")}
            error={errors.recipientName}
            required
          />
          <Field
            id="line1"
            label="Address line 1"
            value={form.line1}
            onChange={set("line1")}
            error={errors.line1}
            required
          />
          <Field
            id="line2"
            label="Address line 2 (optional)"
            value={form.line2}
            onChange={set("line2")}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field id="city" label="City" value={form.city} onChange={set("city")} error={errors.city} required />
            <Field id="region" label="State / region" value={form.region} onChange={set("region")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              id="postalCode"
              label="Postcode"
              value={form.postalCode}
              onChange={set("postalCode")}
              error={errors.postalCode}
              required
            />
            <Field id="phone" label="Phone (optional)" value={form.phone} onChange={set("phone")} />
          </div>

          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}

          <ResponsiveModalFooter className="px-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save address"}
            </Button>
          </ResponsiveModalFooter>
        </form>
      </ResponsiveModalContent>
    </ResponsiveModal>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  error,
  required,
}: {
  id: string
  label: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  error?: string
  required?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={onChange}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        required={required}
      />
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
