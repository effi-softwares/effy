/**
 * A client-side cooldown on "email me a code" (FR-016).
 *
 * ⚠ This is COURTESY, not security. Anything enforced in a browser can be bypassed by not using a
 * browser. The real protections are Cognito's own per-user throttles, which are not adjustable and
 * therefore not forgettable:
 *
 *   • email OTP messages: 5–20 per address per hour, per requesting IP
 *   • ResendConfirmationCode: 5 per user per hour
 *   • ConfirmSignUp: 15 per user per hour
 *   • ForgotPassword: 5–20 per user per hour
 *
 * What this adds is a decent experience and a smaller bill: it stops an impatient customer hammering
 * the button, burning through their hourly allowance, and locking themselves out of their own
 * account for an hour — which is a support ticket caused entirely by us.
 *
 * ⚠ It is also worth knowing what this slice does NOT have: this is the platform's first endpoint
 * the entire internet can call, and it runs on Cognito's ESSENTIALS tier, which has NO threat
 * protection (breached-password detection and adaptive auth are PLUS-tier only). Route (a)
 * introduces passwords to a public consumer pool for the first time — PLUS should be priced before
 * production, and WAF belongs in front of these forms. Both are out of scope here, deliberately,
 * and recorded so they are not forgotten.
 */

const COOLDOWN_SECONDS = 30
const KEY = "effy_otp_last_sent"

export function secondsUntilResend(now: number = Date.now()): number {
  if (typeof window === "undefined") return 0

  const last = Number(window.sessionStorage.getItem(KEY) ?? 0)
  if (!last) return 0

  const elapsed = Math.floor((now - last) / 1000)
  return Math.max(0, COOLDOWN_SECONDS - elapsed)
}

export function markCodeSent(now: number = Date.now()): void {
  if (typeof window === "undefined") return
  window.sessionStorage.setItem(KEY, String(now))
}

export function clearCooldown(): void {
  if (typeof window === "undefined") return
  window.sessionStorage.removeItem(KEY)
}
