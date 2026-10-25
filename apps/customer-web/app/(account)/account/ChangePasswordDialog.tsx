"use client"

import { useEffect, useState, useTransition } from "react"

import { ResponsiveModal, ResponsiveModalContent, ResponsiveModalDescription, ResponsiveModalFooter, ResponsiveModalHeader, ResponsiveModalTitle } from "@effy/design-system/ui"
import { Button } from "@/components/ui/button"

import { PasswordField } from "./PasswordField"
import { writePassword } from "./actions"

/**
 * Changes an existing password. The current password is required, so a borrowed or stolen session
 * cannot lock the owner out; Cognito verifies it and refuses with `NotAuthorizedException`. Built on
 * `ResponsiveModal`, like the field editor and the address form.
 */
export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // Cleared on every open: the overlay stays mounted, and an abandoned password must not linger.
  useEffect(() => {
    if (open) {
      setCurrent("")
      setNext("")
      setError(null)
    }
  }, [open])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      // On success this redirects: every session is revoked, this one included.
      const res = await writePassword({
        mode: "change",
        currentPassword: current,
        newPassword: next,
      })
      if (!res.ok) setError(res.error)
    })
  }

  return (
    <ResponsiveModal
      open={open}
      // No dismissal mid-request, or the customer cannot tell whether the change landed.
      onOpenChange={(nextOpen) => {
        if (pending) return
        onOpenChange(nextOpen)
      }}
    >
      <ResponsiveModalContent data-testid="change-password-dialog">
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>Change password</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            Enter your current password, then choose a new one.
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        {/* The form is addressed by id from the footer's submit, keeping Enter-to-submit. */}
        <form id="change-password-form" onSubmit={submit} className="space-y-4">
          <PasswordField
            name="currentPassword"
            label="Current password"
            autoComplete="current-password"
            value={current}
            onChange={setCurrent}
          />

          <PasswordField
            name="newPassword"
            label="New password"
            autoComplete="new-password"
            value={next}
            onChange={setNext}
          />

          {/* In the form, next to what went wrong; never a toast. */}
          {error && (
            <p role="alert" data-testid="password-error" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <p className="text-sm text-foreground/80">
            Changing your password will sign you out on every device, including this one. We&rsquo;ll
            ask you to sign in again with the new one.
          </p>
        </form>

        {/* Cancel on the left as a ghost, submit on the right, so a mis-tap does not discard the form. */}
        <ResponsiveModalFooter className="mt-6 flex flex-row justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="change-password-form"
            disabled={pending || !current || !next}
            aria-busy={pending}
            data-testid="submit-change-password"
          >
            {pending ? "Changing…" : "Change password"}
          </Button>
        </ResponsiveModalFooter>
      </ResponsiveModalContent>
    </ResponsiveModal>
  )
}
