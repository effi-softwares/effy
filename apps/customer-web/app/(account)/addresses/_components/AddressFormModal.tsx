"use client"

import { Dialog, useDialogOpen } from "@/components/ui/dialog"
import type { Address } from "@/lib/addresses/model"

import { AddressForm } from "./AddressForm"

/**
 * Add or edit an address in a dialog (reference: Account · Edit address): centred from `md`, a sheet
 * from the bottom edge on a phone.
 *
 * ⚠ THE FORM EXISTS ONLY WHILE THE DIALOG IS OPEN, so each opening starts from the address it was
 * given (or from blank) — never from what was typed and abandoned last time (SC-009).
 */
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
  const dialog = useDialogOpen(open)
  const editing = !!address
  return (
    <Dialog
      ref={dialog}
      size="lg"
      title={editing ? "Edit address" : "Add address"}
      description={editing ? "Changes apply to future orders only." : "Save a delivery address to your account."}
      onClose={() => onOpenChange(false)}
    >
      {open && (
        <AddressForm
          address={address}
          onSaved={(saved) => {
            onSaved(saved)
            onOpenChange(false)
          }}
          onCancel={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  )
}
