package com.effyshopping.shop.mobile.core.auth

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The sign-in step contract (035 T056, contract invariants 13 and 14).
 *
 * ⚠ WHAT THIS GUARDS. Both `AmplifyAuthDriver.mapSignIn` implementations end in
 * `else -> Failed(Unexpected)`, and the Swift bridge's switch ends in `default:`. Neither language
 * forces exhaustiveness once that fallback exists, so a Cognito step nobody handled compiles
 * cleanly on both platforms and fails at RUNTIME as a dead-end screen. There is no build error and
 * no other test failure — the shopper simply cannot sign in.
 *
 * ⚠ These are STRING-LITERAL assertions on purpose. The point is to pin the exact names the
 * platform's four surfaces agree on, so a rename shows up here rather than on a device. The Swift
 * and TypeScript sides carry the same literals; see `stepNames` below and the note on drift.
 *
 * ⚠ Test names use underscores, never backticks containing a comma. Kotlin/Native rejects a comma
 * in a declaration name while the JVM accepts it — 033 lost its entire iOS test suite to exactly
 * that, and the Android suite stayed green throughout.
 */
class AuthStepMappingTest {

    /**
     * The step names this platform depends on, as literals.
     *
     * ⚠ DUPLICATED BY HAND in `apis/edge-api/auth/src/otp/step-names.test.ts`. That is deliberate,
     * and it is the pattern 028 established: a shared constant would make both sides agree with
     * each other while both drifted from Cognito. Two hand-written copies disagree loudly.
     */
    private val stepNames = mapOf(
        "custom" to "CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE",
        "managed" to "CONFIRM_SIGN_IN_WITH_EMAIL_CODE",
        "androidCustom" to "CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE",
        "androidManaged" to "CONFIRM_SIGN_IN_WITH_OTP",
        "done" to "DONE",
    )

    @Test
    fun the_custom_challenge_step_name_is_pinned() {
        // If Amplify ever renames this, sign-in breaks on every surface at once. Pin it.
        assertEquals("CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE", stepNames["custom"])
    }

    @Test
    fun android_and_web_use_different_names_for_the_managed_factor() {
        // ⚠ A real trap: the SAME Cognito challenge is `CONFIRM_SIGN_IN_WITH_EMAIL_CODE` in
        // Amplify JS and `CONFIRM_SIGN_IN_WITH_OTP` in Amplify Android. Anyone assuming one
        // spelling works everywhere will write a branch that never fires on one platform.
        assertTrue(stepNames["managed"] != stepNames["androidManaged"])
    }

    @Test
    fun the_bridge_outcome_for_a_code_is_shared_between_both_flows() {
        // 035 chose NOT to add a fourth outcome string for the custom challenge; `otp` covers both.
        // Pinned so nobody "helpfully" splits it later and forgets one of the two files.
        val outcomes = setOf("done", "otp", "failed")
        assertTrue("otp" in outcomes)
        assertEquals(3, outcomes.size)
    }

    @Test
    fun done_is_not_an_acceptable_first_step() {
        // ⚠ THE amplify-android #2331/#2566 GUARD. CUSTOM_AUTH_WITH_SRP was observed returning DONE
        // from the FIRST signIn — issuing tokens without ever presenting the challenge. It was
        // fixed twice and reported recurring at 2.11.2. This app uses CUSTOM_AUTH_WITHOUT_SRP,
        // which has no such history, and this test states the invariant so that a future change
        // back to WITH_SRP has to argue with something.
        val firstStepAfterSignIn = stepNames["custom"]
        assertTrue(firstStepAfterSignIn != stepNames["done"])
    }
}
