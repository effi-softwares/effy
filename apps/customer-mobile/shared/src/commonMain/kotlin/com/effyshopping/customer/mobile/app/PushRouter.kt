package com.effyshopping.customer.mobile.app

import com.effyshopping.customer.mobile.core.nav.CustomerNavKey
import com.effyshopping.customer.mobile.core.push.CustomerDestination

/** One step of opening a destination, applied to the shell's nav state in order. */
sealed interface PushNavStep {
    data class SelectTab(val tab: CustomerNavKey) : PushNavStep
    data object ResetToRoot : PushNavStep
    data class Push(val key: CustomerNavKey) : PushNavStep
}

/**
 * How a tapped notification opens its destination (109): always on its tab's root, then the screen on top, so Back
 * returns to the tab's start. Pure, so every kind is tested without Compose. `null` (a destination this build does
 * not know) opens Home. The screens are the ones a banner opens ([com.effyshopping.customer.mobile.features.catalog
 * .domain.BannerTarget]), so there is one way to reach each.
 */
fun pushNavSteps(destination: CustomerDestination?): List<PushNavStep> = when (destination) {
    null, CustomerDestination.Home -> listOf(PushNavStep.SelectTab(CustomerNavKey.Home), PushNavStep.ResetToRoot)
    CustomerDestination.Orders -> listOf(PushNavStep.SelectTab(CustomerNavKey.Orders), PushNavStep.ResetToRoot)
    is CustomerDestination.Order -> listOf(
        PushNavStep.SelectTab(CustomerNavKey.Orders),
        PushNavStep.ResetToRoot,
        PushNavStep.Push(CustomerNavKey.OrderDetail(destination.orderId)),
    )
    CustomerDestination.Points -> listOf(
        PushNavStep.SelectTab(CustomerNavKey.Account),
        PushNavStep.ResetToRoot,
        PushNavStep.Push(CustomerNavKey.Points),
    )
    is CustomerDestination.Product -> listOf(
        PushNavStep.SelectTab(CustomerNavKey.Home),
        PushNavStep.ResetToRoot,
        PushNavStep.Push(CustomerNavKey.Product(destination.productId)),
    )
    is CustomerDestination.Aisle -> listOf(
        PushNavStep.SelectTab(CustomerNavKey.Home),
        PushNavStep.ResetToRoot,
        PushNavStep.Push(CustomerNavKey.Results(title = destination.title ?: AISLE_TITLE, categoryKey = destination.aisleKey)),
    )
    // 116 FR-002: the words a link (or a push) carried are searched, as the website would; no words opens the tab.
    is CustomerDestination.Search -> {
        val words = destination.query?.trim().orEmpty()
        if (words.isEmpty()) {
            listOf(PushNavStep.SelectTab(CustomerNavKey.Search), PushNavStep.ResetToRoot)
        } else {
            listOf(
                PushNavStep.SelectTab(CustomerNavKey.Search),
                PushNavStep.ResetToRoot,
                PushNavStep.Push(CustomerNavKey.Results(title = SEARCH_TITLE, query = words)),
            )
        }
    }
    CustomerDestination.Sale -> listOf(
        PushNavStep.SelectTab(CustomerNavKey.Home),
        PushNavStep.ResetToRoot,
        PushNavStep.Push(CustomerNavKey.Results(title = SALE_TITLE, saleOnly = true)),
    )
}

internal const val AISLE_TITLE = "Shop"
internal const val SALE_TITLE = "On sale"
internal const val SEARCH_TITLE = "Search"
