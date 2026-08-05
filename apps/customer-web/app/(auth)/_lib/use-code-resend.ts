"use client"

import * as React from "react"

import { markCodeSent, secondsUntilResend } from "@/lib/otp-cooldown"

/**
 * ⚠ The platform's per-address ceiling, mirrored client-side (036 FR-009, R11).
 *
 * `apis/edge-api/auth/src/otp/policy.ts` sets `OTP_SENDS_PER_HOUR = 5` over a FIXED clock-hour bucket
 * keyed on `HMAC(email)`. One initial code plus four resends, and then the sends stop.
 *
 * ⚠ AND THE SIXTH FAILS SILENTLY, WHICH IS THE WHOLE REASON THIS COUNTER EXISTS. When the trigger
 * refuses, it still returns a normal challenge carrying a masked destination — so Amplify reports a
 * perfectly ordinary code step, the screen says "we emailed a code to a•••@…", and NO EMAIL WAS SENT.
 * The shopper then burns three guesses on a code that never existed and is told "that didn't work".
 *
 * Before 036 the screen had no resend at all, so this was rare. A step form with a prominent resend
 * button makes it common. Refusing locally at the ceiling is the only honest thing the UI can do.
 */
const MAX_SENDS_PER_FLOW = 5

/**
 * Resend state for a code step: the cooldown countdown, and the per-flow send ceiling.
 *
 * ⚠ THE LIMIT OF THIS HONESTY, STATED PLAINLY: the counter is per-FLOW. A shopper who already spent
 * their hourly budget in another tab, on another device, or twenty minutes ago starts this flow at
 * zero and will still be shown a normal code step for an email that will not arrive. The platform
 * cannot tell us — the trigger computes `retryAfterSeconds` and deliberately discards it so the
 * response cannot be used as an existence oracle. We must not pretend to know more than we do.
 */
export function useCodeResend(options: { onSend: () => Promise<void> }) {
  const [remaining, setRemaining] = React.useState(() => secondsUntilResend())
  const [sends, setSends] = React.useState(1) // the code that got us to this step counts as the first
  const [sending, setSending] = React.useState(false)

  // Keep the callback in a ref so the ticking effect below never has to re-subscribe when the caller
  // re-renders with a new closure.
  const onSendRef = React.useRef(options.onSend)
  onSendRef.current = options.onSend

  React.useEffect(() => {
    if (remaining <= 0) return
    // ⚠ One interval, recomputing from the stored timestamp rather than decrementing a counter. A
    // decrementing counter drifts when the tab is backgrounded and browsers throttle timers — the
    // shopper returns to a countdown that is wrong in the direction that keeps the button disabled.
    const id = window.setInterval(() => setRemaining(secondsUntilResend()), 1000)
    return () => window.clearInterval(id)
  }, [remaining])

  const atCeiling = sends >= MAX_SENDS_PER_FLOW
  const canResend = remaining <= 0 && !sending && !atCeiling

  const resend = React.useCallback(async () => {
    if (remaining > 0 || sending) return
    // ⚠ Refuse locally rather than firing a request that will silently send nothing.
    if (sends >= MAX_SENDS_PER_FLOW) return
    setSending(true)
    try {
      await onSendRef.current()
      markCodeSent()
      setRemaining(secondsUntilResend())
      setSends((n) => n + 1)
    } finally {
      setSending(false)
    }
  }, [remaining, sending, sends])

  /** Call when a code is sent by any route other than the resend button (the initial send). */
  const noteSent = React.useCallback(() => {
    markCodeSent()
    setRemaining(secondsUntilResend())
  }, [])

  return { remaining, canResend, atCeiling, sending, sends, resend, noteSent }
}
