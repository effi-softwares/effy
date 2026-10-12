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
 * Sign-in as a STEP FORM (036 US1, US2).
 *
 * One decision per screen: the emailed code first, Google beside it, a password only if you ask for
 * one. The customer is not asked to understand any of it.
 *
 * ⚠ ALL THREE STEPS LIVE ON THIS ONE ROUTE, and that is a constraint rather than a shortcut. Amplify
 * keeps the in-flight challenge in per-tab `sessionStorage` with a three-minute expiry, `autoSignIn`
 * state is memory-only, and splitting the email from the password across URLs is what breaks password
 * managers. See `_lib/step-history.ts` for the full reasoning.
 */
/**
 * ⚠ THE RULES ARE DECLARED HERE, BESIDE THE COPY THEY PRODUCE (044 US2).
 *
 * The email rule itself comes from `@effy/shared-types`; what is local is which fields exist on this
 * screen and what this screen says when they are wrong. The wording is bound by two constraints that
 * are easy to breach by accident:
 *
 *   • it must never say whether an address has an account (FR-044), so "we don't recognise that" is
 *     not available no matter how much friendlier it reads; and
 *   • the password message must not hint at what a correct password looks like.
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

  // The destination they were heading for before we interrupted them (FR-025). Validated: it arrives
  // in a URL and is therefore attacker-controlled.
  const next = safeNextTarget(params.get("next"))

  /**
   * ⚠ Why the shopper is here, when something sent them (044 FR-034, defect D-14).
   *
   * Two places in the product have produced this parameter since 012 and NOTHING has ever read it,
   * so a successful password change presented as an unexplained logout. `ReasonNotice` maps it
   * through a closed vocabulary and never echoes the value — it arrives in a URL, and this is the
   * one screen where arbitrary attacker-supplied text would be worth the most.
   */
  const reason = params.get("reason")

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const validation = useFieldValidation(FIELDS)

  // ⚠ Whether a challenge is actually live. `popstate` can land on the code step after the session has
  // been spent or replaced; without this the shopper would sit on a code form with nothing behind it,
  // typing into a session no one can check (FR-022, R1).
  const challengeLive = useRef(false)

  const { step, go, back } = useStepHistory<Step>("identifier", {
    canEnter: (target) => (target === "code" ? challengeLive.current : true),
  })

  // ⚠ Trimmed AND lowercased. The platform's per-address rate limit is keyed on `HMAC(email)`, so
  // `A@x.com` and `a@x.com` would consume two separate hourly buckets and neither would match the
  // other's send history.
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

  /**
   * Cognito said yes. Give the server the session, and only then leave this screen.
   *
   * ⚠ `false` MEANS STAY. Navigating before the server holds the session is how a customer used to
   * be bounced straight back here with nothing said.
   */
  const done = useCallback(
    async (route: "password" | "otp"): Promise<boolean> => {
      if (!(await handOverSession())) {
        setError(HAND_OVER_FAILED)
        return false
      }
      capture({ name: "sign_in_completed", props: { route } })
      // 027 FR-011: fold this browser's cart into the account cart — union with MAXIMUM quantity, so
      // nothing is lost from either side and a repeated sign-in changes nothing. Fired before
      // navigating and NOT awaited; the cart page reconciles again on open either way.
      void mergeCartAfterSignIn()
      // 033 FR-028: the saved list joins the account on sign-in.
      void mergeSavedAfterSignIn()
      if (next !== "/") capture({ name: "deferred_sign_in_resumed", props: { route } })
      // `replace`, not `push`: the sign-in page must not sit in the back-button history where a
      // signed-in customer can land on it again.
      router.replace(next)
      router.refresh()
      return true
    },
    [next, router],
  )

  /**
   * ⚠ THE REPAIR (FR-012, SC-003, R9).
   *
   * `classifySignInStep` has existed since 035, is correct, and was called by NOTHING. The old code
   * discarded `confirmSignIn`'s result and ran `done()` unconditionally — so a wrong code on attempt
   * 1 or 2, which raises NO exception because Cognito simply re-issues the challenge, was treated as
   * a successful sign-in. The shopper was navigated away, still signed out, with nothing on screen.
   */
  const submitCode = useCallback(
    async (code: string): Promise<CodeOutcome> => {
      setError(null)
      try {
        const result = await submitOtpCode(code)
        const nextStep = result.nextStep?.signInStep
        if (result.isSignedIn || (nextStep && classifySignInStep(nextStep) === "done")) {
          return (await done("otp")) ? "accepted" : "failed"
        }
        // Cognito asked for the code again → it was not accepted, and attempts remain.
        return "rejected"
      } catch (err) {
        logAuthFailure("sign-in code", err)
        if (isStaleSignInSession(err)) {
          // ⚠ The client gave up before the server did. Not a refusal — send them back to the email
          // step, address intact, where one tap gets a fresh code.
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

  // ── Steps 1 and 2: the credential ───────────────────────────────────────────────────────────────
  //
  // ⚠ ONE `<form>`, WITH THE EMAIL INPUT ALWAYS MOUNTED. On the password step it is hidden but still
  // present and still `autocomplete="username"`, because a password manager pairs a username field
  // with a password field to fill and — much more fragilely — to SAVE. Unmounting it is exactly the
  // breakage that identifier-first flows are known for.
  const onPassword = step === "password"
  const changeAddress = () => {
    setError(null)
    // A new step starts clean — carrying "enter your password" back onto the email step would shout
    // about a field that is no longer the one being asked for.
    validation.reset()
    back()
  }
  return (
    <StepShell
      title={onPassword ? "Enter your password" : "Sign in to Effy"}
      subtitle={onPassword ? <>Signing in as {address}</> : "It's good to see you again."}
      // FR-019 — say WHY we are asking now. The customer was browsing happily a moment ago.
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
      // ⚠ The opposite journey is a FOOTER, not an action — it belongs at the foot of the screen,
      // furthest from the thing the shopper came here to do.
      footer={joinLink}
    >
        <ReasonNotice reason={reason} />
        {error && <ErrorNote>{error}</ErrorNote>}

        <form
          className="space-y-4"
          // ⚠ `noValidate` — the ATTRIBUTES stay (autofill, semantics, mobile keyboards); only the
          // browser's own bubble is suppressed, and replaced by a message beside the field in the
          // platform's treatment (V-06). Removing the attributes instead would break password-manager
          // pairing, which FR-040 forbids.
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            // ⚠ NOTHING IS SENT UNTIL THIS PASSES (FR-009, V-14). Before 044 the browser blocked an
            // empty address on THIS step — but not on the password step, where the email input is
            // `readOnly` and therefore barred from constraint validation entirely, so an empty
            // address reached `signInWithPassword("")` and came back as "Something went wrong."
            // (BASELINE.md, D-11). And `person@example` was never refused anywhere.
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
                  // ⚠ THE RESULT IS CHECKED. Cognito can answer a correct password with a further
                  // step (an address never confirmed, a forced reset); treating that as signed in
                  // sent the customer away still signed out.
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
              // ⚠ `username`, not `email`. Managers key their stored credential on the field they
              // recognise as the username; `type="email"` alone is not that signal.
              autoComplete="username"
              required
              readOnly={onPassword}
            />
          </div>

          {onPassword && <EmailChip email={address} onChange={changeAddress} />}

          {onPassword && (
            <PasswordField
              label="Password"
              // ⚠ FR-019 — reset lives on the password step, beside the field the person who needs
              // it is looking at.
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
              // ⚠ IDENTIFIER-FIRST MEANS THE IDENTIFIER COMES FIRST. Advancing to a credential step
              // without a usable address produces a screen that can refuse but cannot explain — the
              // email input there is deliberately hidden (FR-040), so its message renders hidden
              // too. This is how the shopper ended up being told "Something went wrong." about an
              // address they had never typed (BASELINE.md, D-11).
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
                // ⚠ Sizes the demand for the Google slice this feature deliberately did not build.
                capture({ name: "auth_google_unavailable", props: { flow: "sign_in" } })
                setError(message)
              }}
            />
          </>
        )}
    </StepShell>
  )
}
