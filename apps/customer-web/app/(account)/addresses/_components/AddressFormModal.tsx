"use client"

import { Dialog, useDialogOpen } from "@/components/ui/dialog"
import type { Address } from "@/lib/addresses/model"

import { AddressForm } from "./AddressForm"

/** Add or edit an address in a dialog (centred from `md`, a bottom sheet on a phone). The form exists only while open, so each opening starts fresh. */
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
