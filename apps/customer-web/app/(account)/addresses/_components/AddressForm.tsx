"use client"

import { useState } from "react"

import type { CreateAddressRequest, UpdateAddressRequest } from "@effy/shared-types"
import { Button } from "@/components/ui/button"
import { Input, Label } from "@/components/ui/form"

import { DeliveryInstructions } from "@/app/checkout/DeliveryInstructions"
import { createAddress, updateAddress, type SaveResult } from "@/lib/addresses/repo"
import { draftFrom, draftToRequest, type InstructionsDraft } from "@/lib/delivery-instructions"
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
 * The add/edit address form with no container of its own, so the account dialog and checkout's
 * `AddressPicker` share one implementation. `address` present edits (PATCH), absent adds (POST).
 * Required fields are validated inline, input is kept on error, and nothing is sent until Save. It is
 * mounted fresh for each add and unmounted on close.
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

export function AddressForm({
  address,
  onSaved,
  onCancel,
  className,
}: {
  address?: Address
  /** A newly created / updated address. */
  onSaved: (address: Address) => void
  /** Dismiss without saving. */
  onCancel: () => void
  className?: string
}) {
  const editing = !!address
  const [form, setForm] = useState<FormState>(address ? fromAddress(address) : EMPTY)
  const [chip, setChip] = useState<LabelChip | null>(address ? chipForLabel(address.label) : null)
  const [customLabel, setCustomLabel] = useState(address ? customLabelForLabel(address.label) : "")
  // The instructions this address prefills at checkout.
  const [instructions, setInstructions] = useState<InstructionsDraft>(() =>
    draftFrom(address?.defaultDeliveryInstructions),
  )
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
        // Always sent: `null` clears what this address had saved.
        defaultDeliveryInstructions: draftToRequest(instructions),
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
        // Always sent: `null` clears what this address had saved.
        defaultDeliveryInstructions: draftToRequest(instructions),
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
  }

  return (
    <form onSubmit={submit} className={className ?? "space-y-4"} noValidate>
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
                  "rounded-md border px-3 py-1 text-sm transition-colors " +
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
      <Field id="line2" label="Address line 2 (optional)" value={form.line2} onChange={set("line2")} />
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

      <DeliveryInstructions
        value={instructions}
        onChange={setInstructions}
        disabled={busy}
        heading="Delivery instructions for this address"
        hint="Optional. Filled in for you at checkout whenever you choose this address."
      />

      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}

      <div className="mt-6 flex flex-row justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save address"}
        </Button>
      </div>
    </form>
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
    <div className="space-y-2">
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
