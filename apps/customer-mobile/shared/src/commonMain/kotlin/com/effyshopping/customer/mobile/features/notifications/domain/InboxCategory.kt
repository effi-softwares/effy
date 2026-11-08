package com.effyshopping.customer.mobile.features.notifications.domain

import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.lucide_bell
import com.effyshopping.customer.mobile.resources.lucide_boxes
import com.effyshopping.customer.mobile.resources.lucide_circle_alert
import com.effyshopping.customer.mobile.resources.lucide_coins
import com.effyshopping.customer.mobile.resources.lucide_megaphone
import com.effyshopping.customer.mobile.resources.lucide_message_circle
import com.effyshopping.customer.mobile.resources.lucide_newspaper
import com.effyshopping.customer.mobile.resources.lucide_package
import com.effyshopping.customer.mobile.resources.lucide_shopping_basket
import com.effyshopping.customer.mobile.resources.lucide_tag
import com.effyshopping.customer.mobile.resources.lucide_truck
import org.jetbrains.compose.resources.DrawableResource

/**
 * The Kotlin twin of `INBOX_CATEGORIES` in `@effy/shared-types` (110 R13): the words on a chip and the icon beside an
 * item. `InboxCategoryTest` holds it to `notification-inbox.fixtures.json`. An unknown category (a newer server) gets
 * the bell and no chip.
 */
data class InboxCategoryInfo(val key: String, val label: String, val icon: String, val filterable: Boolean)

object InboxCategories {
    val ALL: List<InboxCategoryInfo> = listOf(
        InboxCategoryInfo("orders", "Orders", "package", filterable = true),
        InboxCategoryInfo("points", "Points", "coins", filterable = true),
        InboxCategoryInfo("work", "Work", "truck", filterable = false),
        InboxCategoryInfo("stock", "Stock", "boxes", filterable = false),
        InboxCategoryInfo("products", "Products", "shopping-basket", filterable = false),
        InboxCategoryInfo("offers", "Offers", "tag", filterable = true),
        InboxCategoryInfo("news", "News", "newspaper", filterable = true),
        InboxCategoryInfo("important", "Important", "circle-alert", filterable = true),
        InboxCategoryInfo("support", "Support", "message-circle", filterable = true),
        InboxCategoryInfo("announcements", "Announcements", "megaphone", filterable = false),
    )

    fun of(key: String): InboxCategoryInfo? = ALL.firstOrNull { it.key == key }

    /** The chips for the categories the shopper has items in, in the list's order. */
    fun chipsFor(present: List<String>): List<InboxCategoryInfo> = ALL.filter { it.filterable && it.key in present }

    fun icon(key: String): DrawableResource = when (of(key)?.icon) {
        "package" -> Res.drawable.lucide_package
        "coins" -> Res.drawable.lucide_coins
        "truck" -> Res.drawable.lucide_truck
        "boxes" -> Res.drawable.lucide_boxes
        "shopping-basket" -> Res.drawable.lucide_shopping_basket
        "tag" -> Res.drawable.lucide_tag
        "newspaper" -> Res.drawable.lucide_newspaper
        "circle-alert" -> Res.drawable.lucide_circle_alert
        "message-circle" -> Res.drawable.lucide_message_circle
        "megaphone" -> Res.drawable.lucide_megaphone
        else -> Res.drawable.lucide_bell
    }
}
