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
import { messageFor, useFieldValidation, type FieldConfig } from "../_lib/validation"
import { CodeStep, type CodeOutcome } from "../_components/CodeStep"
import { GoogleButton } from "../_components/GoogleButton"
import { NameStep } from "../_components/NameStep"
import {
  Divider,
  ErrorNote,
  inlineActionClass,
  Field,
  PasswordField,
  StepShell,
  Submit,
  TermsNotice,
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
/**
 * ⚠ The password rule is built from `PASSWORD_MIN_LENGTH`, never a literal (044 FR-016).
 *
 * 036 already fixed this copy once: it read "at least 8 characters, with upper and lower case letters
 * and a number" against a real policy of twelve characters with NO composition rules — both too short
 * and falsely restrictive. Deriving the number from the shared constant is what stops it drifting a
 * second time.
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
    <p className="text-center text-sm font-medium text-muted-foreground">
      Already have an account?{" "}
      <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className={inlineActionClass}>
        Sign in
      </Link>
    </p>
  )

  // ── Step 4: who are you? ────────────────────────────────────────────────────────────────────────
  if (step === "name") {
    return <NameStep onDone={finish} route={route} />
  }

  // ── Step 3: the code ────────────────────────────────────────────────────────────────────────────
  if (step === "code") {
    // ⚠ 044 FR-017 — ONE ERROR REGION. This used to render its own <ErrorNote> here, OUTSIDE the
    // step shell (above the back control, detached from the layout) while CodeStep rendered a second
    // one inside it. Both were role="alert"; both could be true at once; both announced. The journey's
    // message is now handed to the step, which owns the single region (defect D-05).
    return (
      <CodeStep
        parentError={error}
        destination={address}
        submitLabel="Create account"
        submitTestId="submit-confirm"
        onSubmit={submitCode}
        onResend={sendCode}
        onChangeEmail={back}
        onBack={back}
        flow="sign_up"
        // ⚠ Managed flow → the refusals really are distinguishable here.
        distinguishableRefusals
      />
    )
  }

  // ── Steps 1 and 2: the credential ───────────────────────────────────────────────────────────────
  const onPassword = step === "password"
  return (
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
      bottom={signInLink}
    >
        {error && <ErrorNote>{error}</ErrorNote>}

        <form
          className="space-y-4"
          // ⚠ `noValidate` — the attributes stay for autofill and semantics; only the browser's own
          // bubble is replaced (V-06).
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            // ⚠ NOTHING IS SENT UNTIL THIS PASSES. On the shipped build this step accepted
            // `person@example`, dispatched a real request for it, and ADVANCED the shopper to the
            // code step — to wait for an email that could not arrive (BASELINE.md, D-08).
            if (
              !validation.check(
                onPassword
                  ? [["email", address], ["password", password]]
                  : [["email", address]],
              )
            ) {
              // ⚠ THE MESSAGE HAS NOWHERE VISIBLE TO GO ON THE PASSWORD STEP. The email input is
              // still mounted there (FR-040 — password managers pair it with the password to fill
              // and to SAVE) but it is inside a hidden container, so its message renders hidden too.
              // An invalid address at this point is a STEP-level problem, not a field-level one: go
              // back to the step that asks for it, where the message is visible and actionable.
              //
              // ⚠ Found by the e2e, which reported "resolved to <p>Enter your email address.</p> —
              // unexpected value hidden". Showing an invisible error is only marginally better than
              // the "Something went wrong." this replaced.
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
          {/* ⚠ Mounted on both steps with `autocomplete="username"` so a password manager can pair it
              with the new password and offer to SAVE. Unmounting it is the classic breakage. */}
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

          {onPassword && (
            <PasswordField
              label="Password"
              id="password"
              value={password}
              onChange={setPassword}
              onBlur={() => validation.blur("password", password)}
              error={validation.show("password", password)}
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
              // ⚠ FR-016 — THE RULE IS STATED BEFORE THEY TYPE, AND REFLECTED WHILE THEY TYPE.
              // Before 044 the only signal that a password was too short was an action that stayed
              // unavailable with nothing saying why. This is a count, not a strength meter: the
              // policy is a length and nothing else, and a scored bar would imply a judgement the
              // platform does not make (research R10).
              hint={
                password.length > 0 && password.length < PASSWORD_MIN_LENGTH
                  ? `${password.length} of ${PASSWORD_MIN_LENGTH} characters.`
                  : `At least ${PASSWORD_MIN_LENGTH} characters. Use anything you like — no special characters required.`
              }
            />
          )}

          {/* ⚠ NO "CONFIRM PASSWORD" FIELD (FR-030 / 012 FR-023). The reveal toggle on the field above
              replaces it — GOV.UK removed theirs on exactly that reasoning, the account page already
              followed the rule, and mobile sign-up never had one. Web was the odd surface out. */}

          {/* ⚠ ABOVE the button, not below it. Below is the commoner convention, but on a phone the
              footer group sits at the foot of the screen — so below the action it would be the first
              thing pushed out of view, and "reasonably conspicuous notice" is the limb that
              inquiry-notice contracts fail on. */}
          <TermsNotice />
          <Submit
            pending={pending}
            label={onPassword ? "Create account" : "Email me a code"}
            testId={onPassword ? "submit-password" : "submit-email"}
          />

          <TextAction
            testId="toggle-route"
            onClick={() => {
              setError(null)
              if (onPassword) {
                validation.reset()
                back()
                return
              }
              // ⚠ IDENTIFIER-FIRST MEANS THE IDENTIFIER COMES FIRST. Advancing to a credential step
              // without a usable address produces a screen that can refuse but cannot explain, and
              // it is how the shopper ended up being told "Something went wrong." about an address
              // they had never typed (BASELINE.md, D-11).
              if (!validation.check([["email", address]])) return
              validation.reset()
              go("password")
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
