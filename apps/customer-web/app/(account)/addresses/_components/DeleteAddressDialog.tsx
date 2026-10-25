"use client"

import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"

/**
 * Delete an address, or be told why this one cannot go yet: the default cannot be deleted while others
 * exist, so checkout always has one. Placed orders keep their own copy.
 */
type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  blocked: boolean
  busy: boolean
  onConfirm: () => void
}

/** Nothing is on the page until the question is asked. */
export function DeleteAddressDialog(props: Props) {
  return props.open ? <Question {...props} /> : null
}

function Question({ open, onOpenChange, blocked, busy, onConfirm }: Props) {
  const close = () => onOpenChange(false)
  return blocked ? (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      alert
      title="Set another default first"
      description="This is your default delivery address. Choose another address as your default, then you can delete this one."
      footer={
        <Button type="button" variant="outline" onClick={close}>
          Got it
        </Button>
      }
    />
  ) : (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      alert
      title="Delete this address?"
      description="This removes the address from your account. Orders you’ve already placed keep their own delivery address and are unaffected."
      footer={
        <>
          <Button type="button" variant="outline" disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={busy} onClick={onConfirm}>
            {busy ? "Deleting…" : "Delete"}
          </Button>
        </>
      }
    />
  )
}
