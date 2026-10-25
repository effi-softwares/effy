"use client"

import * as React from "react"

import { RefreshCcw } from "lucide-react"
import { OTP_LENGTH } from "@effy/design-system/ui"

import { btnClass } from "@/components/storefront/actions"
import { capture } from "@/lib/telemetry"

import { useCodeResend } from "../_lib/use-code-resend"
import { ErrorNote, InlineAction, StepShell, Submit } from "./AuthKit"
import { CodeField } from "@/components/storefront/CodeField"

/**
 * What the platform said about a submitted code. Small on purpose: the sign-in trigger discards why a
 * code failed (so the response cannot reveal whether an account exists), so there is no `expired` or
 * `never_sent` here. `rejected` (attempts 1 and 2) arrives as a re-issued challenge, not an exception.
 */
/** `failed`: the code was fine and something after it went wrong; the journey owns the message (`parentError`). */
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
  /** Why the code was sent, when the journey has a reason to say (" to confirm it is yours"). */
  purpose?: string
  /** The opposite-journey link at the foot of the step. */
  footer?: React.ReactNode
  /** A message owned by the journey (a network failure, a stale session), shown in this step's one error region. */
  parentError?: string | null
  /** Where the code went, masked by Cognito where it gives a mask. */
  destination: string
  submitLabel: string
  submitTestId: string
  onSubmit: (code: string) => Promise<CodeOutcome>
  onResend: () => Promise<void>
  onChangeEmail: () => void
  /** Which journey this step belongs to — telemetry only. */
  flow: "sign_in" | "sign_up" | "reset"
  /** Sign-up confirmation and reset use Cognito's managed flow, with real mismatch/expiry/limit exceptions; the caller supplies the message. Not so on sign-in. */
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
  /** What is still missing, said once the shopper asked for the action. Information, not an error. */
  const [shortfall, setShortfall] = React.useState<string | null>(null)
  /** Whether the shopper pressed the unavailable restart at the send ceiling. */
  const [ceilingNoticed, setCeilingNoticed] = React.useState(false)
  // A ref, not `resend.sends` (that would reference `resend` in its own `onSend`). The first send got us here.
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
      // Point at the newest email: codes can arrive out of order and the older one no longer works.
      setResendNote("New code sent. Use the most recent email — the older code no longer works.")
    },
  })

  // Digits only, never truncated: a longer value is shown and blocks submission.
  const onCodeChange = (raw: string) => {
    setCode(raw.replace(/\D/g, ""))
    setResendNote(null)
    // Clears as soon as the shopper acts on it.
    setShortfall(null)
  }

  const tooLong = code.length > OTP_LENGTH
  const complete = code.length === OTP_LENGTH

  /** The one message this step shows; the step's own refusal wins over the journey's. */
  const message = error ?? parentError

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    // No auto-submit: codes die after three wrong attempts, and most customers have no password.
    if (pending) return
    if (!complete) {
      // An action that cannot commit says what is missing; Enter in the field lands here.
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
        // The digits stay, so one wrong character is fixed without retyping five.
        setError(
          distinguishableRefusals
            ? "That code isn't right. Check it and try again."
            : "That code wasn't accepted. Check it and try again.",
        )
      } else if (outcome === "exhausted") {
        setExhausted(true)
      }
      // "accepted" and "stale" are the caller's to act on.
    } finally {
      setPending(false)
    }
  }

  // The attempt is over: a step, not a toast, since the Cognito session really is finished.
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
          {/* `aria-disabled`: at the send ceiling this is the one control that can explain why nothing happens. */}
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

  // The count is shown while they type ("That's 3 of 6 digits."), so the unavailable action is no mystery.
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
        {/* The one error region, inside the shell above the field; the journey's message arrives as `parentError`. */}
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
            <p id="code-too-long" className="text-sm font-medium leading-5 text-destructive">
              That&apos;s {code.length} digits. An Effy code is always {OTP_LENGTH}.
            </p>
          ) : (
            hint && (
              // Information about an unfinished task, not a refusal.
              <p
                id="code-shortfall"
                role="status"
                className="text-sm leading-5 text-muted-foreground"
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

/** The ways out of a code that is not arriving, as one quiet line ("Didn't get it? Resend · Wrong email? Change it"). */
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
    <div className="space-y-2 text-sm text-muted-foreground">
      {/* `aria-live="polite"`: the countdown is announced without moving focus off the field. */}
      <p aria-live="polite">
        {resend.atCeiling ? (
          <CeilingNote />
        ) : resend.remaining > 0 ? (
          <span data-testid="resend-countdown">Didn&apos;t get it? Resend in {resend.remaining}s</span>
        ) : (
          <>
            Didn&apos;t get it?{" "}
            {/* `aria-disabled`, handled by `InlineAction`. */}
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
 * The hourly send ceiling (five per address), said out loud: the sixth is refused but still returns a
 * normal-looking challenge. This flow cannot see sends from another tab or device (the trigger discards
 * the retry-after, so the response reveals nothing about the account).
 */
function CeilingNote() {
  return (
    <span data-testid="resend-ceiling">
      We can&apos;t send another code to this address right now. Please try again later.
    </span>
  )
}
