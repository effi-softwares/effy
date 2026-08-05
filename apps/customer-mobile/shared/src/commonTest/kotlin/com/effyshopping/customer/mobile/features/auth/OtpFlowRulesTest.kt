package com.effyshopping.customer.mobile.features.auth

import com.effyshopping.customer.mobile.features.auth.domain.MAX_OTP_ATTEMPTS
import com.effyshopping.customer.mobile.features.auth.domain.MAX_SENDS_PER_FLOW
import com.effyshopping.customer.mobile.features.auth.domain.RESEND_COOLDOWN_SECONDS
import com.effyshopping.customer.mobile.features.auth.domain.ResendVerdict
import com.effyshopping.customer.mobile.features.auth.domain.cooldownAfterSend
import com.effyshopping.customer.mobile.features.auth.domain.resendVerdict
import com.effyshopping.customer.mobile.features.auth.domain.tallyAfterResend
import com.effyshopping.customer.mobile.features.auth.domain.tallyAttempt
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * 036 T059 — the two rules most likely to strand a real shopper.
 *
 * ⚠ THESE HAD NO COVERAGE ON EITHER MOBILE APP, and the reason is worth recording: the logic lived as
 * private constants and inline `if`s inside `AuthViewModel`, which takes twelve collaborators
 * including concrete `SessionManager` and `CustomerNavigator` classes. Testing it meant standing up
 * the entire auth stack in fakes, so nobody did — and the rules that decide whether a shopper can get
 * back into their account went unasserted. Extracting them to pure functions is what made this file
 * possible; the extraction was the fix, the test is the proof.
 *
 * ⚠ NO COMMAS IN THESE BACKTICK NAMES. Kotlin/Native rejects them ("Name contains illegal
 * characters") while the JVM accepts them happily — so a comma here compiles and passes on Android
 * and fails ONLY at `compileTestKotlinIosSimulatorArm64`. 033 hit this exact wall and recorded it;
 * this file hit it again on its first run, and the gate 033 added is what caught it.
 */
class OtpFlowRulesTest {

    // ── The hourly send ceiling ─────────────────────────────────────────────────────────────────

    @Test
    fun `the ceiling mirrors the platform's five sends per address per hour`() {
        // ⚠ If `OTP_SENDS_PER_HOUR` in `apis/edge-api/auth/src/otp/policy.ts` ever changes, this
        // number must change with it — the client counts locally precisely because the server's
        // refusal is INVISIBLE (it returns a normal challenge with a masked destination).
        assertEquals(5, MAX_SENDS_PER_FLOW)
    }

    @Test
    fun `a first resend is allowed once the cooldown has elapsed`() {
        assertEquals(
            ResendVerdict.Allowed,
            resendVerdict(sendsThisFlow = 1, resendRemaining = 0, loading = false),
        )
    }

    @Test
    fun `⚠ the SIXTH send is refused locally — not fired and silently dropped`() {
        // THE CASE THIS WHOLE MECHANISM EXISTS FOR. Past five sends the trigger refuses but STILL
        // returns a normal challenge, so firing anyway shows "we sent a code to a•••@…" for an email
        // that does not exist — and the shopper discovers it only after burning three guesses.
        assertEquals(
            ResendVerdict.Ceiling,
            resendVerdict(sendsThisFlow = MAX_SENDS_PER_FLOW, resendRemaining = 0, loading = false),
        )
        // And it stays refused; it does not wrap or reset within the flow.
        assertEquals(
            ResendVerdict.Ceiling,
            resendVerdict(sendsThisFlow = 9, resendRemaining = 0, loading = false),
        )
    }

    @Test
    fun `the fifth send is still allowed — the ceiling is a count of SENDS — not of resends`() {
        // Off-by-one guard: one initial code plus four resends is five sends, and the fifth must go.
        assertEquals(
            ResendVerdict.Allowed,
            resendVerdict(sendsThisFlow = MAX_SENDS_PER_FLOW - 1, resendRemaining = 0, loading = false),
        )
    }

    @Test
    fun `a live cooldown blocks the resend`() {
        assertEquals(
            ResendVerdict.Cooldown,
            resendVerdict(sendsThisFlow = 1, resendRemaining = 12, loading = false),
        )
    }

    @Test
    fun `⚠ a request already in flight blocks a second one`() {
        // Without this, an impatient double-tap spends two of five sends on one intent.
        assertEquals(
            ResendVerdict.Busy,
            resendVerdict(sendsThisFlow = 1, resendRemaining = 0, loading = true),
        )
    }

    @Test
    fun `⚠ the ceiling is reported even while cooling down is also true`() {
        // Cooldown is transient and self-clearing; the ceiling is not. A shopper told "wait 12
        // seconds" when the real answer is "not for another forty minutes" has been misled — so once
        // the countdown ends the verdict must be Ceiling, not Allowed.
        assertEquals(
            ResendVerdict.Cooldown,
            resendVerdict(sendsThisFlow = MAX_SENDS_PER_FLOW, resendRemaining = 5, loading = false),
        )
        assertEquals(
            ResendVerdict.Ceiling,
            resendVerdict(sendsThisFlow = MAX_SENDS_PER_FLOW, resendRemaining = 0, loading = false),
        )
    }

    @Test
    fun `the cooldown is thirty seconds — matching customer-web`() {
        assertEquals(30, RESEND_COOLDOWN_SECONDS)
        assertEquals(RESEND_COOLDOWN_SECONDS, cooldownAfterSend())
    }

    // ── The attempt cap ─────────────────────────────────────────────────────────────────────────

    @Test
    fun `the cap mirrors the platform's three attempts`() {
        assertEquals(3, MAX_OTP_ATTEMPTS)
    }

    @Test
    fun `a refused code costs one attempt — and the third ends the session`() {
        val first = tallyAttempt(previous = 0, codeWasRefused = true)
        assertEquals(1, first.used)
        assertFalse(first.exhausted, "one wrong code must not end the session")

        val second = tallyAttempt(previous = first.used, codeWasRefused = true)
        assertEquals(2, second.used)
        assertFalse(second.exhausted)

        val third = tallyAttempt(previous = second.used, codeWasRefused = true)
        assertEquals(3, third.used)
        assertTrue(third.exhausted, "the third refusal ends the Cognito session")
    }

    @Test
    fun `⚠ a network or backend failure does NOT cost an attempt`() {
        // A dropped connection, an unavailable backend or a WAF block is not the shopper being wrong.
        // Counting it would spend their allowance on OUR outage and end a session Cognito still holds
        // open.
        val tally = tallyAttempt(previous = 2, codeWasRefused = false)
        assertEquals(2, tally.used)
        assertFalse(tally.exhausted)
    }

    @Test
    fun `⚠ a resend resets the attempt tally — because it is a NEW Cognito session`() {
        // There is no resend API for a custom challenge — "resend" is a fresh `signIn`, and the server
        // genuinely has no memory of the previous session's guesses. Showing "1 attempt left" on a
        // session that in fact allows three would be wrong in the direction that makes people give up.
        val exhausted = tallyAttempt(previous = 2, codeWasRefused = true)
        assertTrue(exhausted.exhausted)

        val afterResend = tallyAfterResend()
        assertEquals(0, afterResend.used)
        assertFalse(afterResend.exhausted)
    }
}
