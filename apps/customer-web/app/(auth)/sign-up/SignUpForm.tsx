"use client"

import { useCallback, useRef, useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { LogIn, ShoppingCart } from "lucide-react"
import { PASSWORD_MIN_LENGTH } from "@effy/shared-types"

import { safeNextTarget } from "@/lib/next-target"
import { mergeCartAfterSignIn } from "@/lib/cart-actions"
import { mergeSavedAfterSignIn } from "@/lib/saved-merge"
import { markCodeSent } from "@/lib/otp-cooldown"
import { capture } from "@/lib/telemetry"
import {
  authErrorMessage,
  completeAutoSignIn,
  confirmSignUpCode,
  resendSignUpCodeFor,
  signUpWithOtp,
  signUpWithPassword,
} from "../_lib/auth-actions"
import { seedCredentialRoute } from "../_lib/seed-actions"
import { HAND_OVER_FAILED, handOverSession } from "../_lib/session-handoff"
import { useStepHistory } from "../_lib/step-history"
import { messageFor, useFieldValidation, type FieldConfig } from "../_lib/validation"
import { CodeStep, type CodeOutcome } from "../_components/CodeStep"
import { GoogleButton } from "../_components/GoogleButton"
import { NameStep } from "../_components/NameStep"
import {
  AltJourney,
  Divider,
  EmailChip,
  ErrorNote,
  Field,
  NoticeCard,
  PasswordField,
  StepShell,
  Submit,
  TermsNotice,
  TextAction,
} from "../_components/AuthKit"

type Step = "identifier" | "password" | "code" | "name"
type Route = "otp" | "password"

/**
 * Sign-up as a step form with the name asked last: one email, a code, and only then (account and session
 * established) what to call them. The password rule is built from `PASSWORD_MIN_LENGTH`.
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
      { kind: "required", message: "Choose a password." },
      {
        kind: "minLength",
        min: PASSWORD_MIN_LENGTH,
        message: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
      },
    ],
  },
} satisfies Record<string, FieldConfig>

export function SignUpForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = safeNextTarget(params.get("next"))

  const [route, setRoute] = useState<Route>("otp")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const validation = useFieldValidation(FIELDS)

  const accountExists = useRef(false)

  const { step, go, back } = useStepHistory<Step>("identifier", {
    // The name step is reachable only once the account exists (a PATCH before then answers with the barred wording).
    canEnter: (target) => (target === "name" ? accountExists.current : true),
  })

  // Trimmed and lowercased: the per-address rate limit keys on `HMAC(email)`.
  const address = email.trim().toLowerCase()

  const run = (fn: () => Promise<void>, context: "password" | "code" = "password") => {
    setError(null)
    start(async () => {
      try {
        await fn()
      } catch (err) {
        setError(authErrorMessage(err, context))
      }
    })
  }

  const finish = useCallback(() => {
    capture({ name: "sign_up_completed", props: { route } })
    // Merge the guest basket on sign-up as on sign-in (union with maximum, fire-and-forget).
    void mergeCartAfterSignIn()
    void mergeSavedAfterSignIn()
    if (next !== "/") capture({ name: "deferred_sign_in_resumed", props: { route } })
    router.replace(next)
  }, [next, route, router])

  const submitCode = useCallback(
    async (code: string): Promise<CodeOutcome> => {
      setError(null)
      try {
        const res = await confirmSignUpCode(address, code)

        // Both routes land signed in: `autoSignIn` was armed at sign-up, so confirming the code completes the session.
        if (res.nextStep?.signUpStep === "COMPLETE_AUTO_SIGN_IN") {
          await completeAutoSignIn()
        }

        // The account exists and Cognito has signed them in; the server takes the session over
        // before anything that needs it (the two calls below do).
        if (!(await handOverSession())) {
          setError(HAND_OVER_FAILED)
          return "failed"
        }

        // Registration is the one moment the platform learns whether there is a password; seeded on the creating upsert. Checked, since the name step needs the record.
        await seedCredentialRoute(route)

        accountExists.current = true
        go("name")
        return "accepted"
      } catch (err) {
        const name = (err as { name?: string })?.name
        // Sign-up confirmation is Cognito's managed flow, so the real cause may be said.
        if (name === "LimitExceededException" || name === "TooManyRequestsException") {
          setError(authErrorMessage(err, "code"))
          return "exhausted"
        }
        if (name === "ExpiredCodeException") {
          setError("That code has expired. Send another one.")
          return "rejected"
        }
        setError(authErrorMessage(err, "code"))
        return "rejected"
      }
    },
    [address, go, route],
  )

  const sendCode = useCallback(async () => {
    await resendSignUpCodeFor(address)
    markCodeSent()
  }, [address])

  const signInLink = (
    <AltJourney lead="Already have an account?" href={`/sign-in?next=${encodeURIComponent(next)}`}>
      Sign in
    </AltJourney>
  )

  // Step 4: who are you?
  if (step === "name") {
    return <NameStep onDone={finish} route={route} />
  }

  // Step 3: the code
  if (step === "code") {
    // One error region: the journey's message is handed to the step.
    return (
      <CodeStep
        parentError={error}
        destination={address}
        submitLabel="Continue"
        submitTestId="submit-confirm"
        onSubmit={submitCode}
        onResend={sendCode}
        onChangeEmail={back}
        flow="sign_up"
        purpose=" to confirm it is yours"
        footer={signInLink}
        // Managed flow: the refusals really are distinguishable.
        distinguishableRefusals
      />
    )
  }

  // Steps 1 and 2: the credential
  const onPassword = step === "password"
  const changeAddress = () => {
    setError(null)
    validation.reset()
    back()
  }
  return (
    <StepShell
      title={onPassword ? "Choose a password" : "Create your account"}
      subtitle={
        onPassword ? (
          <>Signing up as {address}</>
        ) : (
          "Start with your email — we'll do the rest in a moment."
        )
      }
      notice={
        onPassword || next === "/" ? undefined : next.startsWith("/checkout") ? (
          <NoticeCard
            testId="deferred-reason"
            icon={<ShoppingCart aria-hidden="true" />}
            title="Your cart is saved"
          >
            You&apos;ll need an account to place your order. We&apos;ll take you straight back.
          </NoticeCard>
        ) : (
          <NoticeCard
            testId="deferred-reason"
            icon={<LogIn aria-hidden="true" />}
            title="Create an account to continue"
          >
            We&apos;ll take you straight back to where you were.
          </NoticeCard>
        )
      }
      footer={signInLink}
    >
        {error && <ErrorNote>{error}</ErrorNote>}

        <form
          className="space-y-4"
          // `noValidate`: the attributes stay; only the browser's bubble is replaced.
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            // Nothing is sent until this passes.
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
                  setRoute("password")
                  await signUpWithPassword(address, password)
                } else {
                  setRoute("otp")
                  await signUpWithOtp(address)
                }
                markCodeSent()
                go("code")
              },
              onPassword ? "password" : "code",
            )
          }}
        >
          {/* Mounted on both steps with `autocomplete="username"`, so a password manager can pair and save. */}
          <div className={onPassword ? "hidden" : undefined}>
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
              readOnly={onPassword}
            />
          </div>

          {onPassword && <EmailChip email={address} onChange={changeAddress} />}

          {onPassword && (
            <PasswordField
              label="Create a password"
              id="password"
              value={password}
              onChange={setPassword}
              onBlur={() => validation.blur("password", password)}
              error={validation.show("password", password)}
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              required
              // The rule is stated before they type and reflected while they type: a length count, not a strength meter.
              hint={
                password.length > 0 && password.length < PASSWORD_MIN_LENGTH
                  ? `${password.length} of ${PASSWORD_MIN_LENGTH} characters.`
                  : `At least ${PASSWORD_MIN_LENGTH} characters.`
              }
            />
          )}

          {/* No "CONFIRM PASSWORD": the reveal toggle replaces it. */}

          {/* Above the button, so on a phone the terms notice is not the first thing pushed out of view. */}
          <TermsNotice />
          <Submit
            pending={pending}
            label={onPassword ? "Continue" : "Email me a code"}
            testId={onPassword ? "submit-password" : "submit-email"}
          />

          {/* The way back from the password step is the address row's "Change", so the route toggle is on the email step only. */}
          {!onPassword && (
            <TextAction
              testId="toggle-route"
              onClick={() => {
                setError(null)
                // The identifier comes first: no credential step without a usable address.
                if (!validation.check([["email", address]])) return
                validation.reset()
                go("password")
              }}
            >
              Set a password instead
            </TextAction>
          )}
        </form>

        {!onPassword && (
          <>
            <Divider />
            <GoogleButton
              label="Continue with Google"
              testId="google-signup"
              disabled={pending}
              onUnavailable={(message) => {
                capture({ name: "auth_google_unavailable", props: { flow: "sign_up" } })
                setError(message)
              }}
            />
          </>
        )}
    </StepShell>
  )
}
