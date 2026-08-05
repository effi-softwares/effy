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
  form,
}: {
  pending: boolean
  label: string
  testId: string
  disabled?: boolean
  /**
   * The id of the `<form>` this submits.
   *
   * ⚠ Needed because the button is bottom-anchored and therefore renders OUTSIDE the form element.
   * Without it the button is inert and pressing Enter in the field is the only way to submit — which
   * is exactly the kind of thing that looks fine in review and fails on a phone.
   */
  form?: string
}) {
  return (
    <button
      type="submit"
      form={form}
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

/**
 * The terms notice, shown wherever an account is actually created (036 FR-047).
 *
 * ⚠ IT NAMES TWO DOCUMENTS, NOT THREE. The familiar "Terms, Privacy Policy and Cookie Use" string is
 * a US framing: cookie and tracking consent require a prior affirmative act under ePrivacy and cannot
 * ride on a passive sentence, so bundling it here would be non-compliant in the EU/UK. Terms are
 * "agreed"; a privacy policy is "acknowledged" — it is a notice, not a thing one consents to. Any
 * marketing opt-in needs its own unticked box and is deliberately not here.
 *
 * ⚠ FULL-CONTRAST TEXT AND UNDERLINED LINKS, both deliberate. Small type COMBINED with low contrast
 * is the exact failure a US court named when it refused to enforce terms shown in "tiny gray font"
 * (*Berman v. Freedom Financial*, 9th Cir. 2022) — and the muted step is the tempting choice on a
 * neutral ramp. The underline is not decoration either: with no brand hue there is no colour to
 * distinguish a link, and WCAG 1.4.1 failure F73 is precisely "using colour alone".
 *
 * ⚠ NEW TAB. Navigating away mid-flow would drop the in-flight Amplify challenge, which lives in
 * per-tab `sessionStorage` — the shopper would come back to a dead form.
 */
export function TermsNotice() {
  return (
    <p className="text-xs text-foreground">
      By continuing you agree to Effy&apos;s{" "}
      <a href="/legal/terms" target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">
        Terms of Service
      </a>{" "}
      and acknowledge our{" "}
      <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">
        Privacy Policy
      </a>
      .
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
  bottom,
  children,
}: {
  title: string
  subtitle?: React.ReactNode
  onBack?: () => void
  /**
   * The bottom group — pushed to the foot of the column on a phone.
   *
   * ⚠ TWO DIFFERENT THINGS GO HERE depending on the screen. On a step with ONE committing action
   * (the code step, the name step, a password step) it is that action, in the thumb's reach. On a
   * step offering several routes the actions belong with the fields they act on, and this holds only
   * the opposite-journey link — "Don't have an account? Join" — which is genuinely a footer.
   */
  bottom?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    // ⚠ THE SPACING IS DELIBERATELY UNEVEN, and that is the whole change. Everything used to sit in
    // one `space-y-6` stack, so the gap between the heading and the first field was the same as the
    // gap between a label and its input — and the screen read as a single crammed block. Gestalt
    // proximity only groups when the between-group gap is unmistakably larger than the within-group
    // one, so: 8px inside the heading, 40px to the body, 40px to the bottom group.
    <div className="flex flex-1 flex-col">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          data-testid="step-back"
          className="-ml-1 mb-6 flex min-h-11 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <span aria-hidden>←</span> Back
        </button>
      )}

      {/* GROUP 1 — what this screen is. Title and subtitle are one thought. */}
      <div className="space-y-2" aria-live="polite">
        <h1 className="text-3xl font-extrabold uppercase tracking-[-0.02em]">{title}</h1>
        {subtitle && <div className="text-sm text-muted-foreground">{subtitle}</div>}
      </div>

      {/* GROUP 2 — what you do here. ⚠ Skipped entirely when a step has no body (the exhausted code
          step is title + one action), so it does not leave a 40px hole where content would be. */}
      {children && <div className="mt-10 space-y-4">{children}</div>}

      {/* GROUP 3 — pushed to the bottom by `mt-auto` on a phone; a plain gap once centred. */}
      {bottom && <div className="mt-auto space-y-3 pt-10">{bottom}</div>}
    </div>
  )
}
