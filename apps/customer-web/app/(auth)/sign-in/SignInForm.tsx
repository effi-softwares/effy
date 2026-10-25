"use client"

import { useCallback, useRef, useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { LogIn, ShoppingCart } from "lucide-react"

import { safeNextTarget } from "@/lib/next-target"
import { mergeCartAfterSignIn } from "@/lib/cart-actions"
import { mergeSavedAfterSignIn } from "@/lib/saved-merge"
import { markCodeSent } from "@/lib/otp-cooldown"
import { capture } from "@/lib/telemetry"
import {
  authErrorMessage,
  classifySignInStep,
  isStaleSignInSession,
  logAuthFailure,
  resendSignInCode,
  signInWithOtp,
  signInWithPassword,
  submitOtpCode,
} from "../_lib/auth-actions"
import { HAND_OVER_FAILED, handOverSession } from "../_lib/session-handoff"
import { useStepHistory } from "../_lib/step-history"
import { messageFor, useFieldValidation, type FieldConfig } from "../_lib/validation"
import { CodeStep, type CodeOutcome } from "../_components/CodeStep"
import { GoogleButton } from "../_components/GoogleButton"
import { ReasonNotice } from "../_components/ReasonNotice"
import {
  AltJourney,
  Divider,
  EmailChip,
  ErrorNote,
  Field,
  NoticeCard,
  PasswordField,
  quietActionClass,
  StepShell,
  Submit,
  TextAction,
} from "../_components/AuthKit"

type Step = "identifier" | "password" | "code"

/**
 * Sign-in as a step form: the emailed code first, Google beside it, a password only on request. All
 * steps live on this route (see `_lib/step-history.ts`). The messages never say whether an address has
 * an account, and the password message never hints at a correct password.
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
    rules: [{ kind: "required", message: "Enter your password." }],
  },
} satisfies Record<string, FieldConfig>

export function SignInForm() {
  const router = useRouter()
  const params = useSearchParams()

  // Where they were heading (validated: it arrives in a URL).
  const next = safeNextTarget(params.get("next"))

  /** Why the shopper is here, through `ReasonNotice`'s closed vocabulary; the value is never echoed. */
  const reason = params.get("reason")

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const validation = useFieldValidation(FIELDS)

  // Whether a challenge is live, so a back/forward cannot land on a code form with nothing behind it.
  const challengeLive = useRef(false)

  const { step, go, back } = useStepHistory<Step>("identifier", {
    canEnter: (target) => (target === "code" ? challengeLive.current : true),
  })

  // Trimmed and lowercased: the per-address rate limit keys on `HMAC(email)`.
  const address = email.trim().toLowerCase()

  const run = (fn: () => Promise<void>, context: "password" | "code" = "password") => {
    setError(null)
    start(async () => {
      try {
        await fn()
      } catch (err) {
        logAuthFailure(`sign-in (${context})`, err)
        setError(authErrorMessage(err, context))
      }
    })
  }

  /** Cognito said yes: hand the server the session, and leave only on `true`. */
  const done = useCallback(
    async (route: "password" | "otp"): Promise<boolean> => {
      if (!(await handOverSession())) {
        setError(HAND_OVER_FAILED)
        return false
      }
      capture({ name: "sign_in_completed", props: { route } })
      // Fold this browser's cart into the account cart (union with maximum quantity). Not awaited; the cart page reconciles anyway.
      void mergeCartAfterSignIn()
      // And the saved list.
      void mergeSavedAfterSignIn()
      if (next !== "/") capture({ name: "deferred_sign_in_resumed", props: { route } })
      // `replace`: the sign-in page must not stay in the back history.
      router.replace(next)
      return true
    },
    [next, router],
  )

  /** A wrong code on attempt 1 or 2 re-issues the challenge without an exception; the result is classified, never assumed. */
  const submitCode = useCallback(
    async (code: string): Promise<CodeOutcome> => {
      setError(null)
      try {
        const result = await submitOtpCode(code)
        const nextStep = result.nextStep?.signInStep
        if (result.isSignedIn || (nextStep && classifySignInStep(nextStep) === "done")) {
          return (await done("otp")) ? "accepted" : "failed"
        }
        // Asked for the code again: not accepted, attempts remain.
        return "rejected"
      } catch (err) {
        logAuthFailure("sign-in code", err)
        if (isStaleSignInSession(err)) {
          // The client gave up before the server: back to the email step, address kept, for a fresh code.
          challengeLive.current = false
          setError(authErrorMessage(err, "code"))
          back()
          return "stale"
        }
        if ((err as { name?: string })?.name === "NotAuthorizedException") {
          challengeLive.current = false
          return "exhausted"
        }
        setError(authErrorMessage(err, "code"))
        return "rejected"
      }
    },
    [back, done],
  )

  const sendCode = useCallback(async () => {
    await resendSignInCode(address)
    challengeLive.current = true
    markCodeSent()
  }, [address])

  const joinLink = (
    <AltJourney lead="Don't have an account?" href={`/sign-up?next=${encodeURIComponent(next)}`}>
      Join
    </AltJourney>
  )

  // Step 3: the code
  if (step === "code") {
    // One error region: the journey's message is handed to the step.
    return (
      <CodeStep
        parentError={error}
        destination={address}
        submitLabel="Sign in"
        submitTestId="submit-otp"
        onSubmit={submitCode}
        onResend={sendCode}
        onChangeEmail={back}
        flow="sign_in"
        footer={joinLink}
      />
    )
  }

  // Steps 1 and 2: the credential. One `<form>` with the email input always mounted (hidden on the
  // password step, still `autocomplete="username"`), so password managers can fill and save.
  const onPassword = step === "password"
  const changeAddress = () => {
    setError(null)
    // A new step starts clean.
    validation.reset()
    back()
  }
  return (
    <StepShell
      title={onPassword ? "Enter your password" : "Sign in to Effy"}
      subtitle={onPassword ? <>Signing in as {address}</> : "It's good to see you again."}
      // Say why we are asking now.
      notice={
        onPassword || next === "/" ? undefined : next.startsWith("/checkout") ? (
          <NoticeCard
            testId="deferred-reason"
            icon={<ShoppingCart aria-hidden="true" />}
            title="Your cart is saved"
          >
            You&apos;ll need an account to place your order. Sign in and we&apos;ll take you straight
            back.
          </NoticeCard>
        ) : (
          <NoticeCard
            testId="deferred-reason"
            icon={<LogIn aria-hidden="true" />}
            title="Sign in to continue"
          >
            We&apos;ll take you straight back to where you were.
          </NoticeCard>
        )
      }
      // The opposite journey is a footer, furthest from the main action.
      footer={joinLink}
    >
        <ReasonNotice reason={reason} />
        {error && <ErrorNote>{error}</ErrorNote>}

        <form
          className="space-y-4"
          // `noValidate`: the attributes stay (autofill, keyboards); only the browser bubble is replaced.
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            // Nothing is sent until this passes (the read-only email on the password step is exempt from native validation).
            if (
              !validation.check(
                onPassword
                  ? [["email", address], ["password", password]]
                  : [["email", address]],
              )
            ) {
              // On the password step the email's message would render hidden, so an invalid address sends the shopper back to the email step.
              if (onPassword && messageFor(FIELDS.email, address)) back()
              return
            }
            run(
              async () => {
                if (onPassword) {
                  // The result is checked: a correct password can still need a further step.
                  const result = await signInWithPassword(address, password)
                  if (!result.isSignedIn) {
                    setError("We couldn't sign you in with a password. Email yourself a code instead.")
                    return
                  }
                  await done("password")
                  return
                }
                await signInWithOtp(address)
                challengeLive.current = true
                markCodeSent()
                go("code")
              },
              onPassword ? "password" : "code",
            )
          }}
        >
          <div className={onPassword ? "hidden" : undefined}>
            <Field
              label="Email"
              id="email"
              type="email"
              value={email}
              onChange={setEmail}
              onBlur={() => validation.blur("email", email)}
              error={validation.show("email", address)}
              // `username`, not `email`: password managers key stored credentials on it.
              autoComplete="username"
              required
              readOnly={onPassword}
            />
          </div>

          {onPassword && <EmailChip email={address} onChange={changeAddress} />}

          {onPassword && (
            <PasswordField
              label="Password"
              // Reset sits on the password step, beside the field.
              labelAction={
                <Link href="/reset-password" className={quietActionClass}>
                  Forgot your password?
                </Link>
              }
              id="password"
              value={password}
              onChange={setPassword}
              onBlur={() => validation.blur("password", password)}
              error={validation.show("password", password)}
              autoComplete="current-password"
              required
            />
          )}

          <Submit
            pending={pending}
            label={onPassword ? "Sign in" : "Email me a code"}
            testId={onPassword ? "submit-password" : "submit-email"}
          />

          <TextAction
            testId="toggle-mode"
            onClick={() => {
              if (onPassword) {
                changeAddress()
                return
              }
              setError(null)
              // The identifier comes first: no credential step without a usable address.
              if (!validation.check([["email", address]])) return
              validation.reset()
              go("password")
            }}
          >
            {onPassword ? "Email me a code instead" : "Use a password instead"}
          </TextAction>
        </form>

        {!onPassword && (
          <>
            <Divider />
            <GoogleButton
              label="Continue with Google"
              testId="google-signin"
              disabled={pending}
              onUnavailable={(message) => {
                // Measures demand for Google sign-in.
                capture({ name: "auth_google_unavailable", props: { flow: "sign_in" } })
                setError(message)
              }}
            />
          </>
        )}
    </StepShell>
  )
}
