"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@effy/design-system/ui"

/**
 * Delete confirmation (US4), with two faces:
 *
 *  • **confirm** — a normal "are you sure?" with a destructive Delete action (FR-015).
 *  • **blocked** — the customer is trying to delete their default while other addresses exist. There
 *    is NO delete action, only guidance to set another default first (FR-016a). The server enforces
 *    the same rule (409) — this is the UX half, and the 409 is its backstop for a racing device.
 */
export function DeleteAddressDialog({
  open,
  onOpenChange,
  blocked,
  busy,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  blocked: boolean
  busy: boolean
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        {blocked ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Set another default first</AlertDialogTitle>
              <AlertDialogDescription>
                This is your default delivery address. Choose another address as your default, then you
                can delete this one.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Got it</AlertDialogCancel>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this address?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the address from your account. Orders you’ve already placed keep their own
                delivery address and are unaffected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  // Keep the dialog mounted while the request runs; the list closes it on success.
                  e.preventDefault()
                  onConfirm()
                }}
                disabled={busy}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                {busy ? "Deleting…" : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
