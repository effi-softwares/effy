package com.effyshopping.shop.mobile.features.home.domain

import com.effyshopping.shop.mobile.features.home.data.DummyHomeDashboardRepository
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class HomeDashboardUseCasesTest {
    @Test
    fun use_case_reads_dashboard_through_repository_boundary() = runTest {
        val useCase = GetHomeDashboard(
            object : HomeDashboardRepository {
                override suspend fun dashboard() = sampleDashboard(shopName = "Boundary Shop")
            },
        )

        assertEquals("Boundary Shop", useCase().shopName)
    }

    @Test
    fun dummy_data_adapter_contains_operational_home_sections() = runTest {
        val dashboard = DummyHomeDashboardRepository().dashboard()

        assertTrue(dashboard.dailyPickEfficiency.hourlyFulfillment.isNotEmpty())
        assertTrue(dashboard.attention.isNotEmpty())
        assertTrue(dashboard.personnel.isNotEmpty())
        assertTrue(dashboard.recentOrders.isNotEmpty())
        assertEquals("Riverside Dark Store", dashboard.shopName)
    }

    private fun sampleDashboard(shopName: String) = HomeDashboard(
        shopName = shopName,
        zone = "Zone T-1",
        storeOnline = true,
        dailyPickEfficiency = EfficiencyMetric(90, 3.4, listOf(1, 2, 3)),
        fulfillmentSpeed = FulfillmentSpeed("Good", 5),
        storage = listOf(StorageZone("Zone A", 80, StorageState.Normal)),
        attention = listOf(AttentionItem("Stock check", "One item needs review", AttentionSeverity.Normal)),
        personnel = listOf(PersonnelSummary("AB", "Alex B.", "Picking · Active", true)),
        recentOrders = listOf(RecentOrder("#1", "10:00", "1 item · Ready", OrderStatus.Ready)),
    )
}
