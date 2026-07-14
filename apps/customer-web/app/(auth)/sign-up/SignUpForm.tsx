"use client"

import { useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"

import { safeNextTarget } from "@/lib/next-target"
import { capture } from "@/lib/telemetry"
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

/**
 * Self-registration (FR-009) — the platform's first, and only, open sign-up.
 *
 * Every other audience on Effy is provisioned by staff. The customer walks up and creates an
 * account. That difference is why this surface exists in the shape it does.
 *
 * The DEFAULT is the passwordless route: type an email, get a code, you're in. A password is
 * offered for people who want one, but it is not the path of least resistance — the fewer
 * passwords the platform stores, the fewer it can lose.
 */
export function SignUpForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = safeNextTarget(params.get("next"))

  const [step, setStep] = useState<Step>("details")
  const [route, setRoute] = useState<Route>("otp")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const run = (fn: () => Promise<void>) => {
    setError(null)
    start(async () => {
      try {
        await fn()
      } catch (err) {
        setError(authErrorMessage(err))
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
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

              // The OTP route chains registration → verification → session, so the customer types
              // ONE code, not two.
              if (res.nextStep?.signUpStep === "COMPLETE_AUTO_SIGN_IN") {
                await completeAutoSignIn()
              }

              capture({ name: "sign_up_completed", props: { route } })
              router.replace(route === "otp" ? next : `/sign-in?next=${encodeURIComponent(next)}`)
              router.refresh()
            })
          }}
        >
          <p className="text-sm text-muted-foreground">
            We emailed a code to <strong className="text-foreground">{email}</strong>.
          </p>
          <Field
            label="Your code"
            id="code"
            value={code}
            onChange={setCode}
            inputMode="numeric"
            autoComplete="one-time-code"
            required
          />
          <Submit pending={pending} label="Create account" testId="submit-confirm" />
        </form>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            run(async () => {
              capture({ name: "sign_up_started", props: { route } })

              if (route === "password") {
                await signUpWithPassword(email.trim(), password)
              } else {
                // No password. Not a blank one, not a random one — none. See auth-actions.ts.
                await signUpWithOtp(email.trim())
              }
              setStep("confirm")
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

          {route === "password" && (
            <Field
              label="Password"
              id="password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              minLength={8}
              required
            />
          )}

          <Submit
            pending={pending}
            label={route === "password" ? "Create account" : "Email me a code"}
            testId={route === "password" ? "submit-password" : "submit-email"}
          />

          <button
            type="button"
            data-testid="toggle-route"
            className="w-full text-sm text-muted-foreground hover:text-foreground"
            onClick={() => {
              setRoute(route === "password" ? "otp" : "password")
              setError(null)
            }}
          >
            {route === "password"
              ? "Skip the password — email me a code instead"
              : "I'd rather set a password"}
          </button>
        </form>
      )}

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
        className="flex h-11 w-full items-center justify-center rounded-md border text-sm font-medium hover:bg-accent"
      >
        Continue with Google
      </button>

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
        className="h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      className="h-11 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
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
