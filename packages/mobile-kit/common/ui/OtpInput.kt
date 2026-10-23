package com.effyshopping.mobile.kit.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/**
 * The one-time-code editor for both apps. One logical field, not six boxes: a single accessibility and
 * focus node, asserted by the apps' UI tests.
 */
@Composable
expect fun OtpInput(
    value: String,
    onValueChange: (String) -> Unit,
    onSubmit: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    isError: Boolean = false,
    /** [OtpVariant.Plain] by default; the customer app uses [OtpVariant.Cells]. */
    variant: OtpVariant = OtpVariant.Plain,
)

/** The one code length. */
const val OTP_LENGTH: Int = 6

/**
 * Normalises typed or pasted input to digits only, never truncating: an eight-digit paste stays eight
 * digits, so the person sees it is not our code and the submit gate ([isCompleteOtp]) stays closed.
 */
fun normalizeOtp(value: String): String = value.filter(Char::isDigit)

/** Exactly [OTP_LENGTH] digits: the only shape that may be submitted. */
fun isCompleteOtp(value: String): Boolean =
    value.length == OTP_LENGTH && value.all(Char::isDigit)
