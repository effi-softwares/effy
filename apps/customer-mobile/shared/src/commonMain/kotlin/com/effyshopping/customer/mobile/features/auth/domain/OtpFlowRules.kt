package com.effyshopping.customer.mobile.features.auth.domain

/**
 * The one-time-code flow's decisions, as pure functions (036 T059).
 *
 * ⚠ WHY THESE ARE NOT METHODS ON THE VIEWMODEL. They were, and that made them untestable in practice:
 * `AuthViewModel` takes twelve collaborators including concrete `SessionManager` and
 * `CustomerNavigator` classes, so pinning "what happens on the sixth send" meant standing up the
 * entire auth stack in a fake. The result was that the two rules most likely to strand a real shopper
 * — the hourly send ceiling and the attempt cap — had **no coverage at all** on either mobile app.
 *
 * They are decisions, not effects: inputs in, verdict out, no suspend, no navigation, no I/O. That is
 * the domain layer's job (Principle VI), and it is what makes them assertable.
 */

/**
 * ⚠ Mirrors `OTP_SENDS_PER_HOUR` in `apis/edge-api/auth/src/otp/policy.ts`.
 *
 * The platform allows five codes per address per **fixed clock hour**, keyed on `HMAC(email)`. The
 * SIXTH is refused by the trigger — which then returns a NORMAL challenge carrying a masked
 * destination, so the app would cheerfully announce "we sent a code to a•••@…" for an email that does
 * not exist, and the shopper would find out only after burning three guesses.
 */
const val MAX_SENDS_PER_FLOW = 5

/** ⚠ Mirrors `OTP_MAX_ATTEMPTS`. Three wrong codes and the Cognito session is over, not merely wrong. */
const val MAX_OTP_ATTEMPTS = 3

/** The resend cooldown, matching customer-web's `otp-cooldown.ts`. */
const val RESEND_COOLDOWN_SECONDS = 30

/** What the resend control may do right now. */
enum class ResendVerdict {
    /** Send it. */
    Allowed,

    /** Still cooling down — the countdown is showing. */
    Cooldown,

    /**
     * ⚠ The per-address hourly budget is spent for this flow. Refuse LOCALLY and say so, rather than
     * firing a request that silently sends nothing.
     */
    Ceiling,

    /** A request is already in flight. */
    Busy,
}

/**
 * May the shopper ask for another code?
 *
 * ⚠ THE ORDER OF THESE CHECKS IS NOT ARBITRARY. `Busy` and `Cooldown` are transient and self-clearing;
 * `Ceiling` is not, and telling someone "wait 12 seconds" when the real answer is "not for another
 * forty minutes" would be a worse lie than saying nothing. Cooldown is checked first only because it
 * is the one the shopper can see counting down, so it is the one they are already expecting.
 */
fun resendVerdict(sendsThisFlow: Int, resendRemaining: Int, loading: Boolean): ResendVerdict = when {
    loading -> ResendVerdict.Busy
    resendRemaining > 0 -> ResendVerdict.Cooldown
    sendsThisFlow >= MAX_SENDS_PER_FLOW -> ResendVerdict.Ceiling
    else -> ResendVerdict.Allowed
}

/** How long the control stays unavailable after a send. */
fun cooldownAfterSend(): Int = RESEND_COOLDOWN_SECONDS

/** The attempt tally after a submission. */
data class AttemptTally(val used: Int, val exhausted: Boolean)

/**
 * Count a submitted code.
 *
 * ⚠ ONLY A REFUSED CODE COSTS AN ATTEMPT. A network drop, an unavailable backend or a WAF block are
 * not the shopper being wrong, and counting them would end a session that Cognito still considers
 * live — spending the allowance on our own outage.
 */
fun tallyAttempt(previous: Int, codeWasRefused: Boolean): AttemptTally {
    val used = if (codeWasRefused) previous + 1 else previous
    return AttemptTally(used = used, exhausted = used >= MAX_OTP_ATTEMPTS)
}

/**
 * ⚠ A resend starts a NEW Cognito session, whose attempt list is empty — so the cap resets with it.
 *
 * This is a real consequence of there being no resend API for a custom challenge: "resend" is a fresh
 * `signIn`, and the server genuinely has no memory of the previous session's guesses. Modelling it
 * any other way would show a shopper "1 attempt left" on a session that in fact allows three.
 */
fun tallyAfterResend(): AttemptTally = AttemptTally(used = 0, exhausted = false)
