"use client"

import { useState, useTransition } from "react"

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

  if (!open) return null

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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-password-title"
      data-testid="change-password-dialog"
      className="mt-4 rounded-lg border bg-card p-6"
    >
      <h3 id="change-password-title" className="text-base font-medium">
        Change password
      </h3>

      <form onSubmit={submit} className="mt-4 space-y-4">
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

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={pending || !current || !next}
            aria-busy={pending}
            data-testid="submit-change-password"
            className="h-11 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Changing…" : "Change password"}
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-11 rounded-md px-6 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
