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

/** Every auth field and button is 44px tall. */
const fieldClass = cn(inputClass, "h-11 md:h-11")

/**
 * The primitives every auth step shares. Anything `components/storefront/kit.tsx` defines is used from
 * there; only the auth-specific pieces (step chrome, terms notice, code call site) live here.
 */

/* Fields */

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
  /** The message beside this field; `null` when the value is acceptable. */
  error?: string | null
  // Ours takes the value, not the event.
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "id">) {
  return (
    <KitField label={label} htmlFor={id} hint={hint} error={error}>
      <input
        id={id}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // Announced and drawn: the border changes as well as the message appearing.
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={fieldClass}
        {...rest}
      />
    </KitField>
  )
}

/**
 * A password field with a reveal toggle, which replaces "CONFIRM PASSWORD". The toggle is a 44px target
 * with `aria-pressed` and a label naming its field.
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
  /** At the end of the label row, e.g. "Forgot your password?". */
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
          // Drawn 32px, pressable 44px: `after` extends the target.
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

/* The committing action */

/**
 * Never natively `disabled`: a disabled button is unfocusable and pressing it can explain nothing. It is
 * `aria-disabled`, reachable, looks like a normal primary button, and activating it while `blocked`
 * runs `onBlocked`, so every caller passing `blocked` must pass `onBlocked`. The form validates on
 * submit too (Enter in a field bypasses the button).
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
  /** The action cannot commit yet; stays reachable. */
  blocked?: boolean
  /** Called when an unavailable action is activated: say what is still needed. */
  onBlocked?: () => void
  /** The id of the `<form>` this submits (the button is bottom-anchored, outside the form element). */
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
          // A spinner is a micro-animation; it respects reduced motion.
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
        />
      )}
      {pending ? "Please wait…" : label}
    </button>
  )
}

/**
 * A full-width text action: how a step is left for another ("Use a password instead"). Full contrast and
 * semibold, a step below the primary action. `tone="subtle"` is for "I'll do this later", which must stay
 * subordinate to finishing. A 44px target.
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
 * An action inside a sentence ("Didn't get it? **Send another code**"): full-contrast, medium weight
 * and underlined, never colour alone (WCAG 1.4.1), with the sentence around it muted. A 44px-tall box
 * drawn at the height of its text.
 */
const hitArea = "relative after:absolute after:inset-x-0 after:-inset-y-3"

export const inlineActionClass = cn(
  "rounded-sm font-medium text-primary underline underline-offset-4 hover:opacity-80 aria-disabled:text-muted-foreground aria-disabled:no-underline",
  hitArea,
)

/** The quiet variant ("Wrong email? Change it"): underlined, in the sentence's colour. */
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
  /** Unavailable but reachable and able to explain itself, as `Submit`. */
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

/* Notices */

/** A refusal, announced (`role="alert"`): text on the foreground, only the border and a faint wash in the destructive colour. One per step. */
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

/** A non-error notice ("your password was changed, sign in again"), announced politely (`role="status"`), never styled as a failure. */
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
 * The terms notice wherever an account is created: the terms are agreed, the privacy policy
 * acknowledged; cookie consent cannot ride on it. Full-contrast text and underlined links (small grey
 * terms text has been held unenforceable). Links open in a new tab, so the per-tab Amplify challenge
 * survives.
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

/* Step chrome */

/** The address a step acts on, with the way to change it (replacing a "Back" control). */
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

/** The opposite journey ("Don't have an account? Join"), as a footer furthest from the main action. */
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

/** A titled notice above a step's heading, e.g. "Your cart is saved" when checkout sent the shopper here. */
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
 * One step: an optional notice, the heading, the body and the opposite journey. The heading region is
 * `aria-live="polite"`, so a screen reader hears each new step. Spacing is deliberately uneven (8px in
 * the heading, 32px between groups, 16px in the body) so proximity groups.
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
  /** A state step's mark (code expired, link sent, done), in a muted tile above the title. */
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

      {/* Skipped when a step has no body. */}
      {children && <div className="space-y-4">{children}</div>}

      {footer}
    </div>
  )
}
