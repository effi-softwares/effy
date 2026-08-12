"use client"

import { useEffect, useState, useTransition } from "react"

import {
  Button,
  OTP_LENGTH,
  OtpInput,
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@effy/design-system/ui"

import { useCodeResend } from "@/app/(auth)/_lib/use-code-resend"
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
 * ── THE THREE UI STEPS ARE STILL ONLY TWO GRANTS ──────────────────────────────────────────────
 *
 * The customer moves through three screens — request a code, enter the code, choose a password — but
 * the backend still sees exactly two calls:
 *
 * Step 1 (`intro`)     SENDS a code. It grants nothing, stores nothing, mints nothing.
 * Steps 2–3 (`code` → `password`) are a CLIENT-ONLY wizard. Entering the code and moving to the
 *                      password screen does NOT verify anything server-side — it just carries the
 *                      typed code forward in component state.
 * The final submit sends the code AND the new password TOGETHER, in ONE backend request, where the
 *                      code is verified immediately before the password is written.
 *
 * ⚠ DO NOT add a server call between the code screen and the password screen to "verify early". That
 * intermediate "verified — you may now set a password" state is precisely the fresh, stealable
 * credential this design exists to avoid. The two screens are cosmetic; the atomic write is not.
 */
type Step = "intro" | "code" | "password"

export function SetPasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [step, setStep] = useState<Step>("intro")
  const [sent, setSent] = useState<string | null>(null) // the masked destination
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const tooLong = code.length > OTP_LENGTH
  const complete = code.length === OTP_LENGTH

  // Resend, sharing the platform's per-address cooldown + hourly ceiling with the sign-in code step.
  // `onSend` re-issues the SAME step-up challenge; it throws on failure so the hook does not start a
  // cooldown or count a send for a request that sent nothing.
  const resend = useCodeResend({
    onSend: async () => {
      const res = await requestPasswordChallenge()
      if (!res.ok) {
        setError(res.error)
        throw new Error(res.error)
      }
      setSent(res.maskedDestination)
      setError(null)
    },
  })

  // ⚠ Reset on every open. The overlay now stays mounted across open/close, so without this an
  // abandoned code or password would still be sitting in the fields — and in memory — next time.
  useEffect(() => {
    if (open) {
      setStep("intro")
      setSent(null)
      setCode("")
      setPassword("")
      setError(null)
    }
  }, [open])

  function send() {
    setError(null)
    start(async () => {
      const res = await requestPasswordChallenge()
      if (res.ok) {
        setSent(res.maskedDestination)
        setStep("code")
        // Start the shared cooldown so the resend timer counts down from this first send.
        resend.noteSent()
      } else {
        setError(res.error)
      }
    })
  }

  // Client-only advance. No backend call — the code is only VERIFIED at the atomic write below.
  function continueToPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!complete) return
    setError(null)
    setStep("password")
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      // On success this REDIRECTS (every session is revoked, including this one — FR-024), so
      // control does not come back here.
      const res = await writePassword({ mode: "set", code, newPassword: password })
      // A wrong/expired code surfaces here — send the customer back to the code step to re-enter it.
      if (!res.ok) {
        setError(res.error)
        setStep("code")
      }
    })
  }

  return (
    <ResponsiveModal
      open={open}
      // A dismissal mid-request would leave the customer with no idea whether the code was sent or
      // the password landed.
      onOpenChange={(nextOpen) => {
        if (pending) return
        onOpenChange(nextOpen)
      }}
    >
      <ResponsiveModalContent data-testid="set-password-dialog">
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>Set a password</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            {step === "intro" &&
              "For your security, we’ll email you a code first. Being signed in isn’t enough to add a password to your account."}
            {step === "code" && (
              <>
                We sent a code to <strong>{sent}</strong>. Enter it below to continue.
              </>
            )}
            {step === "password" && "Choose a new password for your account."}
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        {/* ── STEP 1 · request the code ──────────────────────────────────────────────────────── */}
        {step === "intro" && (
          <>
            {error && (
              <div className="px-4 sm:px-0">
                <ErrorText>{error}</ErrorText>
              </div>
            )}
            <ResponsiveModalFooter className="mt-6 flex flex-row justify-end gap-3">
              <Cancel onCancel={() => onOpenChange(false)} disabled={pending} />
              <Button
                type="button"
                onClick={send}
                disabled={pending}
                aria-busy={pending}
                data-testid="send-code"
              >
                {pending ? "Sending…" : "Email me a code"}
              </Button>
            </ResponsiveModalFooter>
          </>
        )}

        {/* ── STEP 2 · enter the code (client-only advance) ──────────────────────────────────── */}
        {step === "code" && (
          <>
            <form id="set-password-code-form" onSubmit={continueToPassword} className="px-4 sm:px-0">
              {/* ⚠ Explicit margin rather than `space-y` — the label heads a tall cell control and
                  needs room to read as one, while the message below must stay tight to the field. */}
              <label htmlFor="stepup-code" className="mb-4 block text-sm font-medium">
                Code from your email
              </label>
              <OtpInput
                id="stepup-code"
                name="code"
                // Centre the fixed-size cells within the full-width field (scoped to this dialog —
                // the class lands on the OtpInput's `w-full` wrapper, so the transparent input still
                // covers the whole field; only the visible cell row is centred).
                className="flex justify-center"
                // ⚠ The cells collapse to a plain field when the value is too long. Six positions can
                // only show six characters, so an 8-digit paste rendered as cells would LOOK like a
                // six-digit code — visually reproducing the truncation FR-004 forbids.
                variant={tooLong ? "plain" : "cells"}
                aria-invalid={tooLong || error !== null}
                aria-describedby={tooLong ? "stepup-code-too-long" : undefined}
                autoFocus
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, ""))
                  setError(null)
                }}
                data-testid="stepup-code"
              />

              {tooLong && (
                <p id="stepup-code-too-long" className="mt-2 text-center text-sm text-destructive">
                  That&rsquo;s {code.length} digits. An Effy code is always {OTP_LENGTH}.
                </p>
              )}

              {/* Resend, with the shared cooldown timer. `aria-live` so the countdown is announced
                  without moving focus off the code field. */}
              <p className="mt-4 text-center text-sm text-muted-foreground" aria-live="polite">
                {resend.atCeiling ? (
                  <span data-testid="resend-ceiling">
                    We can&rsquo;t send another code to this address right now. Please try again later.
                  </span>
                ) : resend.remaining > 0 ? (
                  <span data-testid="resend-countdown">Resend code in {resend.remaining}s</span>
                ) : (
                  <>
                    Didn&rsquo;t get it?{" "}
                    <button
                      type="button"
                      onClick={() => void resend.resend().catch(() => {})}
                      disabled={!resend.canResend}
                      data-testid="resend-code"
                      className="font-medium text-foreground underline underline-offset-2 hover:no-underline disabled:opacity-50"
                    >
                      {resend.sending ? "Sending…" : "Resend code"}
                    </button>
                  </>
                )}
              </p>

              {/* A wrong code from the previous submit lands the customer back here, so show it. */}
              {error && (
                <div className="mt-3">
                  <ErrorText>{error}</ErrorText>
                </div>
              )}
            </form>

            <ResponsiveModalFooter className="mt-6 flex flex-row justify-end gap-3">
              <Cancel onCancel={() => onOpenChange(false)} disabled={pending} />
              <Button
                type="submit"
                form="set-password-code-form"
                disabled={!complete}
                data-testid="continue-to-password"
              >
                Continue
              </Button>
            </ResponsiveModalFooter>
          </>
        )}

        {/* ── STEP 3 · choose the password (the atomic code+password write) ──────────────────── */}
        {step === "password" && (
          <>
            {/* The submit control lives in the footer, so the form is addressed by id — that keeps
                Enter-to-submit working rather than making the button a bare onClick. */}
            <form id="set-password-form" onSubmit={submit} className="space-y-4 px-4 sm:px-0">
              <PasswordField
                name="newPassword"
                label="New password"
                autoComplete="new-password"
                value={password}
                onChange={setPassword}
              />

              {/* FR-027 — in the form, next to what went wrong. Never a toast the customer can miss. */}
              {error && <ErrorText>{error}</ErrorText>}

              <p className="text-sm text-foreground/80">
                Setting a password will sign you out everywhere. You can still sign in with an emailed
                code afterwards — adding a password doesn’t take that away.
              </p>
            </form>

            {/* Secondary action (Back) on the LEFT, de-weighted as a ghost; the primary on the RIGHT.
                The ghost weighting is what keeps a mis-tap from being a discarded form. */}
            <ResponsiveModalFooter className="mt-6 flex flex-row justify-end gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setError(null)
                  setStep("code")
                }}
                disabled={pending}
              >
                Back
              </Button>
              <Button
                type="submit"
                form="set-password-form"
                disabled={pending || !code || !password}
                aria-busy={pending}
                data-testid="submit-set-password"
              >
                {pending ? "Setting…" : "Set password"}
              </Button>
            </ResponsiveModalFooter>
          </>
        )}
      </ResponsiveModalContent>
    </ResponsiveModal>
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
    <p role="alert" data-testid="password-error" className="text-sm text-destructive">
      {children}
    </p>
  )
}

function Cancel({ onCancel, disabled }: { onCancel: () => void; disabled?: boolean }) {
  return (
    <Button type="button" variant="ghost" onClick={onCancel} disabled={disabled}>
      Cancel
    </Button>
  )
}
