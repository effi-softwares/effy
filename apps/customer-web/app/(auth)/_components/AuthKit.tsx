"use client"

import * as React from "react"
import { Eye, EyeOff } from "lucide-react"

import {
  Display,
  Field as KitField,
  btnClass,
  input as inputClass,
} from "@/components/storefront/kit"

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
        className={`${inputClass} aria-invalid:border-destructive`}
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
 * ⚠ The toggle is `size-11` (44px) and carries `aria-pressed` plus a label naming its own field —
 * "Show password" alone is ambiguous the moment a screen has two password inputs.
 */
export function PasswordField({
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
  error?: string | null
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "id" | "type">) {
  const [revealed, setRevealed] = React.useState(false)
  return (
    <KitField label={label} htmlFor={id} hint={hint} error={error}>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={revealed ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`${inputClass} pr-14 aria-invalid:border-destructive`}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          aria-pressed={revealed}
          aria-label={`${revealed ? "Hide" : "Show"} ${label.toLowerCase()}`}
          className="absolute inset-y-0 right-0 flex size-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
      className={btnClass("primary", "md", `w-full ${pending ? "opacity-80" : ""}`)}
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
 * ⚠ `min-h-11`, not bare text. A step form turns these from decoration into the primary way people
 * move backwards, and 033 shipped a 32px target under a comment claiming it cleared the minimum.
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
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={`min-h-11 w-full rounded-full text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
        tone === "subtle"
          ? "font-medium text-muted-foreground hover:text-foreground"
          : "font-semibold text-foreground underline underline-offset-4 hover:opacity-80"
      }`}
    >
      {children}
    </button>
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
export const inlineActionClass =
  "min-h-11 rounded font-semibold text-foreground underline underline-offset-4 hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary aria-disabled:text-muted-foreground aria-disabled:no-underline aria-disabled:font-medium"

export function InlineAction({
  children,
  onClick,
  testId,
  blocked,
}: {
  children: React.ReactNode
  onClick: () => void
  testId?: string
  /** Unavailable, but still reachable and still able to explain itself — same rule as `Submit`. */
  blocked?: boolean
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
      className={inlineActionClass}
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
      className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground"
    >
      {children}
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
      className="rounded-md border border-border bg-muted/50 p-3 text-sm text-foreground"
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

/* ── Step chrome ─────────────────────────────────────────────────────────────────────────────── */

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
  anchor = false,
  children,
}: {
  title: string
  subtitle?: React.ReactNode
  onBack?: () => void
  /**
   * Fill the phone viewport and pin `bottom` to the foot of it.
   *
   * ⚠ OPT-IN, AND IT USED TO BE UNCONDITIONAL — which is the defect this fixes. `bottom` holds two
   * different things (see its own note): on a step with ONE committing action it is that action, and
   * pinning it in the thumb's reach is correct. On a step offering several routes it holds only the
   * opposite-journey link — "Don't have an account? Join" — and pinning THAT stretched the column to
   * full height, so the form sat at the top of a phone screen with a few hundred pixels of nothing
   * under it and a footer stranded at the bottom.
   *
   * Default is off: the content is its own height and the layout centres it.
   */
  anchor?: boolean
  /**
   * The bottom group — pinned to the foot of the screen on a phone.
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
    //
    // ⚠ `min-h` ONLY WHEN ANCHORED, and only below `sm`. `mt-auto` on the bottom group can only push
    // if the column is taller than its content, so the height is what makes anchoring work — and it
    // is also what makes a non-anchored step look empty. `5rem` is the layout's own vertical padding.
    <div
      className={`flex flex-col ${
        anchor ? "min-h-[calc(100svh-5rem)] flex-1 sm:min-h-0 sm:flex-none" : ""
      }`}
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          data-testid="step-back"
          // ⚠ `font-medium text-foreground`, not thin muted grey. It is chrome, so it stays
          // un-underlined and does not compete with the step's own routes — but on a step form it is
          // how people move backwards, and it has to be findable.
          className="-ml-1 mb-6 flex min-h-11 w-fit items-center gap-1 rounded-full pr-3 text-sm font-medium text-foreground hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span aria-hidden>←</span> Back
        </button>
      )}

      {/* GROUP 1 — what this screen is. Title and subtitle are one thought.
          ⚠ 044 FR-024 — the heading composes the storefront's own `Display` in NORMAL CASE and at a
          responsive size. It used to hardcode the merchandising all-caps display treatment at one
          fixed size, so "ENTER YOUR CODE" shouted at the same 30px on a 320px phone as on a desktop
          (defect D-18), and the storefront moved section headings off all-caps on 2026-08-09 while
          these screens did not. */}
      <div className="space-y-2" aria-live="polite">
        <Display as="h1" size="section" className="normal-case leading-tight">
          {title}
        </Display>
        {/* ⚠ `font-medium`, not regular (operator direction 2026-08-11). General Sans at regular
            weight in the muted step is thin enough to read as a caption; the supporting line on a
            step form carries real information ("we sent a code to X", "the code works for 5
            minutes") and has to survive being glanced at. */}
        {subtitle && <div className="text-sm font-medium text-muted-foreground">{subtitle}</div>}
      </div>

      {/* GROUP 2 — what you do here. ⚠ Skipped entirely when a step has no body (the exhausted code
          step is title + one action), so it does not leave a 40px hole where content would be. */}
      {children && <div className="mt-10 space-y-4">{children}</div>}

      {/* GROUP 3 — pushed to the bottom by `mt-auto` on a phone; a plain gap once centred.
          ⚠ 044 FR-027 — `sticky` on small screens with its own ground, so the committing action
          survives a software keyboard and a short landscape window. A keyboard does not shrink
          `vh`, which is why the column above it is measured in `svh`/`dvh` (see the auth layout). */}
      {bottom && (
        <div className="mt-auto space-y-3 pt-10 sm:static sticky bottom-0 bg-background pb-2 sm:bg-transparent sm:pb-0">
          {bottom}
        </div>
      )}
    </div>
  )
}
