"use client"

import * as React from "react"

import { OTP_LENGTH, OtpInput } from "@effy/design-system/ui"

import { capture } from "@/lib/telemetry"

import { useCodeResend } from "../_lib/use-code-resend"
import { ErrorNote, InlineAction, StepShell, Submit } from "./AuthKit"

/**
 * What the platform told us about a submitted code.
 *
 * ⚠ THIS VOCABULARY IS DELIBERATELY SMALL, AND THE OMISSIONS ARE THE POINT (036 FR-011, R10).
 *
 * There is no `expired`, no `superseded` and no `never_sent` on the sign-in route, because the
 * platform genuinely cannot distinguish them: `VerifyAuthChallenge` computes a reason
 * (`malformed | expired | mismatch | no-envelope`) and then DISCARDS it, returning only a boolean,
 * so that the response cannot be used to tell whether an account exists (FR-024). Inventing those
 * values here would put a fiction on the screen and then into the analytics.
 *
 * ⚠ `rejected` covers attempts 1 and 2, and it arrives WITHOUT AN EXCEPTION — Cognito simply
 * re-issues the challenge. That is the shape of the defect this component fixes: `SignInForm`
 * discarded `confirmSignIn`'s result and treated a re-issued challenge as success, navigating a
 * still-signed-out shopper away with nothing on screen.
 */
/** The code form’s id — lets the bottom-anchored submit button live outside the <form>. */
const FORM_ID = "code-step-form"
/** The exhausted step's restart form — the action is bottom-anchored and so lives outside it. */
const RESTART_FORM_ID = "code-restart-form"

export type CodeOutcome = "accepted" | "rejected" | "exhausted" | "stale"

export function CodeStep({
  destination,
  submitLabel,
  submitTestId,
  onSubmit,
  onResend,
  onChangeEmail,
  onBack,
  flow,
  distinguishableRefusals = false,
  parentError = null,
  children,
}: {
  /**
   * A message owned by the surrounding journey — a network failure, a stale session.
   *
   * ⚠ 044 FR-017 — IT IS PASSED IN RATHER THAN RENDERED OUTSIDE. `SignInForm`, `SignUpForm` and
   * `ResetPasswordForm` each used to render their own `<ErrorNote>` ABOVE `<CodeStep>`, which put it
   * outside the step shell entirely — above the back control, detached from the layout — while the
   * step rendered a second one inside. Two regions, both `role="alert"`, both able to be true at
   * once, both announced (defect D-05).
   */
  parentError?: string | null
  /** The address the code went to — masked by Cognito where it gives us a mask (FR-006). */
  destination: string
  submitLabel: string
  submitTestId: string
  onSubmit: (code: string) => Promise<CodeOutcome>
  onResend: () => Promise<void>
  onChangeEmail: () => void
  onBack?: () => void
  /** Which journey this step belongs to — telemetry only. */
  flow: "sign_in" | "sign_up" | "reset"
  /**
   * ⚠ Sign-UP confirmation and password reset run Cognito's MANAGED flow, which emits real
   * `CodeMismatchException` / `ExpiredCodeException` / `LimitExceededException`. There the cause is
   * genuine and the caller supplies a specific message. On the sign-IN route it is not, and this
   * component must not imply otherwise.
   */
  distinguishableRefusals?: boolean
  /** Extra fields submitted alongside the code — password reset sets the new password here. */
  children?: React.ReactNode
}) {
  const [code, setCode] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [exhausted, setExhausted] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [resendNote, setResendNote] = React.useState<string | null>(null)
  const [attempts, setAttempts] = React.useState(0)
  /**
   * What is still missing, said only once the shopper has asked for the action (044 FR-020).
   *
   * ⚠ NOT AN ERROR, and deliberately not in the error region. "You've typed four of six digits" is
   * information about an unfinished task, not a refusal — dressing it in the destructive treatment
   * would teach shoppers that the error colour means nothing much.
   */
  const [shortfall, setShortfall] = React.useState<string | null>(null)
  /** Whether the shopper has pressed the (unavailable) restart action while at the send ceiling. */
  const [ceilingNoticed, setCeilingNoticed] = React.useState(false)
  // ⚠ A ref, not `resend.sends`: that would reference `resend` inside its own `onSend` closure, before
  // the const is declared. The code that got us to this step is the first send.
  const sendOrdinal = React.useRef(1)

  const resend = useCodeResend({
    onSend: async () => {
      await onResend()
      sendOrdinal.current += 1
      capture({
        name: "auth_code_requested",
        props: { flow, sendOrdinal: sendOrdinal.current, trigger: "resend" },
      })
      setCode("")
      setError(null)
      setExhausted(false)
      // ⚠ Point at the NEWEST email, explicitly. Two codes can arrive out of order, and the older one
      // no longer works — a shopper reading their inbox top-down has no way to know which is which.
      setResendNote("New code sent. Use the most recent email — the older code no longer works.")
    },
  })

  // ⚠ Digits only, and NEVER truncated (FR-004). A longer value is kept, shown in full, and blocks
  // submission — because a code that is not six digits did not come from us, and quietly reshaping it
  // into something submittable is the exact defect 035 existed to fix.
  const onCodeChange = (raw: string) => {
    setCode(raw.replace(/\D/g, ""))
    setResendNote(null)
    // ⚠ Clears as soon as the shopper acts on it (FR-013). A "you're two digits short" message that
    // outlives the two digits is noise, and noise is how people learn to stop reading messages.
    setShortfall(null)
  }

  const tooLong = code.length > OTP_LENGTH
  const complete = code.length === OTP_LENGTH

  /**
   * The single message this step shows (044 FR-017).
   *
   * The step's own refusal wins over the journey's: if both are true, the one about the code the
   * shopper just typed is the more actionable of the two.
   */
  const message = error ?? parentError

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    // ⚠ NO AUTO-SUBMIT ANYWHERE IN THIS COMPONENT. Codes die after three wrong attempts and most
    // customers have no password to fall back on, so a mistyped last digit that submits itself spends
    // an attempt the shopper never chose to spend (FR-005).
    if (!complete || pending) return
    setPending(true)
    setResendNote(null)
    try {
      capture({ name: "auth_code_submitted", props: { flow, attempt: attempts + 1, lengthOk: true } })
      const outcome = await onSubmit(code)
      if (outcome !== "accepted") {
        capture({
          name: "auth_code_rejected",
          props: {
            flow,
            attempt: attempts + 1,
            outcome: outcome === "exhausted" ? "attempts_spent"
              : outcome === "stale" ? "session_timed_out"
              : "not_accepted",
          },
        })
        setAttempts((n) => n + 1)
      }
      if (outcome === "rejected") {
        // ⚠ The digits STAY. Clearing the field on a refusal makes the shopper retype five correct
        // characters to fix one wrong one (FR-010, SC-002).
        setError(
          distinguishableRefusals
            ? "That code isn't right. Check it and try again."
            : "That code wasn't accepted. Check it and try again.",
        )
      } else if (outcome === "exhausted") {
        setExhausted(true)
      }
      // "accepted" and "stale" are the caller's to act on — it navigates.
    } finally {
      setPending(false)
    }
  }

  // ── The attempt is over (FR-013, SC-019) ────────────────────────────────────────────────────────
  //
  // ⚠ A step, not a toast. The Cognito session really is finished, so leaving the shopper on a form
  // that still looks usable would invite them to keep typing into nothing.
  if (exhausted) {
    return (
      <StepShell
        anchor
        title="Let's start that again"
        subtitle="That code can't be used any more. We'll send you a fresh one."
        onBack={onBack}
        bottom={
          <>
            {/* ⚠ Also `aria-disabled` rather than `disabled` (044 FR-019/FR-020). This is a
                committing action too, and at the send ceiling it is the ONE control that can explain
                why nothing is happening — an inert button cannot. */}
            <Submit
              pending={resend.sending}
              label="Send a new code"
              testId="start-over"
              blocked={resend.atCeiling}
              onBlocked={() => setCeilingNoticed(true)}
              form={RESTART_FORM_ID}
            />
            <form id={RESTART_FORM_ID} onSubmit={(e) => { e.preventDefault(); void resend.resend() }} />
            {(resend.atCeiling || ceilingNoticed) && (
              <p className="text-sm font-medium text-muted-foreground" role="status">
                <CeilingNote />
              </p>
            )}
            <p className="text-center text-sm font-medium text-muted-foreground">
              Wrong email?{" "}
              <InlineAction onClick={onChangeEmail} testId="change-email">
                Use a different one
              </InlineAction>
            </p>
          </>
        }
      >
        {null}
      </StepShell>
    )
  }

  return (
    <StepShell
        anchor
      title="Enter your code"
      subtitle={
        <>
          We sent a code to <strong className="text-foreground">{destination}</strong>. The code works
          for 5 minutes.
        </>
      }
      onBack={onBack}
      bottom={
        <>
          {/*
            ⚠ AT THE BOTTOM OF THE SCREEN, in the thumb's reach — this step has exactly one committing
            action. The `form` attribute rather than nesting, so the button can live outside the
            <form> it submits and still be a real submit button.
          */}
          <Submit
            pending={pending}
            label={submitLabel}
            testId={submitTestId}
            blocked={!complete}
            // ⚠ FR-020 — pressing an unavailable action must SAY what is missing. Before 044 it was
            // natively `disabled`: the press did nothing, said nothing, and could not even be
            // reached by keyboard.
            onBlocked={() =>
              setShortfall(
                code.length === 0
                  ? `Enter the ${OTP_LENGTH}-digit code we emailed you.`
                  : `That's ${code.length} of ${OTP_LENGTH} digits.`,
              )
            }
            form={FORM_ID}
          />
          {/* ⚠ Reads as an ACTION, not as a caption (operator direction 2026-08-11). It was a
              full-width muted `TextAction`, which at the foot of the screen looked like a closing
              remark rather than the escape route it is — and it is the only way back to correct a
              mistyped address without abandoning the flow. Same treatment as the resend, from the
              same component, so the two cannot drift. */}
          <p className="text-center text-sm font-medium text-muted-foreground">
            Wrong email?{" "}
            <InlineAction onClick={onChangeEmail} testId="change-email">
              Change it
            </InlineAction>
          </p>
        </>
      }
    >
      <form id={FORM_ID} className="space-y-4" onSubmit={submit} noValidate>
        {/* ⚠ ONE ERROR REGION, and it is here — inside the shell, above the field it concerns
            (FR-017). The journey's own message arrives as `parentError` rather than being rendered
            outside this component by the caller (defect D-05). */}
        {message && <ErrorNote>{message}</ErrorNote>}

        {/* ⚠ EXPLICIT MARGINS, NOT `space-y` (operator direction 2026-08-11 — the label sat too close
            to the cells). `space-y` forces ONE gap for every sibling here, but the two gaps are doing
            different jobs: the label needs room to read as a heading for a 56px-tall control, while
            the message below needs to stay tight to the field it is about. One value cannot be right
            for both. */}
        <div>
          <label htmlFor="code" className="mb-4 block text-sm font-medium">
            Your code
          </label>
          <OtpInput
            id="code"
            name="code"
            // ⚠ The cells collapse back to a plain field when the value is too long. Six positions can
            // only show six characters, so an 8-digit paste rendered as cells would LOOK like a
            // six-digit code — visually reproducing the very truncation FR-004 forbids. Changing shape
            // is the signal.
            variant={tooLong ? "plain" : "cells"}
            aria-invalid={tooLong || message !== null}
            aria-describedby={tooLong ? "code-too-long" : shortfall ? "code-shortfall" : undefined}
            autoFocus
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
          />
          {tooLong ? (
            <p id="code-too-long" className="mt-2 text-sm text-destructive">
              That&apos;s {code.length} digits. An Effy code is always {OTP_LENGTH}.
            </p>
          ) : (
            shortfall && (
              <p
                id="code-shortfall"
                role="status"
                className="mt-2 text-sm font-medium text-muted-foreground"
              >
                {shortfall}
              </p>
            )
          )}
        </div>

        {children}

        <ResendControl resend={resend} note={resendNote} />
      </form>
    </StepShell>
  )
}

function ResendControl({
  resend,
  note,
}: {
  resend: ReturnType<typeof useCodeResend>
  note: string | null
}) {
  return (
    /*
     * ⚠ 044 FR-025 / defect D-03 — LEFT-ALIGNED, LIKE EVERYTHING ELSE ON THE STEP. This block used
     * to be centred while the heading, the label and the field were not, so a single screen carried
     * three alignments and nothing established a reading order.
     *
     * ⚠ 044 US1 AC-9 / defect D-06 — AND IT IS SUBORDINATE. Countdown, resend, spam-folder note and
     * support address used to be four separately-weighted lines that together out-massed the input
     * they were advising about. They are now one `text-sm` line of recovery and one `text-xs` line of
     * last resort.
     */
    <div className="space-y-1.5">
      {/* ⚠ `aria-live="polite"`, and the countdown lives in its own region so announcing it never
          moves focus off the code field (FR-015). A shopper mid-typing must not be interrupted. */}
      <p className="text-sm font-medium text-muted-foreground" aria-live="polite">
        {resend.atCeiling ? (
          <CeilingNote />
        ) : resend.remaining > 0 ? (
          <span data-testid="resend-countdown">Send another code in {resend.remaining}s</span>
        ) : (
          <>
            {/* ⚠ A TEXT ACTION, matching mobile word for word (FR-044). Resending is a recovery
                affordance, not a route through the flow — a bordered button gave it the same weight as
                a credential choice and stacked a second full-width control above the committing one. */}
            Didn&apos;t get it?{" "}
            {/* ⚠ `aria-disabled`, not `disabled` (044 FR-019), handled by `InlineAction`. While the
                cooldown runs this branch is not rendered at all, so the only way to reach the
                unavailable state is the send ceiling — exactly when the shopper most needs the
                control to be reachable and to say something. */}
            <InlineAction
              testId="resend-code"
              blocked={!resend.canResend}
              onClick={() => void resend.resend()}
            >
              {resend.sending ? "Sending…" : "Send another code"}
            </InlineAction>
          </>
        )}
      </p>
      {note && (
        <p className="text-sm font-medium text-muted-foreground" data-testid="resend-note">
          {note}
        </p>
      )}
    </div>
  )
}

/**
 * ⚠ The per-address hourly ceiling, said out loud (FR-009, R11).
 *
 * The platform allows five sends per address per clock hour. The SIXTH is refused by the trigger,
 * which then returns a NORMAL challenge carrying a masked destination — so without this the screen
 * would cheerfully announce "we sent a code" for an email that does not exist, and the shopper would
 * discover it only after burning three guesses.
 *
 * ⚠ What this cannot know: the counter is per-flow. A budget already spent in another tab, on another
 * device, or twenty minutes ago is invisible to us — the trigger computes a retry-after and discards
 * it deliberately, so that the response cannot answer "does this account exist?".
 */
function CeilingNote() {
  return (
    <span data-testid="resend-ceiling">
      We can&apos;t send another code to this address right now. Please try again later.
    </span>
  )
}
