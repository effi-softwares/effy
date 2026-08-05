"use client"

import { useCallback, useRef, useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
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
import { useStepHistory } from "../_lib/step-history"
import { CodeStep, type CodeOutcome } from "../_components/CodeStep"
import { GoogleButton } from "../_components/GoogleButton"
import { NameStep } from "../_components/NameStep"
import {
  Divider,
  ErrorNote,
  Field,
  PasswordField,
  StepShell,
  Submit,
  TextAction,
} from "../_components/AuthKit"

type Step = "identifier" | "password" | "code" | "name"
type Route = "otp" | "password"

/**
 * Sign-up as a STEP FORM, with the name asked LAST (036 US3).
 *
 * ⚠ THE ORDER IS THE FEATURE. A new shopper is asked for ONE thing — an email — then confirms a code,
 * and only then, with an account that already exists and a session already established, is asked what
 * to call them.
 *
 * Before this, First name and Last name sat ABOVE the email field: the very first thing a stranger
 * was asked for was personal data, before they had any reason to trust the form. `given_name` and
 * `family_name` are OPTIONAL Cognito attributes — there is no `schema {}` block on the pool — and
 * `public.customer.given_name/family_name` have been nullable since 019, deliberately, for the
 * federated route. So nothing had to change in Terraform or SQL for this to become possible; it was
 * only ever a form.
 */
export function SignUpForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = safeNextTarget(params.get("next"))

  const [route, setRoute] = useState<Route>("otp")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const accountExists = useRef(false)

  const { step, go, back } = useStepHistory<Step>("identifier", {
    // ⚠ The name step is reachable only once the account is real. A `popstate` landing there before
    // that would offer to save a profile for an account that does not exist yet — which the PATCH
    // answers with the barred-customer wording.
    canEnter: (target) => (target === "name" ? accountExists.current : true),
  })

  // ⚠ Trimmed AND lowercased — the per-address rate limit is keyed on `HMAC(email)`.
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
    // ⚠ 036 FR-037 — SIGN-UP DID NOT MERGE THE GUEST BASKET AND SIGN-IN DID.
    //
    // A guest who filled a basket and then registered lost it, while the same guest signing in kept
    // it. Same union-with-maximum merge, same fire-and-forget, on both paths now.
    void mergeCartAfterSignIn()
    void mergeSavedAfterSignIn()
    if (next !== "/") capture({ name: "deferred_sign_in_resumed", props: { route } })
    router.replace(next)
    router.refresh()
  }, [next, route, router])

  const submitCode = useCallback(
    async (code: string): Promise<CodeOutcome> => {
      setError(null)
      try {
        const res = await confirmSignUpCode(address, code)

        // FR-009b — BOTH routes land the customer inside, signed in. `autoSignIn` was armed at
        // sign-up, so confirming the code completes the session; there is no second code and no "now
        // please sign in" detour.
        //
        // ⚠ UNVERIFIED AND ON THE SPIKE LIST (SPIKE-2 / 035 T003). What `autoSignIn` does now that
        // custom-auth triggers are attached to this pool is documented nowhere. Source reading says
        // the PASSWORD route is safe (`USER_SRP_AUTH`, triggers never invoked, no second code); the
        // OTP route forwards the ConfirmSignUp session as `USER_AUTH`, which AWS documents as the
        // no-second-code path — but not for a pool with `DefineAuthChallenge` attached.
        if (res.nextStep?.signUpStep === "COMPLETE_AUTO_SIGN_IN") {
          await completeAutoSignIn()
        }

        // 012 FR-013 — the platform CANNOT ask Cognito whether this customer has a password, so
        // registration is the one moment it can learn. Seeded on the record's creating upsert.
        // ⚠ Its result is now checked rather than swallowed; the name step needs the record to exist.
        await seedCredentialRoute(route)

        accountExists.current = true
        go("name")
        return "accepted"
      } catch (err) {
        const name = (err as { name?: string })?.name
        // ⚠ Sign-up confirmation runs Cognito's MANAGED flow, so unlike the sign-in route the cause
        // here is REAL and the message may say which (FR-011).
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
    <p className="text-center text-sm text-muted-foreground">
      Already have an account?{" "}
      <Link
        href={`/sign-in?next=${encodeURIComponent(next)}`}
        className="font-medium text-foreground hover:text-primary"
      >
        Sign in
      </Link>
    </p>
  )

  // ── Step 4: who are you? ────────────────────────────────────────────────────────────────────────
  if (step === "name") {
    return <NameStep onDone={finish} />
  }

  // ── Step 3: the code ────────────────────────────────────────────────────────────────────────────
  if (step === "code") {
    return (
      <div className="space-y-6">
        {error && <ErrorNote>{error}</ErrorNote>}
        <CodeStep
          destination={address}
          submitLabel="Create account"
          submitTestId="submit-confirm"
          onSubmit={submitCode}
          onResend={sendCode}
          onChangeEmail={back}
          onBack={back}
          // ⚠ Managed flow → the refusals really are distinguishable here.
          distinguishableRefusals
        />
        {signInLink}
      </div>
    )
  }

  // ── Steps 1 and 2: the credential ───────────────────────────────────────────────────────────────
  const onPassword = step === "password"
  return (
    <div className="space-y-6">
      <StepShell
        title={onPassword ? "Choose a password" : "Create your account"}
        subtitle={
          onPassword ? (
            <>
              Creating an account for <strong className="text-foreground">{address}</strong>
            </>
          ) : next !== "/" ? (
            <span data-testid="deferred-reason">
              You&apos;ll need an account to place your order. We&apos;ll take you straight back.
            </span>
          ) : (
            "Start with your email — we'll do the rest in a moment."
          )
        }
        onBack={onPassword ? back : undefined}
      >
        {error && <ErrorNote>{error}</ErrorNote>}

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
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
          {/* ⚠ Mounted on both steps with `autocomplete="username"` so a password manager can pair it
              with the new password and offer to SAVE. Unmounting it is the classic breakage. */}
          <div className={onPassword ? "hidden" : undefined}>
            <Field
              label="Email"
              id="email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="username"
              required
              readOnly={onPassword}
            />
          </div>

          {onPassword && (
            <PasswordField
              label="Password"
              id="password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              required
              // ⚠ THE RULE IS STATED BEFORE THEY TYPE, AND IT IS NOW TRUE (FR-029).
              //
              // This used to read "At least 8 characters, with upper and lower case letters and a
              // number" from a local `MIN_PASSWORD = 8`. The real policy is 12 characters with NO
              // composition rules, so the old copy was BOTH too short and falsely restrictive — the
              // exact drift `authErrorMessage`'s own comment records ("The old text became a LIE the
              // moment the policy changed"). Built from the shared constant so it cannot drift again.
              hint={`At least ${PASSWORD_MIN_LENGTH} characters. Use anything you like — no special characters required.`}
            />
          )}

          {/* ⚠ NO "CONFIRM PASSWORD" FIELD (FR-030 / 012 FR-023). The reveal toggle on the field above
              replaces it — GOV.UK removed theirs on exactly that reasoning, the account page already
              followed the rule, and mobile sign-up never had one. Web was the odd surface out. */}

          <Submit
            pending={pending}
            label={onPassword ? "Create account" : "Email me a code"}
            testId={onPassword ? "submit-password" : "submit-email"}
          />

          <TextAction
            testId="toggle-route"
            onClick={() => {
              setError(null)
              if (onPassword) back()
              else go("password")
            }}
          >
            {onPassword ? "Email me a code instead" : "Set a password instead"}
          </TextAction>
        </form>

        {!onPassword && (
          <>
            <Divider />
            <GoogleButton
              label="Continue with Google"
              testId="google-signup"
              disabled={pending}
              onUnavailable={setError}
            />
          </>
        )}
      </StepShell>

      {signInLink}
    </div>
  )
}
