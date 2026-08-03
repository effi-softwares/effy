"use client"

import { useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"

import { seedCredentialRoute } from "@/app/(auth)/_lib/seed-actions"
import { googleEnabled } from "@/lib/auth-routes"
import { safeNextTarget } from "@/lib/next-target"
import { capture } from "@/lib/telemetry"
import { OtpInput } from "@effy/design-system/ui"
import {
  authErrorMessage,
  completeAutoSignIn,
  confirmSignUpCode,
  signUpWithOtp,
  signUpWithPassword,
  startGoogleSignIn,
} from "../_lib/auth-actions"

type Step = "details" | "confirm"
type Route = "otp" | "password"

const MIN_PASSWORD = 8

/**
 * Self-registration (FR-009) — the platform's first, and only, open sign-up.
 *
 * Every other audience on Effy is provisioned by staff. The customer walks up and creates an
 * account. That difference is why this surface exists in the shape it does.
 *
 * THE NAME IS COLLECTED HERE, BEFORE THE ACCOUNT EXISTS (FR-009a) — as FIRST and LAST name, mapping
 * 1:1 onto Cognito's standard `given_name` / `family_name`. A grocery order gets handed to a person;
 * a store that knows an email but not a name has to ask again at the worst possible moment —
 * mid-checkout. Two fields now remove an interruption later.
 *
 * BOTH ROUTES SIGN THE CUSTOMER IN AUTOMATICALLY (FR-009b). Asking someone to re-type the password
 * they chose ninety seconds ago, at the exact moment they have finally committed, is a self-inflicted
 * drop-off.
 *
 * The DEFAULT is the passwordless route: name, email, code, done. A password is offered for people
 * who want one, but it is not the path of least resistance — the fewer passwords the platform stores,
 * the fewer it can lose.
 */
export function SignUpForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = safeNextTarget(params.get("next"))

  const [step, setStep] = useState<Step>("details")
  const [route, setRoute] = useState<Route>("otp")
  const [given, setGiven] = useState("")
  const [family, setFamily] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const showGoogle = googleEnabled()

  // ⚠ 035 — the error mapping now needs to know WHICH ROUTE failed. `NotAuthorizedException` means
  // "wrong password" on the password route and "you used all three code attempts" on the code
  // route; showing the password wording to someone signing in passwordlessly is nonsense they
  // cannot act on. Callers on a code step pass "code".
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

  /**
   * Caught BEFORE the account is attempted (spec AS-1a). Telling someone their passwords don't match
   * only after a round trip to Cognito — and after Cognito has already created the account with the
   * first one — would be both slower and wrong.
   */
  const mismatch =
    route === "password" && confirm.length > 0 && password !== confirm

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold uppercase tracking-[-0.02em]">Create your account</h1>
        {next !== "/" && (
          <p className="text-sm text-muted-foreground" data-testid="deferred-reason">
            You&apos;ll need an account to place your order. We&apos;ll take you straight back.
          </p>
        )}
      </div>

      {error && (
        <p
          role="alert"
          data-testid="auth-error"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground"
        >
          {error}
        </p>
      )}

      {step === "confirm" ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            run(async () => {
              const res = await confirmSignUpCode(email.trim(), code.trim())

              // FR-009b — BOTH routes land the customer inside, signed in. `autoSignIn` was armed at
              // sign-up, so confirming the code completes the session; there is no second code and no
              // "now please sign in" detour.
              if (res.nextStep?.signUpStep === "COMPLETE_AUTO_SIGN_IN") {
                await completeAutoSignIn()
              }

              // 012 FR-013 — the platform CANNOT ask Cognito whether this customer has a password, so
              // registration is the one moment it can learn. Seeded on the record's creating upsert;
              // ignored forever after. A UX hint, never an authorization input — see seed-actions.ts
              // for why lying about it gains a caller nothing.
              await seedCredentialRoute(route)

              capture({ name: "sign_up_completed", props: { route } })
              if (next !== "/") {
                capture({ name: "deferred_sign_in_resumed", props: { route } })
              }

              router.replace(next)
              router.refresh()
            }, "code")
          }}
        >
          <p className="text-sm text-muted-foreground">
            We emailed a code to <strong className="text-foreground">{email}</strong>.
          </p>
          {/* ⚠ 035 REPLACED THE COMMENT THAT USED TO LIVE HERE. It instructed future authors NOT to
              constrain the length, because Cognito sent codes of two different lengths and neither
              was configurable (research D23):
                • sign-up confirmation  → 6 digits
                • managed EMAIL_OTP sign-in → 8 digits
              That rule was correct then and is wrong now. The platform issues its own SIX-digit
              code for sign-in, so every code on every surface is the same length and the field can
              finally say so. ⚠ `maxLength` on the shared control is a UX affordance only — a
              wrong-length value is REFUSED by the server rather than reshaped (FR-005). */}
          <CodeField
            label="Your code"
            id="code"
            value={code}
            onChange={setCode}
            required
          />
          <Submit pending={pending} label="Create account" testId="submit-confirm" />
          <button
            type="button"
            className="w-full text-sm text-muted-foreground hover:text-foreground"
            onClick={() => {
              setStep("details")
              setCode("")
              setError(null)
            }}
          >
            Go back
          </button>
        </form>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()

            if (route === "password" && password !== confirm) {
              setError("Those passwords don't match.")
              return
            }

            run(async () => {
              capture({ name: "sign_up_started", props: { route } })

              const name = { given: given.trim(), family: family.trim() }

              if (route === "password") {
                await signUpWithPassword(name, email.trim(), password)
              } else {
                // No password. Not a blank one, not a random one — none. See auth-actions.ts.
                await signUpWithOtp(name, email.trim())
              }
              setStep("confirm")
            })
          }}
        >
          {/* FR-009a — asked once, up front, so nobody has to ask again at checkout.
              TWO fields, mapping 1:1 onto Cognito's standard given_name / family_name. A delivery
              label, an order confirmation and a support conversation all need the parts, and a
              single free-text name cannot be split back into them reliably. */}
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="First name"
              id="givenName"
              value={given}
              onChange={setGiven}
              autoComplete="given-name"
              maxLength={60}
              required
            />
            <Field
              label="Last name"
              id="familyName"
              value={family}
              onChange={setFamily}
              autoComplete="family-name"
              maxLength={60}
              required
            />
          </div>

          <Field
            label="Email"
            id="email"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            required
          />

          {route === "password" && (
            <>
              <Field
                label="Password"
                id="password"
                type="password"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                minLength={MIN_PASSWORD}
                required
              />
              <Field
                label="Confirm password"
                id="confirm"
                type="password"
                value={confirm}
                onChange={setConfirm}
                autoComplete="new-password"
                minLength={MIN_PASSWORD}
                required
                aria-invalid={mismatch}
              />
              {mismatch && (
                <p className="text-sm text-destructive" data-testid="password-mismatch">
                  Those passwords don&apos;t match.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                At least {MIN_PASSWORD} characters, with upper and lower case letters and a number.
              </p>
            </>
          )}

          <Submit
            pending={pending}
            disabled={mismatch}
            label={route === "password" ? "Create account" : "Email me a code"}
            testId={route === "password" ? "submit-password" : "submit-email"}
          />

          <button
            type="button"
            data-testid="toggle-route"
            className="w-full text-sm text-muted-foreground hover:text-foreground"
            onClick={() => {
              setRoute(route === "password" ? "otp" : "password")
              setPassword("")
              setConfirm("")
              setError(null)
            }}
          >
            {route === "password"
              ? "Skip the password — email me a code instead"
              : "I'd rather set a password"}
          </button>
        </form>
      )}

      {showGoogle && (
        <>
          <Divider />

          <button
            type="button"
            data-testid="google-signup"
            disabled={pending}
            onClick={() =>
              run(async () => {
                capture({ name: "sign_up_started", props: { route: "google" } })
                await startGoogleSignIn(next)
              })
            }
            className="flex h-11 w-full items-center justify-center rounded-full border text-sm font-medium hover:bg-accent"
          >
            Continue with Google
          </button>
        </>
      )}

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href={`/sign-in?next=${encodeURIComponent(next)}`}
          className="font-medium text-foreground hover:text-primary"
        >
          Sign in
        </Link>
      </p>
    </div>
  )
}

function Field({
  label,
  id,
  value,
  onChange,
  ...rest
}: {
  label: string
  id: string
  value: string
  onChange: (v: string) => void
  // Omit the native onChange — ours takes the value, not the event.
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "id">) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-full border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        {...rest}
      />
    </div>
  )
}

/**
 * The one-time-code field (035 FR-035).
 *
 * ⚠ Wraps the SHARED `OtpInput` from `@effy/design-system/ui` rather than re-declaring
 * `inputMode` / `autoComplete` / `maxLength` locally. Every surface having its own code input is
 * exactly how shop-mobile ended up truncating real codes with nothing to catch it — the behaviour
 * (autofill token, numeric keyboard, one logical a11y node, no reshaping) now lives in one place.
 *
 * ⚠ The `className` keeps THIS surface's visual language (pill radius, taller target) — presentation
 * is local, behaviour is shared. Do not fork the behaviour to change the look.
 */
function CodeField({
  label,
  id,
  value,
  onChange,
  ...rest
}: {
  label: string
  id: string
  value: string
  onChange: (v: string) => void
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "id">) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <OtpInput
        id={id}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 rounded-full border bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
        {...rest}
      />
    </div>
  )
}

function Submit({
  pending,
  label,
  testId,
  disabled,
}: {
  pending: boolean
  label: string
  testId: string
  disabled?: boolean
}) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      data-testid={testId}
      className="h-11 w-full rounded-full bg-primary text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Please wait…" : label}
    </button>
  )
}

function Divider() {
  return (
    <div className="relative">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t" />
      </div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-background px-2 text-muted-foreground">or</span>
      </div>
    </div>
  )
}
