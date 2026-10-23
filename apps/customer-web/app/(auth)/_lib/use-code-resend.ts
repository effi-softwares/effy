"use client"

import * as React from "react"

import { markCodeSent, secondsUntilResend } from "@/lib/otp-cooldown"

/**
 * The platform's per-address ceiling (`OTP_SENDS_PER_HOUR = 5` in `apis/edge-api/auth/src/otp/policy.ts`,
 * per clock hour): one code plus four resends. The sixth is refused yet looks like a normal code step,
 * so the UI refuses locally at the ceiling.
 */
const MAX_SENDS_PER_FLOW = 5

/** Resend state for a code step: the cooldown and the per-flow send ceiling (sends from other tabs or devices are invisible). */
export function useCodeResend(options: { onSend: () => Promise<void> }) {
  const [remaining, setRemaining] = React.useState(() => secondsUntilResend())
  const [sends, setSends] = React.useState(1)
  const [sending, setSending] = React.useState(false)

  // A ref, so the ticking effect never re-subscribes.
  const onSendRef = React.useRef(options.onSend)
  onSendRef.current = options.onSend

  React.useEffect(() => {
    if (remaining <= 0) return
    // Recomputed from the stored timestamp each tick: a decrementing counter drifts when the tab is throttled.
    const id = window.setInterval(() => setRemaining(secondsUntilResend()), 1000)
    return () => window.clearInterval(id)
  }, [remaining])

  const atCeiling = sends >= MAX_SENDS_PER_FLOW
  const canResend = remaining <= 0 && !sending && !atCeiling

  const resend = React.useCallback(async () => {
    if (remaining > 0 || sending) return
    // Refuse locally rather than send a request that will silently send nothing.
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

  /** Call when a code is sent by any route other than the resend button. */
  const noteSent = React.useCallback(() => {
    markCodeSent()
    setRemaining(secondsUntilResend())
  }, [])

  return { remaining, canResend, atCeiling, sending, sends, resend, noteSent }
}
