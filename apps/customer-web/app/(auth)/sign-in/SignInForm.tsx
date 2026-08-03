"use client"

import { useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"

import { googleEnabled } from "@/lib/auth-routes"
import { safeNextTarget } from "@/lib/next-target"
import { mergeCartAfterSignIn } from "@/lib/cart-actions"
import { mergeSavedAfterSignIn } from "@/lib/saved-merge"
import { capture } from "@/lib/telemetry"
import { OtpInput } from "@effy/design-system/ui"
import {
  authErrorMessage,
  signInWithOtp,
  signInWithPassword,
  startGoogleSignIn,
  submitOtpCode,
} from "../_lib/auth-actions"

type Mode = "choose" | "password" | "otp-sent"

/**
 * Sign-in — three routes, one identity.
 *
 * The customer is not asked to understand any of this. They see: a box for their email, a button
 * to be emailed a code, an option to use a password if they set one, and Continue with Google.
 */
export function SignInForm() {
  const router = useRouter()
  const params = useSearchParams()

  // The destination they were heading for before we interrupted them (FR-020). Validated: it
  // arrives in a URL and is therefore attacker-controlled.
  const next = safeNextTarget(params.get("next"))

  const [mode, setMode] = useState<Mode>("choose")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // Google is BUILT but PARKED: no Cognito hosted domain configured → no federation → no button.
  // Offering it would be offering a door with no room behind it. See lib/auth-routes.ts.
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

  const done = (route: "password" | "otp") => {
    capture({ name: "sign_in_completed", props: { route } })
    // 027 FR-011: fold this browser's cart into the account cart — union with MAXIMUM quantity, so nothing
    // is lost from either side and a repeated sign-in changes nothing. Fired before navigating, and NOT
    // awaited: the shopper should not wait on it, and the cart page reconciles again on open either way.
    void mergeCartAfterSignIn()
    // 033 FR-028: the saved list joins the account on sign-in.
    void mergeSavedAfterSignIn()
    if (next !== "/") capture({ name: "deferred_sign_in_resumed", props: { route } })
    // `replace`, not `push`: the sign-in page must not sit in the back-button history where a
    // signed-in customer can land on it again.
    router.replace(next)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold uppercase tracking-[-0.02em]">Sign in to Effy</h1>
        {next !== "/" && (
          // FR-019 — say WHY we are asking now. The customer was browsing happily a moment ago.
          <p className="text-sm text-muted-foreground" data-testid="deferred-reason">
            You&apos;ll need an account to place your order. Sign in and we&apos;ll take you
            straight back.
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

      {mode === "otp-sent" ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            run(async () => {
              await submitOtpCode(code.trim())
              done("otp")
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
          <Submit pending={pending} label="Sign in" testId="submit-otp" />
          <button
            type="button"
            className="w-full text-sm text-muted-foreground hover:text-foreground"
            onClick={() => {
              setMode("choose")
              setCode("")
            }}
          >
            Use a different email
          </button>
        </form>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            run(async () => {
              if (mode === "password") {
                await signInWithPassword(email.trim(), password)
                done("password")
                return
              }
              await signInWithOtp(email.trim())
              setMode("otp-sent")
            })
          }}
        >
          <Field
            label="Email"
            id="email"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            required
          />

          {mode === "password" && (
            <Field
              label="Password"
              id="password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              required
            />
          )}

          <Submit
            pending={pending}
            label={mode === "password" ? "Sign in" : "Email me a code"}
            testId={mode === "password" ? "submit-password" : "submit-email"}
          />

          <button
            type="button"
            data-testid="toggle-mode"
            className="w-full text-sm text-muted-foreground hover:text-foreground"
            onClick={() => {
              setMode(mode === "password" ? "choose" : "password")
              setError(null)
            }}
          >
            {mode === "password"
              ? "Email me a code instead"
              : "I have a password"}
          </button>
        </form>
      )}

      {showGoogle && (
        <>
          <Divider />

          <button
            type="button"
            data-testid="google-signin"
            disabled={pending}
            onClick={() =>
              run(async () => {
                capture({ name: "sign_in_completed", props: { route: "google" } })
                // This LEAVES the origin — there is no pure-SDK federation path. `next` is stashed
                // and recovered on /callback.
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
        New to Effy?{" "}
        <Link
          href={`/sign-up?next=${encodeURIComponent(next)}`}
          className="font-medium text-foreground hover:text-primary"
        >
          Create an account
        </Link>
      </p>

      {mode === "password" && (
        <p className="text-center text-sm">
          <Link
            href="/reset-password"
            className="text-muted-foreground hover:text-foreground"
          >
            Forgot your password?
          </Link>
        </p>
      )}
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
}: {
  pending: boolean
  label: string
  testId: string
}) {
  return (
    <button
      type="submit"
      disabled={pending}
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
