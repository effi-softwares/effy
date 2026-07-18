package com.effyshopping.shop.mobile.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.v2.runComposeUiTest
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import com.effyshopping.mobile.kit.shell.ResponsiveDestination
import com.effyshopping.mobile.kit.shell.ResponsiveNavigation
import com.effyshopping.shop.mobile.core.nav.ShopTab
import com.effyshopping.shop.mobile.core.theme.EffyTheme
import com.effyshopping.shop.mobile.core.theme.AppearanceMode
import com.effyshopping.shop.mobile.design.EffyDarkColorScheme
import com.effyshopping.shop.mobile.design.EffyLightColorScheme
import com.effyshopping.shop.mobile.features.shop.domain.AssignedShop
import com.effyshopping.shop.mobile.features.shop.domain.Operator
import com.effyshopping.shop.mobile.features.shop.domain.OperatorStatus
import com.effyshopping.shop.mobile.features.shop.domain.ShopLifecycle
import com.effyshopping.shop.mobile.features.shop.domain.ShopRole
import com.effyshopping.shop.mobile.features.shop.domain.ShopRepository
import com.effyshopping.shop.mobile.features.shop.domain.ManagerAccess
import com.effyshopping.shop.mobile.features.shop.domain.CheckManagerAccess
import com.effyshopping.shop.mobile.features.home.domain.AttentionItem
import com.effyshopping.shop.mobile.features.home.domain.AttentionSeverity
import com.effyshopping.shop.mobile.features.home.domain.EfficiencyMetric
import com.effyshopping.shop.mobile.features.home.domain.FulfillmentSpeed
import com.effyshopping.shop.mobile.features.home.domain.HomeDashboard
import com.effyshopping.shop.mobile.features.home.domain.OrderStatus
import com.effyshopping.shop.mobile.features.home.domain.PersonnelSummary
import com.effyshopping.shop.mobile.features.home.domain.RecentOrder
import com.effyshopping.shop.mobile.features.home.domain.StorageState
import com.effyshopping.shop.mobile.features.home.domain.StorageZone
import com.effyshopping.shop.mobile.features.home.presentation.HomeDashboardUiState
import com.effyshopping.shop.mobile.features.catalog.presentation.CatalogFilter
import com.effyshopping.shop.mobile.features.catalog.presentation.CatalogScreen
import com.effyshopping.shop.mobile.features.catalog.presentation.CatalogUiState
import com.effyshopping.shop.mobile.features.shop.presentation.AccountScreen
import com.effyshopping.shop.mobile.features.shop.presentation.FoundationPlaceholderScreen
import com.effyshopping.shop.mobile.features.shop.presentation.HomeScreen
import com.effyshopping.shop.mobile.features.catalog.sampleDetail
import com.effyshopping.shop.mobile.features.catalog.sampleListItem
import com.effyshopping.shop.mobile.features.shop.presentation.ManagerAccessScreen
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

@OptIn(ExperimentalTestApi::class)
class ShopFoundationUiTest {
    @Test
    fun appearance_modes_resolve_live_and_generated_palette_is_not_material_default() {
        assertEquals(false, AppearanceMode.Light.resolveDark(true))
        assertEquals(true, AppearanceMode.Dark.resolveDark(false))
        assertEquals(true, AppearanceMode.System.resolveDark(true))
        assertNotEquals(androidx.compose.material3.lightColorScheme().primary, EffyLightColorScheme.primary)
        assertNotEquals(androidx.compose.material3.darkColorScheme().primary, EffyDarkColorScheme.primary)
    }

    @Test
    fun responsive_chrome_exposes_four_merged_icon_label_targets() {
        if (!canRunComposeUiTestOnHost()) return
        runComposeUiTest {
            setContent {
                EffyTheme {
                    Box(Modifier.size(599.dp, 800.dp)) {
                        ResponsiveNavigation(
                            destinations = destinations(),
                            selectedTab = ShopTab.CATALOG,
                            onSelectTab = {},
                        ) { Text("Catalog foundation") }
                    }
                }
            }
            awaitIdle()
            onNodeWithContentDescription("Home").assertExists()
            onNodeWithContentDescription("Catalog").assertIsSelected()
            onNodeWithContentDescription("Orders").assertExists()
            onNodeWithContentDescription("Account").assertExists()
            val home = onNodeWithContentDescription("Home").fetchSemanticsNode().boundsInRoot
            val catalog = onNodeWithContentDescription("Catalog").fetchSemanticsNode().boundsInRoot
            assertTrue(kotlin.math.abs(home.top - catalog.top) < 1f)
        }
    }

    @Test
    fun wide_layout_uses_a_vertical_rail_without_losing_selection() {
        if (!canRunComposeUiTestOnHost()) return
        runComposeUiTest {
            setContent {
                EffyTheme {
                    Box(Modifier.size(600.dp, 800.dp)) {
                        ResponsiveNavigation(
                            destinations = destinations(),
                            selectedTab = ShopTab.CATALOG,
                            onSelectTab = {},
                        ) { Text("Catalog foundation") }
                    }
                }
            }
            awaitIdle()
            onNodeWithContentDescription("Catalog").assertIsSelected()
            val home = onNodeWithContentDescription("Home").fetchSemanticsNode().boundsInRoot
            val catalog = onNodeWithContentDescription("Catalog").fetchSemanticsNode().boundsInRoot
            assertTrue(kotlin.math.abs(home.center.x - catalog.center.x) < 1f, "home=$home catalog=$catalog")
            assertTrue(kotlin.math.abs(home.top - catalog.top) > 1f, "home=$home catalog=$catalog")
        }
    }

    @Test
    fun genuine_home_account_and_placeholders_contain_no_legacy_controls() {
        if (!canRunComposeUiTestOnHost()) return
        runComposeUiTest {
            setContent {
                EffyTheme {
                    HomeScreen(
                        operator = operator(),
                        state = HomeDashboardUiState.Ready(dashboard()),
                        onRefresh = {},
                        onOpenCatalog = {},
                        onOpenManager = {},
                    )
                }
            }
            awaitIdle()
            onNodeWithText("Riverside Dark Store · Zone A-4").assertExists()
            onNodeWithText("Daily Pick Efficiency").assertExists()
            onNodeWithText("3 items out of stock").assertExists()
            onNodeWithText("#8842").assertExists()
            onNodeWithText("New product").assertDoesNotExist()

        }
    }

    @Test
    fun account_exposes_identity_appearance_and_sign_out() {
        if (!canRunComposeUiTestOnHost()) return
        runComposeUiTest {
            setContent {
                EffyTheme(mode = AppearanceMode.Dark) {
                    AccountScreen(
                        operator(),
                        signingOut = false,
                        appearanceMode = AppearanceMode.Dark,
                        onSignOut = {},
                    )
                }
            }
            awaitIdle()
            onNodeWithText("Shop manager").assertExists()
            onNodeWithText("Dark").assertIsSelected()
            onNodeWithText("Sign out").assertExists()
        }
    }

    @Test
    fun placeholder_and_manager_gate_have_intentional_states() {
        if (!canRunComposeUiTestOnHost()) return
        runComposeUiTest {
            setContent {
                EffyTheme {
                    ManagerAccessScreen(
                        CheckManagerAccess(managerRepository(ManagerAccess.DENIED)),
                        onBack = {},
                    )
                }
            }
            waitUntil(timeoutMillis = 5_000) {
                onAllNodes(androidx.compose.ui.test.hasText("You don't have access to this area.")).fetchSemanticsNodes().isNotEmpty()
            }
            onNodeWithText("You don't have access to this area.").assertExists()
            onNodeWithText("New product").assertDoesNotExist()
        }
    }

    @Test
    fun catalog_screen_renders_real_product_list_and_detail_affordances() {
        if (!canRunComposeUiTestOnHost()) return
        runComposeUiTest {
            setContent {
                EffyTheme {
                    CatalogScreen(
                        state = CatalogUiState(
                            filter = CatalogFilter.ALL,
                            page = com.effyshopping.shop.mobile.features.catalog.domain.ProductPage(
                                items = listOf(sampleListItem()),
                                total = 1,
                                page = 1,
                                pageSize = 25,
                            ),
                            selectedId = "p1",
                            detail = sampleDetail(),
                            isLoadingList = false,
                        ),
                        onSelectFilter = {},
                        onSelectProduct = {},
                        onRetry = {},
                        onNewProduct = {},
                        onEditDetails = {},
                    )
                }
            }
            awaitIdle()
            onNodeWithText("Catalog").assertExists()
            onNodeWithText("+ New product").assertExists()
            assertTrue(onAllNodes(hasText("Chicken Biryani")).fetchSemanticsNodes().size >= 2)
            onNodeWithText("Edit details").assertExists()
            onNodeWithText("Overview").assertExists()
        }
    }

    @Test
    fun orders_placeholder_has_no_invented_actions() {
        if (!canRunComposeUiTestOnHost()) return
        runComposeUiTest {
            setContent {
                EffyTheme { FoundationPlaceholderScreen("Orders", "Order tools are being rebuilt.") }
            }
            awaitIdle()
            onNodeWithText("Order tools are being rebuilt.").assertExists()
            onNodeWithText("Edit").assertDoesNotExist()
            onNodeWithText("New product").assertDoesNotExist()
        }
    }

    @Test
    fun large_text_keeps_foundation_content_reachable() {
        if (!canRunComposeUiTestOnHost()) return
        runComposeUiTest {
            setContent {
                CompositionLocalProvider(LocalDensity provides Density(density = 1f, fontScale = 2f)) {
                    EffyTheme { FoundationPlaceholderScreen("Catalog", "Catalog tools are being rebuilt.") }
                }
            }
            awaitIdle()
            onNodeWithText("Catalog").assertExists()
            onNodeWithText("Catalog tools are being rebuilt.").assertExists()
        }
    }

    private fun destinations() = ShopTab.entries.map { tab ->
        ResponsiveDestination(tab, tab.label) { selected -> Text(if (selected) "Selected" else "Outlined") }
    }

    private fun operator() = Operator(
        subject = "subject",
        email = "jordan@effy.example",
        roles = listOf(ShopRole.MANAGER),
        status = OperatorStatus.ACTIVE,
        shop = AssignedShop("shop", "S1", "Effy Market", ShopLifecycle.ACTIVE),
    )

    private fun dashboard() = HomeDashboard(
        shopName = "Riverside Dark Store",
        zone = "Zone A-4",
        storeOnline = true,
        dailyPickEfficiency = EfficiencyMetric(94, 12.5, listOf(18, 24, 23, 29, 34, 31)),
        fulfillmentSpeed = FulfillmentSpeed("Excellent", 4),
        storage = listOf(
            StorageZone("Zone A (Chilled)", 85, StorageState.Normal),
            StorageZone("Zone B (Ambient)", 42, StorageState.Warning),
        ),
        attention = listOf(
            AttentionItem("3 items out of stock", "Organic Bananas, Kale, Skim Milk...", AttentionSeverity.Urgent),
        ),
        personnel = listOf(
            PersonnelSummary("AM", "Alex M.", "Picking · Active", true),
            PersonnelSummary("SR", "Sam R.", "Packing · On Break", false),
        ),
        recentOrders = listOf(
            RecentOrder("#8842", "14:22", "12 items · Pickup A", OrderStatus.Ready),
        ),
    )

    private fun managerRepository(access: ManagerAccess) = object : ShopRepository {
        override suspend fun me() = operator()
        override suspend fun managerAccess() = access
    }
}
