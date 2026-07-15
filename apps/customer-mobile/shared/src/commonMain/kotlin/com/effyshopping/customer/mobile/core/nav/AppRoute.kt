package com.effyshopping.customer.mobile.core.nav

/**
 * The app's routes (013). A small sealed set — this surface has a home, an auth flow, and an account
 * area; there is no catalog yet. [SignIn.returnTo] carries the deferred-demand destination (US3): a
 * guest sent to sign-in from Account lands back on Account (FR-020).
 */
sealed interface AppRoute {
    data object Home : AppRoute

    // Auth flow
    data class SignIn(val returnTo: AppRoute? = null) : AppRoute
    data object SignUp : AppRoute
    data class VerifyOtp(val email: String, val purpose: OtpPurpose, val returnTo: AppRoute? = null) : AppRoute
    data object Recovery : AppRoute

    // Account (auth-gated)
    data object Account : AppRoute
    data object EditName : AppRoute
    data object PasswordSet : AppRoute
    data object PasswordChange : AppRoute
}

/** What an emailed code is for — so the verify screen knows which flow to complete. */
enum class OtpPurpose { SIGN_IN, SIGN_UP, RECOVERY }
