"use client"

import { useEffect, useState, useTransition } from "react"

import { OTP_LENGTH, ResponsiveModal, ResponsiveModalContent, ResponsiveModalDescription, ResponsiveModalFooter, ResponsiveModalHeader, ResponsiveModalTitle } from "@effy/design-system/ui"

import { CodeField } from "@/components/storefront/CodeField"
import { Button } from "@/components/ui/button"

import { useCodeResend } from "@/app/(auth)/_lib/use-code-resend"
import { PasswordField } from "./PasswordField"
import { requestPasswordChallenge, writePassword } from "./actions"

/**
 * Sets a first password. A signed-in customer still proves the inbox with an emailed code: Cognito lets
 * `PreviousPassword` be omitted when there is none, so a borrowed or stolen session could otherwise
 * plant a permanent password.
 *
 * Three screens, two backend calls: `intro` sends a code; `code` → `password` is client-only; the final
 * submit sends the code and the password together, verified immediately before the write. Never add a
 * server call between the code and password screens: that intermediate "verified" state is exactly the
 * stealable credential this avoids.
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
  const [sent, setSent] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const tooLong = code.length > OTP_LENGTH
  const complete = code.length === OTP_LENGTH

  // Resend shares the sign-in code's cooldown and hourly ceiling; `onSend` throws on failure so no cooldown starts for nothing.
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

  // Reset on every open: the overlay stays mounted, and an abandoned code or password must not linger.
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
        // Starts the shared cooldown from this first send.
        resend.noteSent()
      } else {
        setError(res.error)
      }
    })
  }

  // Client-only advance: the code is verified only at the write below.
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
      // On success this redirects (every session is revoked, this one included).
      const res = await writePassword({ mode: "set", code, newPassword: password })
      // A wrong or expired code sends the customer back to the code step.
      if (!res.ok) {
        setError(res.error)
        setStep("code")
      }
    })
  }

  return (
    <ResponsiveModal
      open={open}
      // No dismissal mid-request, or the customer cannot tell whether it landed.
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

        {/* Step 1: request the code */}
        {step === "intro" && (
          <>
            {error && (
              <div>
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

        {/* Step 2: enter the code (client-only) */}
        {step === "code" && (
          <>
            <form id="set-password-code-form" onSubmit={continueToPassword}>
              {/* An explicit margin: the label heads a tall control, the message below stays tight. */}
              <label htmlFor="stepup-code" className="mb-4 block text-sm font-medium">
                Code from your email
              </label>
              <CodeField
                id="stepup-code"
                name="code"
                // An over-length value is shown in full as plain text by the field.
                invalid={error !== null}
                aria-describedby={tooLong ? "stepup-code-too-long" : undefined}
                autoFocus
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, ""))
                  setError(null)
                }}
              />

              {tooLong && (
                <p id="stepup-code-too-long" className="mt-2 text-center text-sm text-destructive">
                  That&rsquo;s {code.length} digits. An Effy code is always {OTP_LENGTH}.
                </p>
              )}

              {/* Resend with the shared cooldown; `aria-live` announces the countdown without moving focus. */}
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

              {/* A wrong code from the previous submit lands here, so show it. */}
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

        {/* Step 3: choose the password (the atomic code + password write) */}
        {step === "password" && (
          <>
            {/* The form is addressed by id from the footer's submit, keeping Enter-to-submit. */}
            <form id="set-password-form" onSubmit={submit} className="space-y-4">
              <PasswordField
                name="newPassword"
                label="New password"
                autoComplete="new-password"
                value={password}
                onChange={setPassword}
              />

              {/* In the form, next to what went wrong; never a toast. */}
              {error && <ErrorText>{error}</ErrorText>}

              <p className="text-sm text-foreground/80">
                Setting a password will sign you out everywhere. You can still sign in with an emailed
                code afterwards — adding a password doesn’t take that away.
              </p>
            </form>

            {/* Back on the left as a ghost, the primary on the right. */}
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

/** An error in the form, next to what went wrong, announced by `role="alert"`; never a toast. */
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
