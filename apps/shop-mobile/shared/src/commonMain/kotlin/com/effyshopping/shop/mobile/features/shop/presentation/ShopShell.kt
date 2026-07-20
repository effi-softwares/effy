package com.effyshopping.shop.mobile.features.shop.presentation

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Alignment
import androidx.compose.ui.backhandler.BackHandler
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.effyshopping.mobile.kit.nav.rememberTabBackStacks
import com.effyshopping.mobile.kit.shell.ResponsiveDestination
import com.effyshopping.mobile.kit.shell.ResponsiveNavigation
import com.effyshopping.mobile.kit.ui.EffyMotion
import com.effyshopping.mobile.kit.ui.MotionLevel
import com.effyshopping.mobile.kit.ui.MotionRole
import com.effyshopping.shop.mobile.app.AppContainer
import com.effyshopping.shop.mobile.core.nav.AccountRoot
import com.effyshopping.shop.mobile.core.nav.CatalogRoot
import com.effyshopping.shop.mobile.core.nav.HomeRoot
import com.effyshopping.shop.mobile.core.nav.ManagerArea
import com.effyshopping.shop.mobile.core.nav.OrderDetail
import com.effyshopping.shop.mobile.core.nav.OrdersRoot
import com.effyshopping.shop.mobile.core.nav.ShopTab
import com.effyshopping.shop.mobile.core.nav.shopNavJson
import com.effyshopping.shop.mobile.core.nav.shopStartRoute
import com.effyshopping.shop.mobile.core.session.SessionState
import com.effyshopping.shop.mobile.features.catalog.presentation.CatalogRoute
import com.effyshopping.shop.mobile.features.orders.presentation.OrdersRoute
import com.effyshopping.shop.mobile.resources.Res
import com.effyshopping.shop.mobile.resources.ic_account_outlined
import com.effyshopping.shop.mobile.resources.ic_account_selected
import com.effyshopping.shop.mobile.resources.ic_catalog_outlined
import com.effyshopping.shop.mobile.resources.ic_catalog_selected
import com.effyshopping.shop.mobile.resources.ic_home_outlined
import com.effyshopping.shop.mobile.resources.ic_home_selected
import com.effyshopping.shop.mobile.resources.ic_orders_outlined
import com.effyshopping.shop.mobile.resources.ic_orders_selected
import kotlinx.coroutines.launch
import org.jetbrains.compose.resources.DrawableResource
import org.jetbrains.compose.resources.painterResource

@OptIn(ExperimentalComposeUiApi::class)
@Composable
fun ShopShell(
    container: AppContainer,
    session: SessionState.SignedIn,
    reducedMotion: Boolean = false,
) {
    val tabs = rememberTabBackStacks(
        tabs = ShopTab.entries.toList(),
        initialTab = ShopTab.HOME,
        tabId = { it.name },
        tabById = ShopTab::valueOf,
        startRoute = ::shopStartRoute,
        json = shopNavJson,
    )
    val scope = rememberCoroutineScope()
    val appearanceMode by container.appearance.mode.collectAsState()
    var signingOut by remember { mutableStateOf(false) }

    BackHandler(enabled = tabs.canGoBack || tabs.currentTab != ShopTab.HOME) {
        if (tabs.canGoBack) tabs.pop() else tabs.selectTab(ShopTab.HOME)
    }

    val destinations = ShopTab.entries.map { tab ->
        ResponsiveDestination(
            tab = tab,
            label = tab.label,
            icon = { selected -> ShopDestinationIcon(tab, selected) },
        )
    }
    val motion = EffyMotion.spec(
        MotionRole.PeerDestination,
        if (reducedMotion) MotionLevel.Reduced else MotionLevel.Full,
    )

    ResponsiveNavigation(
        destinations = destinations,
        selectedTab = tabs.currentTab,
        onSelectTab = tabs::selectTab,
        railHeader = { EffyRailBrand() },
        railFooter = { EffyRailAvatar(session.operator.railInitials()) },
    ) {
        AnimatedContent(
            targetState = tabs.currentRoute,
            transitionSpec = {
                fadeIn(tween(motion.durationMillis)) togetherWith fadeOut(tween(motion.durationMillis))
            },
            contentKey = { it::class },
        ) { route ->
            when (route) {
                HomeRoot -> HomeRoute(
                    operator = session.operator,
                    getHomeDashboard = container.getHomeDashboard,
                    onOpenCatalog = { tabs.selectTab(ShopTab.CATALOG) },
                    onOpenManager = { tabs.push(ManagerArea) },
                )
                ManagerArea -> ManagerAccessScreen(container.checkManagerAccess, onBack = { tabs.pop() })
                CatalogRoot -> CatalogRoute(
                    listProducts = container.listProducts,
                    getProduct = container.getProduct,
                )
                OrdersRoot -> OrdersRoute(
                    listFulfillments = container.listFulfillments,
                    getFulfillment = container.getFulfillment,
                    advanceFulfillment = container.advanceFulfillment,
                    recordItemProgress = container.recordItemProgress,
                    // Compact widths open a portion as its own destination; wide (tablet) widths show the
                    // queue and the pick list side by side and never reach this callback.
                    onOpenOrder = { tabs.push(OrderDetail(it)) },
                )
                is OrderDetail -> OrdersRoute(
                    listFulfillments = container.listFulfillments,
                    getFulfillment = container.getFulfillment,
                    advanceFulfillment = container.advanceFulfillment,
                    recordItemProgress = container.recordItemProgress,
                    initialOrderId = route.id,
                    onOpenOrder = { tabs.push(OrderDetail(it)) },
                    onCloseOrder = { tabs.pop() },
                )
                AccountRoot -> AccountScreen(
                    operator = session.operator,
                    signingOut = signingOut,
                    appearanceMode = appearanceMode,
                    onAppearanceModeChange = container.appearance::setMode,
                    onSignOut = {
                        if (!signingOut) {
                            signingOut = true
                            tabs.resetForSignOut(ShopTab.HOME)
                            scope.launch { container.session.signOutLocally() }
                        }
                    },
                )
                else -> HomeRoute(
                    operator = session.operator,
                    getHomeDashboard = container.getHomeDashboard,
                    onOpenCatalog = { tabs.selectTab(ShopTab.CATALOG) },
                    onOpenManager = { tabs.push(ManagerArea) },
                )
            }
        }
    }
}

@Composable
private fun ShopDestinationIcon(tab: ShopTab, selected: Boolean) {
    val resource: DrawableResource = when (tab) {
        ShopTab.HOME -> if (selected) Res.drawable.ic_home_selected else Res.drawable.ic_home_outlined
        ShopTab.CATALOG -> if (selected) Res.drawable.ic_catalog_selected else Res.drawable.ic_catalog_outlined
        ShopTab.ORDERS -> if (selected) Res.drawable.ic_orders_selected else Res.drawable.ic_orders_outlined
        ShopTab.ACCOUNT -> if (selected) Res.drawable.ic_account_selected else Res.drawable.ic_account_outlined
    }
    Icon(painterResource(resource), contentDescription = null)
}

@Composable
private fun EffyRailBrand() {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(
            painterResource(Res.drawable.ic_catalog_selected),
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(28.dp),
        )
        Text(
            "EFFY",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun EffyRailAvatar(initials: String) {
    Box(
        modifier = Modifier
            .size(48.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.primary),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            initials,
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onPrimary,
        )
    }
}

private fun com.effyshopping.shop.mobile.features.shop.domain.Operator.railInitials(): String {
    val source = email?.substringBefore("@")?.trim().orEmpty()
    val parts = source.split('.', '_', '-', ' ').filter { it.isNotBlank() }
    return when {
        parts.size >= 2 -> "${parts[0].first()}${parts[1].first()}"
        source.length >= 2 -> source.take(2)
        else -> "EO"
    }.uppercase()
}
