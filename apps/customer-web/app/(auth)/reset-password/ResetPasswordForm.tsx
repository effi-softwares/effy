"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { OtpInput } from "@effy/design-system/ui"
import { PASSWORD_MIN_LENGTH } from "@effy/shared-types"

import { authErrorMessage, startPasswordReset } from "../_lib/auth-actions"
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
export function ResetPasswordForm() {
  const router = useRouter()
  const [sent, setSent] = useState(false)
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
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
      <h1 className="text-3xl font-extrabold uppercase tracking-[-0.02em]">Reset your password</h1>

      {error && (
        <p
          role="alert"
          data-testid="auth-error"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
        >
          {error}
        </p>
      )}

      {sent ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            run(async () => {
              const res = await finishPasswordReset(email.trim(), code.trim(), password)
              // ⚠ A Server Action RETURNS its failure rather than throwing it across the boundary. The
              // backend's message is already safe to show: it collapses "wrong code" / "expired" / "no
              // such customer" into one, so it cannot be used to discover who shops at Effy.
              if (!res.ok) throw new Error(res.error)
              router.replace("/sign-in")
            })
          }}
        >
          <p className="text-sm text-muted-foreground">
            We emailed a code to <strong className="text-foreground">{email}</strong>.
          </p>
          {/* ⚠ 035 — this field had NO `inputMode` and NO `autoComplete="one-time-code"` at all,
              so on mobile it raised an alphabetic keyboard and never offered the code from Mail.
              A recovery flow is exactly where that friction hurts most. Now the shared control,
              same as every other code field on the platform (FR-026, FR-035). */}
          <CodeField label="Your code" id="code" value={code} onChange={setCode} required />
          <Field
            label="New password"
            id="password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            // ⚠ 036 R8 — was `8`, while the platform enforces 12. A client-side minimum that is
            // LOOSER than the server's turns a clear "too short" into a rejected submit with a
            // backend error, at the one moment the customer is already locked out.
            minLength={PASSWORD_MIN_LENGTH}
            required
          />
          <Submit pending={pending} label="Set new password" />
        </form>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            run(async () => {
              await startPasswordReset(email.trim())
              setSent(true)
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
          <Submit pending={pending} label="Email me a reset code" />
          <p className="text-center text-sm text-muted-foreground">
            Never set a password?{" "}
            <a href="/sign-in" className="font-medium text-foreground hover:text-primary">
              Sign in with an email code instead
            </a>
          </p>
        </form>
      )}
    </div>
  )
}

/**
 * The one-time-code field (035 FR-035) — the shared control, with this surface's visual language.
 * See the identical component in SignInForm/SignUpForm; behaviour is shared, presentation is local.
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
        // ⚠ 036 — the SAME field as sign-in and sign-up (FR-001). The `cells` variant also carries
        // FR-004: it does not truncate a longer paste, because a code that is not six digits did not
        // come from us and the shopper needs to SEE that rather than have it quietly reshaped.
        variant="cells"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        {...rest}
      />
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

function Submit({ pending, label }: { pending: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 w-full rounded-full bg-primary text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Please wait…" : label}
    </button>
  )
}
