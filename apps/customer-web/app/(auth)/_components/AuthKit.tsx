"use client"

import * as React from "react"
import Link from "next/link"
import { CircleAlert, Eye, EyeOff, User } from "lucide-react"

import {
  Field as KitField,
  btnClass,
  iconBtnClass,
  input as inputClass,
} from "@/components/storefront/kit"
import { cn } from "@/lib/utils"

/** The reference draws every auth field and button 44px tall, at every width. */
const fieldClass = cn(inputClass, "h-11 md:h-11")

/**
 * The primitives every auth step shares.
 *
 * ⚠ 044: THESE NOW COMPOSE THE STOREFRONT'S OWN KIT INSTEAD OF RESTATING IT (FR-023, defect D-17).
 *
 * 036 wrote local copies of `Field`, `Submit`, the heading and the spacing so the auth screens could
 * move quickly. Three silent divergences had already appeared by the time 044 looked: the field
 * padding (`px-3` vs the kit's `px-4`), the field ground (`bg-background` vs `bg-card`) and the focus
 * treatment (a ring vs the kit's offset outline). Worse, the local `Field` had **no error slot** —
 * which is precisely why these screens have never shown an inline validation message, while every
 * other form on the storefront can.
 *
 * The rule this file now follows: if `components/storefront/kit.tsx` defines it, do not define it
 * again here. What remains local is genuinely auth-specific — the step chrome, the terms notice, the
 * one-time-code call site.
 */

/* ── Fields ──────────────────────────────────────────────────────────────────────────────────── */

export function Field({
  label,
  id,
  value,
  onChange,
  hint,
  error,
  ...rest
}: {
  label: string
  id: string
  value: string
  onChange: (v: string) => void
  hint?: string
  /** The message to show beside this field. `null` when the value is acceptable (044 FR-012). */
  error?: string | null
  // Omit the native onChange — ours takes the value, not the event.
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "id">) {
  return (
    <KitField label={label} htmlFor={id} hint={hint} error={error}>
      <input
        id={id}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // ⚠ Announced AND drawn. Colour alone never carries a state on this platform (FR-019/SC-010),
        // so the border changes as well as the message appearing.
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={fieldClass}
        {...rest}
      />
    </KitField>
  )
}

/**
 * A password field with a reveal toggle (036 FR-030; 012 FR-023).
 *
 * ⚠ THE REVEAL IS WHAT REPLACES "CONFIRM PASSWORD". 012's FR-023 forbids asking for a re-typed
 * confirmation, on the GOV.UK reasoning that "a second field is not helpful for users, particularly
 * on password inputs with show and hide buttons". The account page already followed that rule; web
 * sign-up did not, and mobile sign-up never had a confirm field — so the two customer surfaces
 * disagreed. 036 settled it by REMOVING the field from web, not by adding one to mobile.
 *
 * ⚠ The toggle has a 44px target and carries `aria-pressed` plus a label naming its own field —
 * "Show password" alone is ambiguous the moment a screen has two password inputs.
 */
export function PasswordField({
  label,
  id,
  value,
  onChange,
  hint,
  error,
  labelAction,
  ...rest
}: {
  label: string
  id: string
  value: string
  onChange: (v: string) => void
  hint?: string
  error?: string | null
  /** Sits at the end of the label row — "Forgot your password?" on the sign-in step. */
  labelAction?: React.ReactNode
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "id" | "type">) {
  const [revealed, setRevealed] = React.useState(false)
  return (
    <KitField label={label} htmlFor={id} hint={hint} error={error} labelAction={labelAction}>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={revealed ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(fieldClass, "pr-12")}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          aria-pressed={revealed}
          aria-label={`${revealed ? "Hide" : "Show"} ${label.toLowerCase()}`}
          // ⚠ Drawn 32px, pressable 44px: the `after` box extends the target without moving anything.
          className={iconBtnClass("ghost", "sm", "absolute top-1.5 right-1.5 after:absolute after:-inset-1.5")}
        >
          {revealed ? (
            <EyeOff aria-hidden className="size-4" />
          ) : (
            <Eye aria-hidden className="size-4" />
          )}
        </button>
      </div>
    </KitField>
  )
}

/* ── The committing action ───────────────────────────────────────────────────────────────────── */

/**
 * ⚠ NEVER `disabled`. THIS IS THE POINT OF THE COMPONENT (044 FR-019/FR-020, research R4).
 *
 * The old button set the native `disabled` attribute and faded to 60% opacity. Three things were
 * wrong with that, and they compound:
 *
 *  1. On a near-black monochrome fill, 60% opacity renders as an ordinary mid-grey — it reads as an
 *     enabled secondary button. The operator's screenshot shows exactly this: a "Sign in" button that
 *     looks pressable and does nothing (defect D-04).
 *  2. A `disabled` button cannot take focus and is skipped by keyboard navigation and by many
 *     screen-reader element lists. The one control that could explain the situation is the one
 *     control the customer cannot reach.
 *  3. Because it is inert, pressing it CANNOT be the moment the screen says what is missing — and
 *     FR-020 requires exactly that.
 *
 * So: `aria-disabled`, focusable, in the tab order, and activating it runs `onBlocked`.
 *
 * ⚠ IT LOOKS THE SAME WHETHER OR NOT IT CAN COMMIT (operator direction, 2026-08-11), and that is a
 * deliberate reversal of this slice's first attempt. That version drew the unavailable state as a
 * dashed outline — visually honest, and it made the primary action of every step look provisional and
 * unfinished. The operator's call is that the button is always a normal primary button.
 *
 * ⚠ WHAT KEEPS THAT HONEST IS `onBlocked`, and it is now load-bearing rather than a nicety. The
 * original complaint (defect D-04) was not "the disabled state is badly styled" — it was "I press it
 * and nothing happens". A button that always looks pressable AND always responds when pressed does
 * not have that problem; a button that looks pressable and silently does nothing does. So every
 * caller MUST pass `onBlocked` where it passes `blocked`. Without it this is the original defect with
 * better colours.
 *
 * ⚠ The form is still guarded independently. `onBlocked` covers a press; pressing Enter inside a
 * field submits the form without touching this button, so the caller's `onSubmit` validates too.
 */
export function Submit({
  pending,
  label,
  testId,
  blocked,
  onBlocked,
  form,
}: {
  pending: boolean
  label: string
  testId: string
  /** True when the action cannot commit yet. Renders unavailable — but stays reachable. */
  blocked?: boolean
  /** Called when an unavailable action is activated. Say what is still needed (FR-020). */
  onBlocked?: () => void
  /**
   * The id of the `<form>` this submits.
   *
   * ⚠ Needed because the button is bottom-anchored and therefore renders OUTSIDE the form element.
   * Without it the button is inert and pressing Enter in the field is the only way to submit — which
   * is exactly the kind of thing that looks fine in review and fails on a phone.
   */
  form?: string
}) {
  const unavailable = Boolean(blocked) || pending
  return (
    <button
      type="submit"
      form={form}
      aria-disabled={unavailable || undefined}
      data-testid={testId}
      onClick={(e) => {
        if (!unavailable) return
        // Stops the submission without making the control inert.
        e.preventDefault()
        if (!pending) onBlocked?.()
      }}
      className={btnClass("primary", "lg", "h-11 w-full")}
    >
      {pending && (
        <span
          aria-hidden
          // `motion-reduce:animate-none` — a spinner is a micro-animation, and the constitution asks
          // for those; it does not ask for them to be forced on someone who turned motion off.
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
        />
      )}
      {pending ? "Please wait…" : label}
    </button>
  )
}

/**
 * A full-width text action — the way a step is left for another step.
 *
 * ⚠ THESE ARE ROUTES THROUGH THE PRODUCT, NOT FOOTNOTES (operator direction 2026-08-11). "Use a
 * password instead" and "Email me a code instead" are how a shopper reaches the credential they
 * actually have; drawn as thin muted text they read as captions and get missed. They are now
 * full-contrast and semibold — one clear step below the filled primary action, and unmistakably above
 * ordinary copy.
 *
 * ⚠ `tone="subtle"` exists for exactly one caller: the name step's "I'll do this later". FR-035
 * requires that one to stay visually SUBORDINATE to finishing, so it keeps the muted treatment — but
 * at medium weight rather than regular, so it is still legible rather than merely quiet.
 *
 * ⚠ A 44px target, not bare text (`hitArea`). A step form turns these from decoration into the
 * primary way people move backwards, and 033 shipped a 32px target under a comment claiming it
 * cleared the minimum.
 */
export function TextAction({
  children,
  onClick,
  testId,
  tone = "default",
}: {
  children: React.ReactNode
  onClick: () => void
  testId?: string
  tone?: "default" | "subtle"
}) {
  return (
    <div className="flex justify-center">
      <button
        type="button"
        data-testid={testId}
        onClick={onClick}
        className={cn(
          "rounded-sm text-sm",
          hitArea,
          tone === "subtle"
            ? "font-medium text-muted-foreground hover:text-foreground"
            : "font-semibold text-foreground underline underline-offset-4 hover:opacity-80",
        )}
      >
        {children}
      </button>
    </div>
  )
}

/**
 * An action inside a sentence — "Didn't get it? **Send another code**".
 *
 * ⚠ ONE DEFINITION, because there were about to be three. The resend control hand-rolled these
 * classes inline in `CodeStep`, and the change-email affordance used `TextAction` instead — so two
 * controls doing the same job (a recovery route offered as prose) looked different, and the one at
 * the bottom of the screen read as inert grey text rather than something to press.
 *
 * ⚠ UNDERLINED, NOT COLOURED. There is no brand hue on this platform to distinguish a link with, and
 * WCAG 1.4.1 failure F73 is precisely "using colour alone". The underline plus the full-contrast
 * foreground is what makes it read as an action; the lead-in text around it stays muted so the
 * contrast between them is the affordance.
 *
 * ⚠ `min-h-11` — 44px. These are the primary way people move BACKWARDS through a step form, not
 * decoration, and 033 shipped a 32px target under a comment claiming it cleared the minimum.
 */
/**
 * The one treatment for "this is something you can press", wherever it appears inline.
 *
 * ⚠ FULL-CONTRAST FOREGROUND AND `font-medium`, NOT MUTED REGULAR (operator direction 2026-08-11).
 * General Sans at regular weight in the muted step reads as a caption, not a control — the operator's
 * report was that these "are not noticeable, too thin". On a monochrome platform there is no hue to
 * mark an action with, so weight, contrast and the underline are the entire vocabulary available.
 */
/**
 * A 44px-tall pressable box around a one-line text control, drawn at the height of its text. The
 * reference sets these links a line apart; padding them out to 44px would push every step's rhythm.
 */
const hitArea = "relative after:absolute after:inset-x-0 after:-inset-y-3"

export const inlineActionClass = cn(
  "rounded-sm font-medium text-primary underline underline-offset-4 hover:opacity-80 aria-disabled:text-muted-foreground aria-disabled:no-underline",
  hitArea,
)

/** The quiet variant — "Wrong email? Change it" — underlined, in the colour of the sentence around it. */
export const quietActionClass = cn("rounded-sm underline underline-offset-4 hover:text-foreground", hitArea)

export function InlineAction({
  children,
  onClick,
  testId,
  blocked,
  quiet = false,
}: {
  children: React.ReactNode
  onClick: () => void
  testId?: string
  /** Unavailable, but still reachable and still able to explain itself — same rule as `Submit`. */
  blocked?: boolean
  quiet?: boolean
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-disabled={blocked || undefined}
      onClick={() => {
        if (blocked) return
        onClick()
      }}
      className={quiet ? quietActionClass : inlineActionClass}
    >
      {children}
    </button>
  )
}

/* ── Notices ─────────────────────────────────────────────────────────────────────────────────── */

/**
 * A refusal.
 *
 * ⚠ `role="alert"` so it is announced, and the text stays on the foreground token — only the border
 * and a 10%-opacity wash carry the destructive colour. The platform has exactly two semantic colours
 * and `#e01010` is the only one permitted here (constitution Principle V).
 *
 * ⚠ 044 FR-017 — THERE IS ONE OF THESE PER STEP. Before this slice the code step rendered its own
 * error inside the step while its parent rendered a second one OUTSIDE the shell, above the back
 * control; both were `role="alert"`, both could be true at once, and both announced (defect D-05).
 */
export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      data-testid="auth-error"
      className="flex items-start gap-3 rounded-lg border border-destructive bg-card px-4 py-3 text-sm font-medium text-foreground"
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

/**
 * A non-error notice — "your password was changed, sign in again" (044 FR-034).
 *
 * ⚠ IT IS DELIBERATELY NOT AN ALERT, AND NOT THE ERROR TREATMENT. A completed security action
 * presenting as a failure is the defect this exists to fix, not a style choice: today a shopper who
 * successfully resets a password is silently signed out and dumped on sign-in with no explanation at
 * all (defect D-14). `role="status"` announces it politely without interrupting.
 */
export function InfoNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="status"
      data-testid="auth-notice"
      className="rounded-lg bg-muted px-4 py-3 text-sm text-foreground"
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
    <p className="text-xs leading-[1.6] text-foreground">
      By continuing you agree to Effy&apos;s{" "}
      <a href="/legal/terms" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
        Terms of Service
      </a>{" "}
      and acknowledge our{" "}
      <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
        Privacy Policy
      </a>
      .
    </p>
  )
}

export function Divider() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      OR
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

/* ── Step chrome ─────────────────────────────────────────────────────────────────────────────── */

/**
 * The address a step is acting on, with the way to change it (reference: Sign in — password,
 * Join — password).
 *
 * ⚠ This is what replaced the "← Back" control. On a step that no longer shows the email field, the
 * shopper still has to be able to see WHICH address they are about to sign in as, and fix it.
 */
export function EmailChip({ email, onChange }: { email: string; onChange: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
      <User aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{email}</span>
      <InlineAction onClick={onChange} testId="change-address">
        Change
      </InlineAction>
    </div>
  )
}

/**
 * The opposite journey — "Don't have an account? Join" — at the foot of a step.
 *
 * ⚠ A FOOTER, not an action: furthest from the thing the shopper came here to do.
 */
export function AltJourney({
  lead,
  href,
  children,
}: {
  lead: string
  href: string
  children: React.ReactNode
}) {
  return (
    <p className="text-center text-sm text-muted-foreground">
      {lead}{" "}
      <Link
        href={href}
        className={cn("rounded-sm font-semibold text-foreground underline underline-offset-4", hitArea)}
      >
        {children}
      </Link>
    </p>
  )
}

/**
 * A titled notice above a step's heading — "Your cart is saved" when checkout sent the shopper here.
 */
export function NoticeCard({
  icon,
  title,
  children,
  testId,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
  testId?: string
}) {
  return (
    <div
      role="status"
      data-testid={testId}
      className="grid grid-cols-[16px_1fr] items-start gap-x-3 gap-y-0.5 rounded-lg bg-primary-muted px-4 py-3 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:text-primary"
    >
      {icon}
      <div className="font-medium">{title}</div>
      <div className="col-start-2 text-muted-foreground">{children}</div>
    </div>
  )
}

/**
 * One step: an optional notice, what this screen is, what you do here, and the way to the opposite
 * journey (reference: Shared components · Auth card template).
 *
 * ⚠ "Where am I" is a requirement, not polish (036 FR-043). Every step replaces the whole form body,
 * so the heading region is `aria-live="polite"`: a screen-reader user hears the new step without
 * focus being moved.
 *
 * ⚠ THE SPACING IS DELIBERATELY UNEVEN: 8px inside the heading, 32px between the groups, 16px inside
 * the body. Proximity only groups when the between-group gap is unmistakably the larger one.
 */
export function StepShell({
  title,
  subtitle,
  icon,
  notice,
  footer,
  children,
}: {
  title: string
  subtitle?: React.ReactNode
  /** A state step's mark — code expired, link sent, done. Drawn in a muted tile above the title. */
  icon?: React.ReactNode
  notice?: React.ReactNode
  footer?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="space-y-8">
      {notice}

      <div className="space-y-2" aria-live="polite">
        {icon && (
          <div className="mb-3 grid size-12 place-items-center rounded-lg bg-muted [&>svg]:size-6">
            {icon}
          </div>
        )}
        <h1 className="text-[38px] font-semibold leading-[1.1] tracking-[-0.025em] text-balance">
          {title}
        </h1>
        {subtitle && <div className="text-muted-foreground">{subtitle}</div>}
      </div>

      {/* ⚠ Skipped entirely when a step has no body, so it leaves no hole where content would be. */}
      {children && <div className="space-y-4">{children}</div>}

      {footer}
    </div>
  )
}
