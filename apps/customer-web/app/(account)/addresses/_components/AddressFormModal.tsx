"use client"

import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@effy/design-system/ui"

import type { Address } from "@/lib/addresses/model"

import { AddressForm } from "./AddressForm"

/**
 * The add / edit address form mounted in a {@link ResponsiveModal} — a Dialog at/above the 768px
 * breakpoint and a bottom Drawer below it (FR-007). The form itself lives in {@link AddressForm}; this
 * is only the responsive container plus its header. `address` present → edit; absent → add.
 *
 * The content unmounts when closed, so `AddressForm` is mounted fresh on each open (add) or from the
 * stored values (edit) with no explicit re-seed — SC-009's "reopening starts fresh / from stored".
 * Dismissing saves nothing: no request is made until Save succeeds, and there is no draft persistence.
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
  const editing = !!address
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

        <div className="px-4 pb-4 md:px-0">
          <AddressForm
            address={address}
            onSaved={(saved) => {
              onSaved(saved)
              onOpenChange(false)
            }}
            onCancel={() => onOpenChange(false)}
          />
        </div>
      </ResponsiveModalContent>
    </ResponsiveModal>
  )
}
