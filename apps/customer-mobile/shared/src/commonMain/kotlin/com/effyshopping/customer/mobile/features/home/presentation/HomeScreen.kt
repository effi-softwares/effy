package com.effyshopping.customer.mobile.features.home.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.effyshopping.mobile.kit.ui.AdaptiveContent

/**
 * The guest Home tab (013 US1 → 015 shell). An HONEST empty state — the store is being stocked, no mock
 * products. It is public: reachable with no session. The account entry now lives in its own bottom-nav
 * tab, so this is pure content (no top bar, no card — DOCTRINE-2).
 */
@Composable
fun HomeTabContent() {
    AdaptiveContent(
        modifier = Modifier.padding(32.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            "We're stocking the shelves",
            style = MaterialTheme.typography.headlineSmall,
            textAlign = TextAlign.Center,
        )
        Text(
            "Effy is almost ready. Come back soon — there'll be plenty to shop for.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}
