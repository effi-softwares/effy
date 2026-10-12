"use client"

import * as React from "react"

import { RefreshCcw } from "lucide-react"
import { OTP_LENGTH } from "@effy/design-system/ui"

import { btnClass } from "@/components/storefront/actions"
import { capture } from "@/lib/telemetry"

import { useCodeResend } from "../_lib/use-code-resend"
import { ErrorNote, InlineAction, StepShell, Submit } from "./AuthKit"
import { CodeField } from "./CodeField"

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
/**
 * `failed` — the code was fine and something AFTER it went wrong (the session could not be started).
 * The journey owns the message (`parentError`); this step must not blame the code for it.
 */
export type CodeOutcome = "accepted" | "rejected" | "exhausted" | "stale" | "failed"

export function CodeStep({
  destination,
  submitLabel,
  submitTestId,
  onSubmit,
  onResend,
  onChangeEmail,
  flow,
  purpose,
  footer,
  distinguishableRefusals = false,
  parentError = null,
  children,
}: {
  /** Why the code was sent, when the journey has a reason to say — " to confirm it is yours". */
  purpose?: string
  /** The opposite-journey link at the foot of the step. */
  footer?: React.ReactNode
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
    if (pending) return
    if (!complete) {
      // ⚠ FR-020 — an action that cannot commit must SAY what is missing. Enter in the field lands
      // here without touching the button.
      if (code.length === 0) setShortfall(`Enter the ${OTP_LENGTH}-digit code we emailed you.`)
      return
    }
    setPending(true)
    setResendNote(null)
    try {
      capture({ name: "auth_code_submitted", props: { flow, attempt: attempts + 1, lengthOk: true } })
      const outcome = await onSubmit(code)
      if (outcome !== "accepted" && outcome !== "failed") {
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

  // ── The attempt is over (FR-013, SC-019; reference: Code expired) ────────────────────────────────
  //
  // ⚠ A step, not a toast. The Cognito session really is finished, so leaving the shopper on a form
  // that still looks usable would invite them to keep typing into nothing.
  if (exhausted) {
    return (
      <StepShell
        icon={<RefreshCcw aria-hidden="true" />}
        title="Let's start that again"
        subtitle="That code can't be used any more. We'll send you a fresh one."
        footer={footer}
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void resend.resend()
          }}
        >
          {/* ⚠ `aria-disabled` rather than `disabled` (044 FR-019/FR-020). At the send ceiling this is
              the ONE control that can explain why nothing is happening — an inert button cannot. */}
          <Submit
            pending={resend.sending}
            label="Send a new code"
            testId="start-over"
            blocked={resend.atCeiling}
            onBlocked={() => setCeilingNoticed(true)}
          />
          <button
            type="button"
            data-testid="change-email"
            onClick={onChangeEmail}
            className={btnClass("outline", "lg", "h-11 w-full")}
          >
            Use a different email
          </button>
          {(resend.atCeiling || ceilingNoticed) && (
            <p className="text-sm text-muted-foreground" role="status">
              <CeilingNote />
            </p>
          )}
        </form>
      </StepShell>
    )
  }

  // The count is shown WHILE they type (reference: "That's 3 of 6 digits."), so the unavailable
  // action below it is never a mystery.
  const hint =
    code.length > 0 && !complete ? `That's ${code.length} of ${OTP_LENGTH} digits.` : shortfall

  return (
    <StepShell
      title="Check your email"
      subtitle={
        <>
          We sent a code to {destination}
          {purpose}. The code works for 5 minutes.
        </>
      }
      footer={footer}
    >
      <form className="space-y-4" onSubmit={submit} noValidate>
        {/* ⚠ ONE ERROR REGION, and it is here — inside the shell, above the field it concerns
            (FR-017). The journey's own message arrives as `parentError` rather than being rendered
            outside this component by the caller (defect D-05). */}
        {message && <ErrorNote>{message}</ErrorNote>}

        <div className="flex flex-col gap-2">
          <label htmlFor="code" className="text-sm font-medium leading-none">
            Your code
          </label>
          <CodeField
            id="code"
            name="code"
            invalid={message !== null}
            aria-describedby={tooLong ? "code-too-long" : hint ? "code-shortfall" : undefined}
            autoFocus
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
          />
          {tooLong ? (
            <p id="code-too-long" className="text-[13px] font-medium leading-[18px] text-destructive">
              That&apos;s {code.length} digits. An Effy code is always {OTP_LENGTH}.
            </p>
          ) : (
            hint && (
              // ⚠ NOT AN ERROR, and deliberately not in the error treatment: it is information about
              // an unfinished task, not a refusal.
              <p
                id="code-shortfall"
                role="status"
                className="text-[13px] leading-[18px] text-muted-foreground"
              >
                {hint}
              </p>
            )
          )}
        </div>

        {children}

        <Submit pending={pending} label={submitLabel} testId={submitTestId} blocked={!complete} />

        <ResendLine resend={resend} note={resendNote} onChangeEmail={onChangeEmail} />
      </form>
    </StepShell>
  )
}

/**
 * The two ways out of a code that is not arriving, as one quiet line under the action (reference:
 * "Didn't get it? Resend · Wrong email? Change it").
 *
 * ⚠ SUBORDINATE, AND ONE LINE (044 US1 AC-9 / defect D-06). Countdown, resend, note and change-email
 * used to be separately-weighted lines that together out-massed the input they were advising about.
 */
function ResendLine({
  resend,
  note,
  onChangeEmail,
}: {
  resend: ReturnType<typeof useCodeResend>
  note: string | null
  onChangeEmail: () => void
}) {
  return (
    <div className="space-y-1.5 text-sm text-muted-foreground">
      {/* ⚠ `aria-live="polite"`: announcing the countdown must never move focus off the code field
          (FR-015). A shopper mid-typing is not interrupted. */}
      <p aria-live="polite">
        {resend.atCeiling ? (
          <CeilingNote />
        ) : resend.remaining > 0 ? (
          <span data-testid="resend-countdown">Didn&apos;t get it? Resend in {resend.remaining}s</span>
        ) : (
          <>
            Didn&apos;t get it?{" "}
            {/* ⚠ `aria-disabled`, not `disabled` (044 FR-019), handled by `InlineAction`. */}
            <InlineAction
              testId="resend-code"
              blocked={!resend.canResend}
              onClick={() => void resend.resend()}
            >
              {resend.sending ? "Sending…" : "Resend"}
            </InlineAction>
          </>
        )}{" "}
        · Wrong email?{" "}
        <InlineAction quiet onClick={onChangeEmail} testId="change-email">
          Change it
        </InlineAction>
      </p>
      {note && <p data-testid="resend-note">{note}</p>}
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
