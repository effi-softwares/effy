"use client"

import { useCallback, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { PASSWORD_MIN_LENGTH } from "@effy/shared-types"

import { markCodeSent } from "@/lib/otp-cooldown"

import { authErrorMessage, startPasswordReset } from "../_lib/auth-actions"
import { useStepHistory } from "../_lib/step-history"
import { useFieldValidation, type FieldConfig } from "../_lib/validation"
import { CodeStep, type CodeOutcome } from "../_components/CodeStep"
import {
  ErrorNote,
  Field,
  inlineActionClass,
  PasswordField,
  StepShell,
  Submit,
} from "../_components/AuthKit"
// 012 FR-022b — a SERVER ACTION, not an Amplify call. The backend screens the new password against
// breach corpora (which the browser cannot be trusted to do) and records that a password now exists
// (which Cognito cannot be asked). See _lib/recovery-actions.ts.
import { finishPasswordReset } from "../_lib/recovery-actions"

/**
 * Password recovery (FR-014) — regain access by proving control of the verified email.
 *
 * ⚠ OPEN SPIKE (research D17, task T053). It is NOT established whether a customer who registered
 * via the email-OTP route — and therefore NEVER SET A PASSWORD — can use this flow to set their
 * first one. Cognito's documentation is silent. If it turns out they cannot, the supported path is
 * an authorized `AdminSetUserPassword` after an OTP-authenticated session (the same Cognito-first
 * admin-write shape as 006/009), and this form needs a companion route.
 *
 * Until the spike settles it, a passwordless customer who lands here may hit a wall — which is why
 * the copy points them back to the code route rather than leaving them stranded (FR-015).
 */
const FIELDS = {
  email: {
    rules: [
      { kind: "required", message: "Enter your email address." },
      { kind: "emailShape", message: "That doesn't look like an email address. Mind checking it?" },
    ],
  },
  password: {
    trim: false,
    rules: [
      { kind: "required", message: "Choose a new password." },
      {
        kind: "minLength",
        min: PASSWORD_MIN_LENGTH,
        message: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
      },
    ],
  },
} satisfies Record<string, FieldConfig>

export function ResetPasswordForm() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const validation = useFieldValidation(FIELDS)

  const codeSent = useRef(false)
  const { step, go, back } = useStepHistory<"email" | "code" | "password">("email", {
    canEnter: (target) => (target === "email" ? true : codeSent.current),
  })

  // ⚠ Trimmed AND lowercased — Cognito's per-user throttle and the platform's own rate limit both key
  // on the address, and two casings would be two buckets.
  const address = email.trim().toLowerCase()

  const sendCode = useCallback(async () => {
    await startPasswordReset(address)
    codeSent.current = true
    // ⚠ 044 D-22 — THIS LINE WAS MISSING, AND PASSWORD RESET HAD NO RESEND COOLDOWN AT ALL.
    //
    // Sign-in and sign-up both mark the send; this route never did. The cooldown clock therefore
    // never started here, so the code step showed no countdown and offered "Send another code"
    // immediately and repeatedly — against a platform budget of FIVE sends per address per clock
    // hour, after which the trigger silently refuses while still returning a normal-looking
    // challenge. A shopper tapping resend three times would spend their whole hour and then wait for
    // a code that was never sent.
    //
    // ⚠ `e2e/otp-entry.spec.ts` HAS ASSERTED THE COUNTDOWN SINCE 035 and reaches the code step
    // through THIS route. It never caught it because Playwright is not part of `pnpm test` — it
    // needs a built server and this repo runs it by hand. The test was right the whole time.
    markCodeSent()
  }, [address])

  /**
   * ⚠ THE CODE IS COLLECTED HERE AND SPENT ONE STEP LATER — it is deliberately NOT verified in
   * between, and that is a requirement rather than a shortcut.
   *
   * 012's FR-022b makes recovery finish at the BACKEND with the code and the new password in ONE
   * request, because a separate "verify the code" call would mint a *"you may now set a password"*
   * state that is worth stealing. So this step holds the code and moves on; if it was wrong, the
   * refusal arrives when the password is submitted.
   *
   * That is a real cost — a mistyped code is reported one screen later than the shopper would like —
   * and it is the same shape the signed-in password flow already uses. Splitting recovery into steps
   * is what makes each screen one decision; verifying the code separately is what security forbids.
   */
  const holdCode = useCallback(
    async (submitted: string): Promise<CodeOutcome> => {
      setCode(submitted)
      go("password")
      return "accepted"
    },
    [go],
  )

  if (step === "code") {
    // ⚠ 044 FR-017 — ONE ERROR REGION. This used to render its own <ErrorNote> here, OUTSIDE the
    // step shell (above the back control, detached from the layout) while CodeStep rendered a second
    // one inside it. Both were role="alert"; both could be true at once; both announced. The journey's
    // message is now handed to the step, which owns the single region (defect D-05).
    return (
      <CodeStep
        parentError={error}
        destination={address}
        submitLabel="Continue"
        submitTestId="submit-reset-code"
        onSubmit={holdCode}
        onResend={sendCode}
        onChangeEmail={back}
        onBack={back}
        flow="reset"
        distinguishableRefusals
      />
    )
  }

  if (step === "password") {
    return (
      <StepShell
        anchor
        title="Choose a new password"
        subtitle="Almost done — pick something you'll remember."
        onBack={back}
        bottom={
          <Submit
            pending={pending}
            label="Set new password"
            testId="submit-reset"
            blocked={password.length < PASSWORD_MIN_LENGTH}
            // ⚠ FR-020 — pressing an unavailable action must SAY what is missing.
            onBlocked={() => validation.check([["password", password]])}
            form="reset-password-form"
          />
        }
      >
        {error && <ErrorNote>{error}</ErrorNote>}
        <form
          id="reset-password-form"
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            setError(null)
            if (!validation.check([["password", password]])) return
            start(async () => {
              // ⚠ Code AND password, together, in one request (012 FR-022b).
              const res = await finishPasswordReset(address, code, password)
              if (!res.ok) {
                setError(res.error)
                return
              }
              // 012 FR-024 — a password change ends every session, so sign-in is the only way on.
              router.replace("/sign-in?reason=password-changed")
            })
          }}
        >
          <PasswordField
            label="New password"
            id="password"
            value={password}
            onChange={setPassword}
            onBlur={() => validation.blur("password", password)}
            error={validation.show("password", password)}
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            required
            // ⚠ FR-016 — reflected while they type, not only refused at the end.
            hint={
              password.length > 0 && password.length < PASSWORD_MIN_LENGTH
                ? `${password.length} of ${PASSWORD_MIN_LENGTH} characters.`
                : `At least ${PASSWORD_MIN_LENGTH} characters. Use anything you like — no special characters required.`
            }
          />
        </form>
      </StepShell>
    )
  }

  return (
    <StepShell
        anchor
      title="Reset your password"
      subtitle="Enter your email and we'll send you a code."
      bottom={
        <>
          <Submit
            pending={pending}
            label="Send code"
            testId="submit-reset-email"
            form="reset-email-form"
          />
          {/* ⚠ Load-bearing, not a footnote: a customer who registered by code has NEVER set a
              password, and this is the line that stops them hammering a recovery flow that may not
              be able to help them (036 FR-015). */}
          <p className="text-center text-sm font-medium text-muted-foreground">
            Never set a password?{" "}
            <Link href="/sign-in" className={inlineActionClass}>
              Sign in with an email code instead
            </Link>
          </p>
        </>
      }
    >
      {error && <ErrorNote>{error}</ErrorNote>}
      <form
        id="reset-email-form"
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          // ⚠ Nothing is sent until this passes. On the shipped build `person@example` reached
          // Cognito from here and came back a 400 (BASELINE.md).
          if (!validation.check([["email", address]])) return
          start(async () => {
            try {
              await sendCode()
              go("code")
            } catch (err) {
              setError(authErrorMessage(err, "code"))
            }
          })
        }}
      >
        <Field
          label="Email"
          id="email"
          type="email"
          value={email}
          onChange={setEmail}
          onBlur={() => validation.blur("email", email)}
          error={validation.show("email", address)}
          autoComplete="username"
          required
        />
      </form>
    </StepShell>
  )
}
