package com.effyshopping.shop.mobile.features.home.domain

data class HomeDashboard(
    val shopName: String,
    val zone: String,
    val storeOnline: Boolean,
    val dailyPickEfficiency: EfficiencyMetric,
    val fulfillmentSpeed: FulfillmentSpeed,
    val storage: List<StorageZone>,
    val attention: List<AttentionItem>,
    val personnel: List<PersonnelSummary>,
    val recentOrders: List<RecentOrder>,
)

data class EfficiencyMetric(
    val percent: Int,
    val deltaPercent: Double,
    val hourlyFulfillment: List<Int>,
)

data class FulfillmentSpeed(
    val label: String,
    val averageMinutes: Int,
)

data class StorageZone(
    val name: String,
    val percent: Int,
    val state: StorageState,
)

enum class StorageState { Normal, Warning }

data class AttentionItem(
    val title: String,
    val detail: String,
    val severity: AttentionSeverity,
)

enum class AttentionSeverity { Urgent, Normal }

data class PersonnelSummary(
    val initials: String,
    val name: String,
    val activity: String,
    val available: Boolean,
)

data class RecentOrder(
    val orderNumber: String,
    val time: String,
    val detail: String,
    val status: OrderStatus,
)

enum class OrderStatus { Ready, InTransit, Active, Queued }
