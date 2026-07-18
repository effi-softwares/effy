package com.effyshopping.shop.mobile.features.shop.presentation

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import com.effyshopping.shop.mobile.core.ui.EffyPage
import com.effyshopping.shop.mobile.core.ui.EffyPageTitle

@Composable
fun FoundationPlaceholderScreen(title: String, description: String) {
    EffyPage {
        EffyPageTitle(title, description)
        Text(
            "This area is being designed as a focused, full-screen workflow.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
