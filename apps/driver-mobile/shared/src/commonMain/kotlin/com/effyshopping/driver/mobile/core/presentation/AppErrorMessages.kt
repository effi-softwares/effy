package com.effyshopping.driver.mobile.core.presentation

import com.effyshopping.driver.mobile.core.error.AppError

/**
 * The single mapping from a closed [AppError] to user-facing copy (049). Kept out of the ViewModels so
 * every screen speaks with one voice, and no raw SDK/HTTP text ever reaches a driver.
 */
fun AppError.userMessage(): String = when (this) {
    is AppError.Validation -> message
    AppError.Unauthenticated -> "Your session ended. Please sign in again."
    AppError.Forbidden -> "This account can't do that."
    AppError.NotFound -> "That's no longer available."
    AppError.Conflict -> "Someone else just changed this. Pull to refresh."
    is AppError.RateLimited -> "Too many attempts. Please wait a moment and try again."
    AppError.Network -> "You're offline. We'll retry when you're back."
    AppError.Unavailable -> "Something's temporarily unavailable. Please try again."
    AppError.Unexpected -> "Something went wrong. Please try again."
}
