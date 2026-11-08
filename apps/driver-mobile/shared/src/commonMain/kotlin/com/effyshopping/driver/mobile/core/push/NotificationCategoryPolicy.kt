package com.effyshopping.driver.mobile.core.push

/**
 * The Kotlin twin of the driver rows of `NOTIFICATION_CATEGORY_POLICY` in `@effy/shared-types` (111 R2). Every driver
 * category is fixed; Account shows each with its reason, and pushes are filed in its Android channel.
 * `NotificationCategoryPolicyTest` holds it to `notification-categories.fixtures.json`.
 */
data class CategoryPolicy(val category: String, val label: String, val description: String, val reason: String, val androidChannel: String)

/** One Android notification channel the app creates. `high` makes a sound and a heads-up banner. */
data class AndroidChannelSpec(val id: String, val name: String, val high: Boolean)

object NotificationCategoryPolicy {
    private const val FIXED = "These can't be turned off."

    val DRIVER: List<CategoryPolicy> = listOf(
        CategoryPolicy("work", "Work", "Runs assigned to you, and changes to them.", "Work messages can't be turned off - they're part of your job.", "work"),
        CategoryPolicy("announcements", "Announcements", "Messages from Effy to every driver.", FIXED, "announcements"),
        CategoryPolicy("important", "Important", "Things you need to know now, like a change to today's work.", FIXED, "important"),
    )

    val ANDROID_CHANNELS: List<AndroidChannelSpec> = listOf(
        AndroidChannelSpec("work", "Work", high = true),
        AndroidChannelSpec("announcements", "Announcements", high = false),
        AndroidChannelSpec("important", "Important", high = true),
    )

    /** Where a push with no channel of its own lands (the manifest's default). */
    const val DEFAULT_CHANNEL = "work"
}
