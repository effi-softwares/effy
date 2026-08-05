package com.effyshopping.mobile.kit.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/**
 * The platform's one-time-code editor (035, promoted from shop-mobile).
 *
 * Nothing here is audience-specific: customer-mobile and shop-mobile both sign in with an emailed
 * code, and before this slice each had its OWN code field — shop-mobile a hand-built one, and
 * customer-mobile a generic `EffyField` with no autofill at all. That divergence is not incidental
 * trivia: it is the direct cause of the defect 035 exists to fix (constitution Principle II).
 *
 * ⚠ ONE LOGICAL FIELD, NOT SIX BOXES. The platform adapters keep a single accessibility and focus
 * node, and `AuthFoundationUiTest` asserts exactly one node carries the "One-time code"
 * description. Segmented per-digit widgets are several inputs wearing a costume, and they are how
 * screen-reader users lose their place in an OTP form (FR-025).
 */
@Composable
expect fun OtpInput(
    value: String,
    onValueChange: (String) -> Unit,
    onSubmit: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    isError: Boolean = false,
    /**
     * ⚠ DEFAULTS TO [OtpVariant.Plain], and the default is load-bearing. `apps/shop-mobile` is out of
     * scope for 036 (FR-044a) and must keep today's rendering byte-for-byte — its
     * `AuthFoundationUiTest` and `OtpInputTest` re-run unmodified as the proof.
     */
    variant: OtpVariant = OtpVariant.Plain,
)

/** The platform's one and only code length (035 FR-001). */
const val OTP_LENGTH: Int = 6

/**
 * Normalise typed or pasted input.
 *
 * ⚠ **DIGITS ONLY — THIS DELIBERATELY DOES NOT TRUNCATE, AND THAT IS THE POINT OF THE SLICE.**
 *
 * The previous version ended `.take(OTP_LENGTH)`. Combined with an 8-digit sign-in code, that
 * silently cut a shopper's real code down to its first six digits and submitted the wrong value —
 * shop-mobile sign-in could not succeed, and nothing on screen said why. FR-004 now states the rule
 * outright: "normalisation MUST be limited to discarding non-digit characters and surrounding
 * whitespace", and FR-005 requires a wrong-length value to be "refused as invalid rather than
 * reshaped into six digits".
 *
 * So a paste of eight digits leaves eight digits in the field, the submit control stays inactive,
 * and the person can SEE that what they pasted is not a code from us. That is strictly more
 * informative than showing them six digits and a server-side "that code isn't right" — and it is
 * the difference between a mistake a shopper can correct and one they cannot even perceive.
 *
 * Length is enforced once, at the submit gate, using [isCompleteOtp].
 */
fun normalizeOtp(value: String): String = value.filter(Char::isDigit)

/** Exactly [OTP_LENGTH] digits — the only shape that may be submitted (FR-005). */
fun isCompleteOtp(value: String): Boolean =
    value.length == OTP_LENGTH && value.all(Char::isDigit)
