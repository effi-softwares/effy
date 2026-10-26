package com.effyshopping.customer.mobile.core.presentation

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.design.EffyStorefrontShape

/** "18+" on an age-restricted product (101): a neutral outlined label — tile, product page, cart, checkout, orders. */
@Composable
fun AgeBadge(modifier: Modifier = Modifier) {
    Text(
        AgeWords.LABEL,
        modifier = modifier
            .semantics { contentDescription = "18 or over only" }
            .border(1.dp, MaterialTheme.colorScheme.outline, EffyStorefrontShape.small)
            .padding(horizontal = 6.dp, vertical = 2.dp),
        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
        color = MaterialTheme.colorScheme.onSurface,
    )
}
