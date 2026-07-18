package com.effyshopping.shop.mobile.features.home.domain

class GetHomeDashboard(private val repository: HomeDashboardRepository) {
    suspend operator fun invoke(): HomeDashboard = repository.dashboard()
}
