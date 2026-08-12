"use client"

import { useEffect, useState, useTransition } from "react"

import {
  Button,
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@effy/design-system/ui"

import { PasswordField } from "./PasswordField"
import { writePassword } from "./actions"

/**
 * CHANGE AN EXISTING PASSWORD (012 FR-016).
 *
 * ⚠ THE CURRENT PASSWORD IS REQUIRED, AND HOLDING A SESSION IS NOT ENOUGH.
 *
 * Same threat as the set flow, one step milder: without it, anyone who gets hold of a live session
 * — a borrowed laptop, an XSS'd token, an unlocked phone — can lock the real owner out of their own
 * account by changing the password from under them. OWASP is explicit: require the current
 * credentials before updating sensitive account information.
 *
 * Here the current password IS the step-up factor, so no emailed code is needed. Cognito verifies it
 * server-side and refuses with `NotAuthorizedException` — we never compare passwords ourselves.
 *
 * ── The container ─────────────────────────────────────────────────────────────────────────────
 *
 * Built on the EXISTING `ResponsiveModal` from the design system — a centred Dialog at/above the
 * mobile breakpoint, a bottom Drawer below it — the same container `FieldEditor` and the address
 * form already use, rather than growing a third overlay (Principle II). It replaces an inline panel
 * that declared `role="dialog" aria-modal="true"` while being neither: it trapped no focus, closed
 * on no Escape, and left the page behind it fully reachable, so the promise the markup made to a
 * screen reader was one the DOM did not keep.
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

  // ⚠ Clear on every open. The overlay now stays mounted across open/close, so without this a
  // password typed and abandoned would still be sitting in the field — and in memory — next time.
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
      // On success this REDIRECTS — every session is revoked, including this one (FR-024).
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
      // A dismissal mid-request would leave the customer with no idea whether the change landed.
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

        {/* The submit control lives in the footer, so the form is addressed by id — that keeps
            Enter-to-submit working rather than making the button a bare onClick. */}
        <form id="change-password-form" onSubmit={submit} className="space-y-4 px-4 sm:px-0">
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

          {/* FR-027 — in the form, next to what went wrong. Never a toast the customer can miss. */}
          {error && (
            <p role="alert" data-testid="password-error" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <p className="text-sm text-muted-foreground">
            Changing your password will sign you out on every device, including this one. We&rsquo;ll
            ask you to sign in again with the new one.
          </p>
        </form>

        {/* ⚠ Submit first, Cancel BELOW it and de-weighted — the same order `FieldEditor` uses, for
            the same reason: on a phone Cancel sits under the thumb's resting position, so two
            equally-weighted filled buttons turn a mis-tap into a discarded form. */}
        <ResponsiveModalFooter className="flex flex-col gap-2 sm:flex-col">
          <Button
            type="submit"
            form="change-password-form"
            disabled={pending || !current || !next}
            aria-busy={pending}
            data-testid="submit-change-password"
            className="w-full"
          >
            {pending ? "Changing…" : "Change password"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
            className="w-full"
          >
            Cancel
          </Button>
        </ResponsiveModalFooter>
      </ResponsiveModalContent>
    </ResponsiveModal>
  )
}
