"use client"

import * as React from "react"

import { OTP_LENGTH, OtpInput } from "@effy/design-system/ui"

import { capture } from "@/lib/telemetry"

import { useCodeResend } from "../_lib/use-code-resend"
import { ErrorNote, StepShell, Submit, TextAction } from "./AuthKit"

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
  children,
}: {
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
  }

  const tooLong = code.length > OTP_LENGTH
  const complete = code.length === OTP_LENGTH

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
        title="Let's start that again"
        subtitle="That code can't be used any more. We'll send you a fresh one."
        onBack={onBack}
        bottom={
          <>
            <button
              type="button"
              data-testid="start-over"
              disabled={resend.sending || resend.atCeiling}
              onClick={() => void resend.resend()}
              className="h-11 w-full rounded-full bg-primary text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {resend.sending ? "Please wait…" : "Send a new code"}
            </button>
            {resend.atCeiling && <CeilingNote />}
            <TextAction onClick={onChangeEmail} testId="change-email">
              Use a different email
            </TextAction>
          </>
        }
      >
        {null}
      </StepShell>
    )
  }

  return (
    <StepShell
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
            disabled={!complete}
            form={FORM_ID}
          />
          <TextAction onClick={onChangeEmail} testId="change-email">
            Wrong email? Change it
          </TextAction>
        </>
      }
    >
      <form id={FORM_ID} className="space-y-4" onSubmit={submit}>
        {error && <ErrorNote>{error}</ErrorNote>}

        <div className="space-y-2">
          <label htmlFor="code" className="text-sm font-medium">
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
            aria-invalid={tooLong || error !== null}
            aria-describedby={tooLong ? "code-too-long" : undefined}
            autoFocus
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            required
          />
          {tooLong && (
            <p id="code-too-long" className="text-sm text-destructive">
              That&apos;s {code.length} digits. An Effy code is always {OTP_LENGTH}.
            </p>
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
    <div className="space-y-2">
      {/* ⚠ `aria-live="polite"`, and the countdown lives in its own region so announcing it never
          moves focus off the code field (FR-015). A shopper mid-typing must not be interrupted. */}
      <p className="text-center text-sm text-muted-foreground" aria-live="polite">
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
            <button
              type="button"
              data-testid="resend-code"
              disabled={!resend.canResend}
              onClick={() => void resend.resend()}
              className="min-h-11 font-medium text-foreground underline underline-offset-4 hover:opacity-80 disabled:opacity-60"
            >
              {resend.sending ? "Sending…" : "Send another code"}
            </button>
          </>
        )}
      </p>
      {note && (
        <p className="text-center text-sm text-muted-foreground" data-testid="resend-note">
          {note}
        </p>
      )}
      {!resend.atCeiling && (
        <p className="text-center text-xs text-muted-foreground">
          Check your spam folder if it doesn&apos;t arrive.
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
      We can&apos;t send another code to this address right now. Check your spam folder, or try again
      later.
    </span>
  )
}
