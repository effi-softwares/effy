import { useEffect, useState } from "react"

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
  Textarea,
} from "@effy/design-system/ui"
import type { SupplierDTO } from "@effy/shared-types"

import { productMutationError } from "@/features/catalog/errorText"

import { useCreateSupplier, useUpdateSupplier } from "./queries"

/**
 * Record or edit a supplier (US6, T057).
 *
 * ⚠ EDITING SENDS ONLY WHAT CHANGED, and an emptied field is sent as an explicit `null`. The backend
 * distinguishes "leave alone" (key absent) from "clear it" (key present, null) — 056 shipped the
 * defect where those two collapsed and a field once set could never be emptied again. Sending the
 * whole form every time would also make one operator's save silently revert another's.
 */
export function SupplierSheet({
  supplier,
  open,
  onOpenChange,
}: {
  supplier: SupplierDTO | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const create = useCreateSupplier()
  const update = useUpdateSupplier()

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setName(supplier?.name ?? "")
    setEmail(supplier?.contactEmail ?? "")
    setPhone(supplier?.contactPhone ?? "")
    setNotes(supplier?.notes ?? "")
    setError(null)
  }, [supplier, open])

  const busy = create.isPending || update.isPending

  function save() {
    setError(null)
    const done = { onSuccess: () => onOpenChange(false), onError: (e: unknown) => setError(productMutationError(e)) }

    if (!supplier) {
      create.mutate(
        {
          name: name.trim(),
          contactEmail: email.trim() || null,
          contactPhone: phone.trim() || null,
          notes: notes.trim() || null,
        },
        done,
      )
      return
    }

    // Only the fields the operator actually changed. `null` where they emptied one.
    const body: Record<string, string | null> = {}
    if (name.trim() !== supplier.name) body.name = name.trim()
    if ((email.trim() || null) !== supplier.contactEmail) body.contactEmail = email.trim() || null
    if ((phone.trim() || null) !== supplier.contactPhone) body.contactPhone = phone.trim() || null
    if ((notes.trim() || null) !== supplier.notes) body.notes = notes.trim() || null

    update.mutate({ id: supplier.id, body }, done)
  }

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange}>
      <ResponsiveModalContent className="sm:max-w-md">
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>{supplier ? "Edit supplier" : "Add supplier"}</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            Who you restock from. Products you assign to a supplier are grouped together on this
            screen so one order covers one trip.
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="supplier-name">
              Name<span className="text-destructive ml-0.5">*</span>
            </Label>
            <Input id="supplier-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="supplier-email">Email</Label>
              <Input id="supplier-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplier-phone">Phone</Label>
              <Input id="supplier-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="supplier-notes">Notes</Label>
            <Textarea id="supplier-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
        </div>

        <ResponsiveModalFooter>
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy || name.trim() === ""} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </ResponsiveModalFooter>
      </ResponsiveModalContent>
    </ResponsiveModal>
  )
}
