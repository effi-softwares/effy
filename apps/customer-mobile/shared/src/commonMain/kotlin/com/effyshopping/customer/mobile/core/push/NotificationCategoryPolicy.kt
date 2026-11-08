package com.effyshopping.customer.mobile.core.push

/**
 * The Kotlin twin of the customer rows of `NOTIFICATION_CATEGORY_POLICY` in `@effy/shared-types` (111 R2): the words a
 * settings row shows, whether it can be turned off, and the Android channel its pushes are filed in.
 * `NotificationCategoryPolicyTest` holds it to `notification-categories.fixtures.json`.
 */
data class CategoryPolicy(
    val category: String,
    val label: String,
    val description: String,
    /** Why it is fixed; null when the customer may change it. */
    val reason: String?,
    val required: Boolean,
    val marketing: Boolean,
    val androidChannel: String,
)

/** One Android notification channel the app creates. `high` makes a sound and a heads-up banner. */
data class AndroidChannelSpec(val id: String, val name: String, val high: Boolean)

object NotificationCategoryPolicy {
    private const val FIXED = "These can't be turned off."

    val CUSTOMER: List<CategoryPolicy> = listOf(
        CategoryPolicy("orders", "Order updates", "When your order is confirmed, packed, on its way and delivered.", null, required = false, marketing = false, androidChannel = "orders"),
        CategoryPolicy("points", "Points", "When you get Effy points, and before they expire.", null, required = false, marketing = false, androidChannel = "points"),
        CategoryPolicy("offers", "Offers", "Deals and discounts from Effy.", null, required = false, marketing = true, androidChannel = "offers_news"),
        CategoryPolicy("news", "News", "New products and seasonal picks from Effy.", null, required = false, marketing = true, androidChannel = "offers_news"),
        CategoryPolicy("important", "Important", "Things you need to know, like a change to your delivery.", FIXED, required = true, marketing = false, androidChannel = "important"),
        CategoryPolicy("support", "Support", "Replies from our team about your account or orders.", FIXED, required = true, marketing = false, androidChannel = "important"),
    )

    val ANDROID_CHANNELS: List<AndroidChannelSpec> = listOf(
        AndroidChannelSpec("orders", "Order updates", high = true),
        AndroidChannelSpec("points", "Points", high = false),
        AndroidChannelSpec("offers_news", "Offers & news", high = false),
        AndroidChannelSpec("important", "Important", high = true),
    )

    /** Where a push with no channel of its own lands (the manifest's default). */
    const val DEFAULT_CHANNEL = "orders"

    fun of(category: String): CategoryPolicy? = CUSTOMER.firstOrNull { it.category == category }
}
