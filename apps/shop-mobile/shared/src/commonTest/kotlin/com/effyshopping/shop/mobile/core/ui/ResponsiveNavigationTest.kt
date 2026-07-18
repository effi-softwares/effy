package com.effyshopping.shop.mobile.core.ui

import androidx.compose.ui.unit.dp
import com.effyshopping.mobile.kit.ui.NavigationPresentation
import com.effyshopping.mobile.kit.ui.WindowWidth
import com.effyshopping.mobile.kit.ui.navigationPresentationFor
import com.effyshopping.mobile.kit.ui.widthClassFor
import com.effyshopping.shop.mobile.core.nav.ShopTab
import kotlin.test.Test
import kotlin.test.assertEquals

class ResponsiveNavigationTest {
    @Test
    fun navigation_switches_at_the_usable_600dp_boundary() {
        assertEquals(NavigationPresentation.BottomBar, navigationPresentationFor(0.dp))
        assertEquals(NavigationPresentation.BottomBar, navigationPresentationFor(599.dp))
        assertEquals(NavigationPresentation.SideRail, navigationPresentationFor(600.dp))
        assertEquals(NavigationPresentation.SideRail, navigationPresentationFor(1_200.dp))
    }

    @Test
    fun content_width_classes_remain_backward_compatible() {
        assertEquals(WindowWidth.COMPACT, widthClassFor(599.dp))
        assertEquals(WindowWidth.MEDIUM, widthClassFor(600.dp))
        assertEquals(WindowWidth.EXPANDED, widthClassFor(840.dp))
    }

    @Test
    fun production_destination_order_is_fixed() {
        assertEquals(
            listOf("Home", "Catalog", "Orders", "Account"),
            ShopTab.entries.map { it.label },
        )
    }
}
