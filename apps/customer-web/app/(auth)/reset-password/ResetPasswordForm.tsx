"use client"

import { useCallback, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { CircleCheck } from "lucide-react"
import { PASSWORD_MIN_LENGTH } from "@effy/shared-types"

import { btnClass } from "@/components/storefront/actions"
import { markCodeSent } from "@/lib/otp-cooldown"

import { authErrorMessage, startPasswordReset } from "../_lib/auth-actions"
import { useStepHistory } from "../_lib/step-history"
import { useFieldValidation, type FieldConfig } from "../_lib/validation"
import { CodeStep, type CodeOutcome } from "../_components/CodeStep"
import {
  AltJourney,
  ErrorNote,
  Field,
  inlineActionClass,
  PasswordField,
  StepShell,
  Submit,
} from "../_components/AuthKit"
// A Server Action, so the backend screens the password and records that one now exists (_lib/recovery-actions.ts).
import { finishPasswordReset } from "../_lib/recovery-actions"

/**
 * Password recovery by proving control of the verified email. Unverified: whether a customer who
 * registered by code (never set a password) can set a first one here; the copy points them back to the
 * code route.
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
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [finished, setFinished] = useState(false)
  const validation = useFieldValidation(FIELDS)

  const codeSent = useRef(false)
  const { step, go, back } = useStepHistory<"email" | "code" | "password">("email", {
    canEnter: (target) => (target === "email" ? true : codeSent.current),
  })

  // Trimmed and lowercased: the rate limits key on the address.
  const address = email.trim().toLowerCase()

  const sendCode = useCallback(async () => {
    await startPasswordReset(address)
    codeSent.current = true
    // Marks the send, so the resend cooldown runs (five sends per address per hour).
    markCodeSent()
  }, [address])

  /**
   * The code is collected here and spent one step later, with the new password, in one backend request:
   * a separate verify call would mint a stealable "you may set a password" state. A wrong code is
   * therefore reported a screen later.
   */
  const holdCode = useCallback(
    async (submitted: string): Promise<CodeOutcome> => {
      setCode(submitted)
      go("password")
      return "accepted"
    },
    [go],
  )

  // Done. Not "You're signed in": a password change ends every session, so signing in is the way on.
  if (finished) {
    return (
      <StepShell
        icon={<CircleCheck aria-hidden="true" />}
        title="Password updated"
        subtitle="You've been signed out everywhere. Sign in with your new password."
      >
        <div className="space-y-3">
          <Link
            href="/sign-in"
            data-testid="reset-done-sign-in"
            className={btnClass("primary", "lg", "h-11 w-full")}
          >
            Sign in
          </Link>
          <Link href="/" className={btnClass("outline", "lg", "h-11 w-full")}>
            Continue shopping
          </Link>
        </div>
      </StepShell>
    )
  }

  const signInLink = (
    <AltJourney lead="Remembered it?" href="/sign-in">
      Sign in
    </AltJourney>
  )

  if (step === "code") {
    // One error region: the journey's message is handed to the step.
    return (
      <CodeStep
        parentError={error}
        destination={address}
        submitLabel="Continue"
        submitTestId="submit-reset-code"
        onSubmit={holdCode}
        onResend={sendCode}
        onChangeEmail={back}
        flow="reset"
        purpose=" to reset your password"
        footer={signInLink}
        distinguishableRefusals
      />
    )
  }

  if (step === "password") {
    return (
      <StepShell title="Choose a new password" subtitle={<>For {address}</>}>
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
              // Code and password together, in one request.
              const res = await finishPasswordReset(address, code, password)
              if (!res.ok) {
                setError(res.error)
                return
              }
              // A password change ends every session, so sign-in is the only way on.
              setFinished(true)
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
            // Reflected while they type, not only refused at the end.
            hint={
              password.length > 0 && password.length < PASSWORD_MIN_LENGTH
                ? `${password.length} of ${PASSWORD_MIN_LENGTH} characters.`
                : `At least ${PASSWORD_MIN_LENGTH} characters.`
            }
          />
          <Submit pending={pending} label="Save new password" testId="submit-reset" />
        </form>
      </StepShell>
    )
  }

  return (
    <StepShell
      title="Reset your password"
      subtitle="Enter your email and we'll send you a code to reset it."
      footer={
        <div className="space-y-3">
          {signInLink}
          {/* A customer who registered by code has never set a password; this line stops them hammering recovery. */}
          <p className="text-center text-sm text-muted-foreground">
            Never set a password?{" "}
            <Link href="/sign-in" className={inlineActionClass}>
              Sign in with an email code instead
            </Link>
          </p>
        </div>
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
          // Nothing is sent until this passes.
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
        <Submit pending={pending} label="Send reset code" testId="submit-reset-email" />
      </form>
    </StepShell>
  )
}
