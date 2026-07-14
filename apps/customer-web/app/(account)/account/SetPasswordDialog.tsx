"use client"

import { useState, useTransition } from "react"

import { PasswordField } from "./PasswordField"
import { requestPasswordChallenge, writePassword } from "./actions"

/**
 * SET A FIRST PASSWORD (012 FR-017) — the flow this whole slice exists to get right.
 *
 * ⚠⚠ WHY THIS COSTS AN EMAIL ROUND TRIP WHEN THE CUSTOMER IS *ALREADY SIGNED IN* ⚠⚠
 *
 * It looks like friction for nothing. It is not. This customer has NEVER had a password, so there is
 * no current password to prove — which means the only thing standing between a session and a
 * permanent new credential is whatever we decide to require.
 *
 * And Cognito, left to itself, requires NOTHING: its own docs say `PreviousPassword` may be omitted
 * when the user has none. So a borrowed phone, a shared laptop, or a stolen token could silently
 * plant a permanent password on the account — converting a TRANSIENT foothold into DURABLE,
 * CREDENTIALED access. The true owner, who only ever signs in with an emailed code, would never
 * notice. That is an account-takeover primitive, and it is on by default.
 *
 * So the code re-proves the one thing a session cannot: that the person driving it still holds the
 * account's inbox.
 *
 * ── THE TWO STEPS ARE NOT TWO GRANTS ──────────────────────────────────────────────────────────
 *
 * Step 1 SENDS a code. It grants nothing, stores nothing, and mints nothing.
 * Step 2 submits the code AND the new password TOGETHER, in ONE backend request, where the code is
 * verified immediately before the password is written.
 *
 * There is deliberately no "verified — you may now set a password" state in between. That state
 * would be a fresh credential sitting around waiting to be stolen, and it is exactly what most
 * implementations of this flow accidentally create.
 */
export function SetPasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [sent, setSent] = useState<string | null>(null) // the masked destination
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (!open) return null

  function send() {
    setError(null)
    start(async () => {
      const res = await requestPasswordChallenge()
      if (res.ok) setSent(res.maskedDestination)
      else setError(res.error)
    })
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      // On success this REDIRECTS (every session is revoked, including this one — FR-024), so
      // control does not come back here.
      const res = await writePassword({ mode: "set", code, newPassword: password })
      if (!res.ok) setError(res.error)
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="set-password-title"
      data-testid="set-password-dialog"
      className="mt-4 rounded-lg border bg-card p-6"
    >
      <h3 id="set-password-title" className="text-base font-medium">
        Set a password
      </h3>

      {!sent ? (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            For your security, we&rsquo;ll email you a code first. Being signed in isn&rsquo;t enough
            to add a password to your account.
          </p>
          {error && <ErrorText>{error}</ErrorText>}
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={send}
              disabled={pending}
              aria-busy={pending}
              data-testid="send-code"
              className="h-11 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Sending…" : "Email me a code"}
            </button>
            <Cancel onCancel={() => onOpenChange(false)} />
          </div>
        </>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            We sent a code to <strong>{sent}</strong>. Enter it below, and choose your new password.
          </p>

          <div className="space-y-2">
            <label htmlFor="stepup-code" className="text-sm font-medium">
              Code from your email
            </label>
            <input
              id="stepup-code"
              name="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              data-testid="stepup-code"
              className="h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <PasswordField
            name="newPassword"
            label="New password"
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
          />

          {error && <ErrorText>{error}</ErrorText>}

          <p className="text-sm text-muted-foreground">
            Setting a password will sign you out everywhere. You can still sign in with an emailed
            code afterwards — adding a password doesn&rsquo;t take that away.
          </p>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={pending || !code || !password}
              aria-busy={pending}
              data-testid="submit-set-password"
              className="h-11 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Setting…" : "Set password"}
            </button>
            <Cancel onCancel={() => onOpenChange(false)} />
          </div>
        </form>
      )}
    </div>
  )
}

/**
 * Errors render IN the form, next to what went wrong — never as a toast (FR-027).
 *
 * `role="alert"` so a screen reader announces it without the customer having to go looking. A toast
 * is passive notification; an error the customer must ACT on is not a notification.
 */
function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" data-testid="password-error" className="mt-3 text-sm text-destructive">
      {children}
    </p>
  )
}

function Cancel({ onCancel }: { onCancel: () => void }) {
  return (
    <button
      type="button"
      onClick={onCancel}
      className="h-11 rounded-md px-6 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      Cancel
    </button>
  )
}
