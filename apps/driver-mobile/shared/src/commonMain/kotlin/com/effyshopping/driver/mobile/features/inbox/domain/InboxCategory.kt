package com.effyshopping.driver.mobile.features.inbox.domain

import com.effyshopping.driver.mobile.resources.Res
import com.effyshopping.driver.mobile.resources.lucide_bell
import com.effyshopping.driver.mobile.resources.lucide_circle_alert
import com.effyshopping.driver.mobile.resources.lucide_megaphone
import com.effyshopping.driver.mobile.resources.lucide_package
import com.effyshopping.driver.mobile.resources.lucide_truck
import org.jetbrains.compose.resources.DrawableResource

/**
 * The Kotlin twin of `INBOX_CATEGORIES` in `@effy/shared-types` (110 R13), for the icon beside each item. Drivers do
 * not filter by category. `InboxCategoryTest` holds it to `notification-inbox.fixtures.json`.
 */
data class InboxCategoryInfo(val key: String, val label: String, val icon: String)

object InboxCategories {
    val ALL: List<InboxCategoryInfo> = listOf(
        InboxCategoryInfo("orders", "Orders", "package"),
        InboxCategoryInfo("points", "Points", "coins"),
        InboxCategoryInfo("work", "Work", "truck"),
        InboxCategoryInfo("stock", "Stock", "boxes"),
        InboxCategoryInfo("products", "Products", "shopping-basket"),
        InboxCategoryInfo("offers", "Offers", "tag"),
        InboxCategoryInfo("news", "News", "newspaper"),
        InboxCategoryInfo("important", "Important", "circle-alert"),
        InboxCategoryInfo("support", "Support", "message-circle"),
        InboxCategoryInfo("announcements", "Announcements", "megaphone"),
    )

    fun of(key: String): InboxCategoryInfo? = ALL.firstOrNull { it.key == key }

    /** Only the driver's own categories have their icon here; anything else gets the bell. */
    fun icon(key: String): DrawableResource = when (of(key)?.icon) {
        "truck" -> Res.drawable.lucide_truck
        "megaphone" -> Res.drawable.lucide_megaphone
        "circle-alert" -> Res.drawable.lucide_circle_alert
        "package" -> Res.drawable.lucide_package
        else -> Res.drawable.lucide_bell
    }
}
