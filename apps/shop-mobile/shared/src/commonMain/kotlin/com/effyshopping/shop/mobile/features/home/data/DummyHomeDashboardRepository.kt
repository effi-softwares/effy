package com.effyshopping.shop.mobile.features.home.data

import com.effyshopping.shop.mobile.features.home.domain.AttentionItem
import com.effyshopping.shop.mobile.features.home.domain.AttentionSeverity
import com.effyshopping.shop.mobile.features.home.domain.EfficiencyMetric
import com.effyshopping.shop.mobile.features.home.domain.FulfillmentSpeed
import com.effyshopping.shop.mobile.features.home.domain.HomeDashboard
import com.effyshopping.shop.mobile.features.home.domain.HomeDashboardRepository
import com.effyshopping.shop.mobile.features.home.domain.OrderStatus
import com.effyshopping.shop.mobile.features.home.domain.PersonnelSummary
import com.effyshopping.shop.mobile.features.home.domain.RecentOrder
import com.effyshopping.shop.mobile.features.home.domain.StorageState
import com.effyshopping.shop.mobile.features.home.domain.StorageZone

/**
 * Temporary data adapter for the foundation dashboard. Replace this class with an HTTP-backed repository
 * when the shop home API lands; presentation and domain should not need to change.
 */
class DummyHomeDashboardRepository : HomeDashboardRepository {
    override suspend fun dashboard(): HomeDashboard = HomeDashboard(
        shopName = "Riverside Dark Store",
        zone = "Zone A-4",
        storeOnline = true,
        dailyPickEfficiency = EfficiencyMetric(
            percent = 94,
            deltaPercent = 12.5,
            hourlyFulfillment = listOf(18, 24, 23, 29, 34, 31),
        ),
        fulfillmentSpeed = FulfillmentSpeed(
            label = "Excellent",
            averageMinutes = 4,
        ),
        storage = listOf(
            StorageZone("Zone A (Chilled)", 85, StorageState.Normal),
            StorageZone("Zone B (Ambient)", 42, StorageState.Warning),
            StorageZone("Zone C (Frozen)", 12, StorageState.Normal),
        ),
        attention = listOf(
            AttentionItem(
                title = "3 items out of stock",
                detail = "Organic Bananas, Kale, Skim Milk...",
                severity = AttentionSeverity.Urgent,
            ),
        ),
        personnel = listOf(
            PersonnelSummary("AM", "Alex M.", "Picking · Active", available = true),
            PersonnelSummary("SR", "Sam R.", "Packing · On Break", available = false),
            PersonnelSummary("JL", "Jamie L.", "Shipping · Active", available = true),
            PersonnelSummary("KV", "Kim V.", "Receiving · Available", available = true),
        ),
        recentOrders = listOf(
            RecentOrder("#8842", "14:22", "12 items · Pickup A", OrderStatus.Ready),
            RecentOrder("#8841", "14:05", "5 items · Driver Assigned", OrderStatus.InTransit),
            RecentOrder("#8840", "13:58", "22 items · Picking Stage", OrderStatus.Active),
            RecentOrder("#8839", "13:45", "8 items · Order Verified", OrderStatus.Queued),
        ),
    )
}
