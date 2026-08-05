"use client"

import * as React from "react"

/**
 * The primitives every auth step shares (036 Principle II).
 *
 * ⚠ Before 036 `Field`, `Submit`, `Divider` and the error note were declared THREE TIMES — once each
 * in `SignInForm`, `SignUpForm` and `ResetPasswordForm` — with byte-identical bodies. `CodeField` was
 * duplicated the same three times. That is the shape a divergence starts in: one copy gets a fix and
 * the others quietly do not, which is precisely how shop-mobile ended up truncating real codes.
 *
 * These are deliberately plain and app-local. They are NOT design-system candidates: the pill radius
 * and taller targets are this surface's visual language, and the consoles must not inherit them.
 */

export function Field({
  label,
  id,
  value,
  onChange,
  hint,
  ...rest
}: {
  label: string
  id: string
  value: string
  onChange: (v: string) => void
  hint?: React.ReactNode
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
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/**
 * A password field with a reveal toggle (036 FR-030; 012 FR-023).
 *
 * ⚠ THE REVEAL IS WHAT REPLACES "CONFIRM PASSWORD". 012's FR-023 forbids asking for a re-typed
 * confirmation, on the GOV.UK reasoning that "a second field is not helpful for users, particularly
 * on password inputs with show and hide buttons". The account page already followed that rule; web
 * sign-up did not, and mobile sign-up never had a confirm field — so the two customer surfaces
 * disagreed. 036 settles it by REMOVING the field from web, not by adding one to mobile.
 *
 * ⚠ The toggle is `size-11` (44px) and carries `aria-pressed` plus a label naming its own field —
 * "Show password" alone is ambiguous the moment a screen has two password inputs.
 */
export function PasswordField({
  label,
  id,
  value,
  onChange,
  hint,
  ...rest
}: {
  label: string
  id: string
  value: string
  onChange: (v: string) => void
  hint?: React.ReactNode
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "id" | "type">) {
  const [revealed, setRevealed] = React.useState(false)
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={revealed ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-full rounded-full border bg-background px-3 pr-12 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          {...rest}
        />
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          aria-pressed={revealed}
          aria-label={`${revealed ? "Hide" : "Show"} ${label.toLowerCase()}`}
          className="absolute inset-y-0 right-0 flex size-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <span aria-hidden className="text-xs font-medium">
            {revealed ? "Hide" : "Show"}
          </span>
        </button>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function Submit({
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

/** A low-weight text action — the way a step is left for another step. */
export function TextAction({
  children,
  onClick,
  testId,
}: {
  children: React.ReactNode
  onClick: () => void
  testId?: string
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      // ⚠ `min-h-11`, not bare text. A step form turns these from decoration into the primary way
      // people move backwards, and 033 shipped a 32px target under a comment claiming it cleared the
      // minimum (FR-042).
      className="min-h-11 w-full text-sm text-muted-foreground hover:text-foreground"
    >
      {children}
    </button>
  )
}

/**
 * A refusal.
 *
 * ⚠ `role="alert"` so it is announced, and the text stays on the foreground token — only the border
 * and a 10%-opacity wash carry the destructive colour. The platform has exactly two semantic colours
 * and `#e01010` is the only one permitted here (constitution Principle V).
 */
export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      data-testid="auth-error"
      className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground"
    >
      {children}
    </p>
  )
}

export function Divider() {
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

/**
 * Step chrome: a title, an optional subtitle, and a back affordance (036 FR-043).
 *
 * ⚠ "Where am I and can I go back" is a requirement, not polish. The old screens replaced the whole
 * form body with no announcement at all, so a screen-reader user had no signal that anything had
 * moved. `aria-live="polite"` on the heading region announces the new step without stealing focus.
 */
export function StepShell({
  title,
  subtitle,
  onBack,
  children,
}: {
  title: string
  subtitle?: React.ReactNode
  onBack?: () => void
  children: React.ReactNode
}) {
  return (
    <div className="space-y-6">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          data-testid="step-back"
          className="-ml-1 flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <span aria-hidden>←</span> Back
        </button>
      )}
      <div className="space-y-2" aria-live="polite">
        <h1 className="text-3xl font-extrabold uppercase tracking-[-0.02em]">{title}</h1>
        {subtitle && <div className="text-sm text-muted-foreground">{subtitle}</div>}
      </div>
      {children}
    </div>
  )
}
