"use client"

import { useState } from "react"

/** A minimal add-delivery-address form (US3). Collapsed behind a toggle; required fields validated. */
export function AddressForm({
  onSubmit,
  busy,
}: {
  onSubmit: (payload: Record<string, unknown>) => void
  busy: boolean
}) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    recipientName: "",
    line1: "",
    line2: "",
    city: "",
    region: "",
    postalCode: "",
  })

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 text-sm font-medium text-primary hover:underline"
      >
        + Add a delivery address
      </button>
    )
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const valid = form.recipientName && form.line1 && form.city && form.postalCode

  return (
    <div className="mt-3 space-y-2 rounded-md border p-4">
      <Field placeholder="Recipient name" value={form.recipientName} onChange={set("recipientName")} />
      <Field placeholder="Address line 1" value={form.line1} onChange={set("line1")} />
      <Field placeholder="Address line 2 (optional)" value={form.line2} onChange={set("line2")} />
      <div className="grid grid-cols-2 gap-2">
        <Field placeholder="City" value={form.city} onChange={set("city")} />
        <Field placeholder="State/Region" value={form.region} onChange={set("region")} />
      </div>
      <Field placeholder="Postal code" value={form.postalCode} onChange={set("postalCode")} />
      <button
        type="button"
        disabled={!valid || busy}
        onClick={() =>
          onSubmit({
            recipientName: form.recipientName,
            line1: form.line1,
            line2: form.line2 || null,
            city: form.city,
            region: form.region || null,
            postalCode: form.postalCode,
            makeDefault: true,
          })
        }
        className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        Save address
      </button>
    </div>
  )
}

function Field({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <input
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      className="h-10 w-full rounded-md border px-3 text-sm"
    />
  )
}
