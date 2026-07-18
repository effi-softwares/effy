package com.effyshopping.shop.mobile.features.shop.presentation

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.ButtonDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.effyshopping.shop.mobile.core.ui.EffyIdentityRow
import com.effyshopping.shop.mobile.core.ui.EffyPage
import com.effyshopping.shop.mobile.core.ui.EffyPageTitle
import com.effyshopping.shop.mobile.core.ui.EffySection
import com.effyshopping.shop.mobile.core.theme.AppearanceMode
import com.effyshopping.shop.mobile.features.shop.domain.Operator
import com.effyshopping.shop.mobile.features.shop.domain.OperatorStatus

@Composable
fun AccountScreen(
    operator: Operator,
    signingOut: Boolean,
    appearanceMode: AppearanceMode = AppearanceMode.System,
    onAppearanceModeChange: (AppearanceMode) -> Unit = {},
    onSignOut: () -> Unit,
) {
    EffyPage {
        EffyPageTitle("Account", operator.email ?: "Shop operator")
        EffySection("IDENTITY") {
            EffyIdentityRow("Role", roleLabel(operator))
            EffyIdentityRow("Status", if (operator.status == OperatorStatus.ACTIVE) "Active" else "Disabled")
            EffyIdentityRow("Shop", operator.shop?.name ?: "Not assigned")
        }
        EffySection("APPEARANCE") {
            AppearanceMode.entries.forEach { mode ->
                val selected = mode == appearanceMode
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 52.dp)
                        .clickable(role = Role.RadioButton) { onAppearanceModeChange(mode) }
                        .semantics(mergeDescendants = true) {
                            role = Role.RadioButton
                            this.selected = selected
                        },
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(mode.label, style = MaterialTheme.typography.bodyLarge)
                    Text(
                        if (selected) "Selected" else "",
                        style = MaterialTheme.typography.labelMedium,
                        color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        EffySection("SESSION") {
            Text(
                "Signing out removes this device's shop session.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            TextButton(
                onClick = onSignOut,
                enabled = !signingOut,
                colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                modifier = Modifier.heightIn(min = 48.dp),
            ) { Text(if (signingOut) "Signing out…" else "Sign out") }
        }
    }
}

private val AppearanceMode.label: String
    get() = when (this) {
        AppearanceMode.Light -> "Light"
        AppearanceMode.Dark -> "Dark"
        AppearanceMode.System -> "Follow system"
    }

internal fun roleLabel(operator: Operator): String = when {
    operator.roles.isEmpty() -> "No role assigned"
    operator.isManagerByRole -> "Shop manager"
    else -> "Shop staff"
}
