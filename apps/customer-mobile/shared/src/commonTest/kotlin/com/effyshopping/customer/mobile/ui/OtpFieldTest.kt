package com.effyshopping.customer.mobile.ui

import com.effyshopping.mobile.kit.ui.OTP_LENGTH
import com.effyshopping.mobile.kit.ui.isCompleteOtp
import com.effyshopping.mobile.kit.ui.normalizeOtp
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * 036 — the one-time-code field's rules, asserted on THIS surface.
 *
 * ⚠ WHY THIS FILE EXISTS AT ALL. `packages/mobile-kit` is a shared source set with no test target of
 * its own, so its unit tests live in "the first consumer's `commonTest`" — which has meant
 * `apps/shop-mobile` and ONLY `apps/shop-mobile`. `customer-mobile` had **no OTP coverage whatsoever**
 * (`grep normalizeOtp|isCompleteOtp|One-time code` over its `commonTest` returned nothing), despite
 * being the surface where a shopper actually signs in most often.
 *
 * That is not a duplicate: 036 adds a `cells` variant, and the invariant that matters most — a longer
 * paste is KEPT rather than reshaped — is now enforced in two places (`normalizeOtp`, and `OtpCells`'
 * over-length fallback). Both surfaces should hold it.
 */
class OtpFieldTest {

    @Test
    fun `the platform code length is six`() {
        // ⚠ Mirrors `OTP_LENGTH` in `apis/edge-api/auth/src/otp/policy.ts`. Copy is stated FROM this
        // constant everywhere (FR-045) — before 036, three mobile files hardcoded "6-digit code" as a
        // literal string, which is four places to change and no way to know if you missed one.
        assertEquals(6, OTP_LENGTH)
    }

    @Test
    fun `normalisation strips non-digits and NEVER truncates`() {
        assertEquals("123456", normalizeOtp(" 12-34 56 "))
        assertEquals("123456", normalizeOtp("code: 123456"))
        assertEquals("", normalizeOtp("abcdef"))

        // ⚠ THE RULE 035 EXISTS FOR. An 8-digit paste keeps all eight digits, so the shopper can SEE
        // that what they pasted is not a code from us. Truncating to six would submit a plausible
        // wrong value with nothing on screen to explain the refusal.
        assertEquals("12345678", normalizeOtp("12345678"))
        assertFalse(isCompleteOtp(normalizeOtp("12345678")))
    }

    @Test
    fun `leading zeros survive`() {
        // Roughly one code in ten begins with a zero. Anything that coerced to a number would lock
        // those shoppers out entirely.
        assertEquals("012345", normalizeOtp("012345"))
        assertEquals("000000", normalizeOtp("000000"))
        assertTrue(isCompleteOtp("000000"))
    }

    @Test
    fun `the submit gate is EXACTLY six digits`() {
        assertTrue(isCompleteOtp("123456"))
        assertFalse(isCompleteOtp("12345"))
        assertFalse(isCompleteOtp("1234567"))
        assertFalse(isCompleteOtp(""))
        assertFalse(isCompleteOtp("12345a"))
    }
}
