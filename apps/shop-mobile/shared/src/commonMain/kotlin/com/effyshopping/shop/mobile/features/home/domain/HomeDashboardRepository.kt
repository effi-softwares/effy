package com.effyshopping.shop.mobile.features.home.domain

interface HomeDashboardRepository {
    suspend fun dashboard(): HomeDashboard
}
