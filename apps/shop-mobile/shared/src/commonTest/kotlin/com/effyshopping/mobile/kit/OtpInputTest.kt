package com.effyshopping.mobile.kit

import com.effyshopping.mobile.kit.ui.OTP_LENGTH
import com.effyshopping.mobile.kit.ui.isCompleteOtp
import com.effyshopping.mobile.kit.ui.normalizeOtp
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The one-time-code field's input rules (035).
 *
 * ⚠ WHY THIS FILE EXISTS. The previous `normalizeOtp` ended `.take(OTP_LENGTH)`, which silently cut
 * a real 8-digit sign-in code down to its first six and submitted the wrong value — shop-mobile
 * sign-in could not succeed, and nothing on screen said why. **No test covered that behaviour.**
 * The one test that touched normalisation fed `" 12-34 56 words"`, which contains exactly six
 * digits, so it passed identically before and after the bug. That is how the defect shipped.
 *
 * ⚠ Note the test names use underscores, not backticks-with-commas. Kotlin/Native forbids a comma
 * in a declaration name while the JVM accepts it, so a comma here compiles on Android and breaks
 * the iOS test compilation — 033 lost its entire iOS suite to exactly that.
 */
class OtpInputTest {

    @Test
    fun normalize_strips_whitespace_and_separators() {
        assertEquals("123456", normalizeOtp(" 12-34 56 "))
        assertEquals("123456", normalizeOtp("123 456"))
        assertEquals("123456", normalizeOtp("code: 123456"))
    }

    @Test
    fun normalize_does_not_truncate_a_longer_paste() {
        // ⚠ THE REGRESSION THIS SLICE EXISTS TO PREVENT.
        // The old behaviour returned "123456" here — six digits that look complete, enable the
        // submit control, and send a value the shopper never chose. Keeping all eight means the
        // gate stays closed and the person can SEE that what they pasted is not one of our codes
        // (FR-004, FR-005).
        assertEquals("12345678", normalizeOtp("12345678"))
        assertFalse(isCompleteOtp(normalizeOtp("12345678")))
    }

    @Test
    fun normalize_preserves_leading_zeros() {
        // Roughly one code in ten begins with a zero. Any numeric handling anywhere in the chain
        // would drop it and lock those shoppers out.
        assertEquals("012345", normalizeOtp("012345"))
        assertEquals("000000", normalizeOtp("000000"))
        assertTrue(isCompleteOtp(normalizeOtp("000000")))
    }

    @Test
    fun normalize_rejects_non_digits_entirely() {
        assertEquals("", normalizeOtp("abcdef"))
        assertEquals("", normalizeOtp(""))
        // Arabic-Indic digits are not ASCII digits; Char::isDigit accepts them, so pin the
        // behaviour rather than discovering it in production.
        assertEquals("123456", normalizeOtp("a1b2c3d4e5f6"))
    }

    @Test
    fun completeness_requires_exactly_six_digits() {
        assertTrue(isCompleteOtp("123456"))
        assertFalse(isCompleteOtp("12345"))
        assertFalse(isCompleteOtp("1234567"))
        assertFalse(isCompleteOtp(""))
        assertFalse(isCompleteOtp("12345a"))
    }

    @Test
    fun the_platform_code_length_is_six() {
        // The single source of truth every surface now shares. If this ever changes, it changes
        // here and everywhere at once — which is the whole point of promoting it into mobile-kit.
        assertEquals(6, OTP_LENGTH)
    }
}
