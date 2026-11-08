package com.effyshopping.customer.mobile.features.notifications.settings.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.platform.rememberTurnOnNotifications
import com.effyshopping.customer.mobile.core.presentation.EffyAppBar
import com.effyshopping.customer.mobile.core.presentation.EffyErrorState
import com.effyshopping.customer.mobile.core.presentation.EffyGroup
import com.effyshopping.customer.mobile.core.presentation.EffyGroupDivider
import com.effyshopping.customer.mobile.core.presentation.EffyLoading
import com.effyshopping.customer.mobile.core.presentation.EffySecondaryButton
import com.effyshopping.customer.mobile.core.presentation.EffySkeletonText
import com.effyshopping.customer.mobile.core.presentation.EffySwitchRow
import com.effyshopping.customer.mobile.core.push.CategoryPolicy
import com.effyshopping.customer.mobile.core.push.NotificationCategoryPolicy
import com.effyshopping.customer.mobile.features.legal.generated.MarketingConsent
import com.effyshopping.customer.mobile.features.notifications.settings.domain.CategoryChoice
import com.effyshopping.customer.mobile.features.notifications.settings.domain.NotificationPreferences
import com.effyshopping.customer.mobile.features.notifications.settings.domain.PreferenceChannel
import com.effyshopping.customer.mobile.core.presentation.EffySize
import com.effyshopping.mobile.design.EffySpacing

/**
 * Notification settings (111 US1): every kind of message Effy sends the shopper, a switch for each way it can reach
 * them, Offers and News off until they say yes, and Important and Support shown as fixed with the reason. When the
 * phone has Effy's notifications off, the top says so and opens the phone's settings. The words are the shared policy
 * (`NotificationCategoryPolicy`) and Effy's consent wording (`MarketingConsent`).
 */
@Composable
fun NotificationSettingsScreen(container: AppContainer, snackbar: SnackbarHostState) {
    val vm = viewModel { NotificationSettingsViewModel(repo = container.notificationPreferences, track = container.analyticsDriver::capture) }
    val state by vm.state.collectAsStateWithLifecycle()
    val turnOn = rememberTurnOnNotifications()

    LaunchedEffect(state.message) {
        val message = state.message ?: return@LaunchedEffect
        snackbar.showSnackbar(message)
        vm.messageShown()
    }

    Column(Modifier.fillMaxSize()) {
        EffyAppBar(title = "Notification settings")
        val prefs = state.prefs
        when {
            prefs == null && state.loadFailed -> EffyErrorState(title = "We couldn't load your settings", onRetry = vm::load)
            prefs == null -> SettingsSkeleton()
            else -> Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(EffySpacing.lg),
                verticalArrangement = Arrangement.spacedBy(EffySpacing.lg),
            ) {
                if (turnOn != null) PhoneOffNotice(turnOn)
                for (policy in NotificationCategoryPolicy.CUSTOMER) {
                    val choice = prefs.categories.firstOrNull { it.category == policy.category } ?: continue
                    when {
                        policy.required -> FixedGroup(policy)
                        policy.marketing -> MarketingGroup(policy, choice, prefs, vm)
                        else -> ChannelGroup(policy, choice, vm)
                    }
                    if (policy.category == "news") Footnote(MarketingConsent.footnote)
                }
            }
        }
    }
}

@Composable
private fun PhoneOffNotice(turnOn: () -> Unit) {
    EffyGroup {
        Column(Modifier.padding(EffySpacing.lg), verticalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
            Text("Notifications are off for Effy on this phone", style = MaterialTheme.typography.titleSmall)
            Text(
                "Your choices below are saved, but nothing will show on this phone until you turn them on.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            EffySecondaryButton(label = "Open settings", onClick = turnOn)
        }
    }
}

/** Order updates and Points: a phone switch and an email switch. They always reach the inbox. */
@Composable
private fun ChannelGroup(policy: CategoryPolicy, choice: CategoryChoice, vm: NotificationSettingsViewModel) {
    EffyGroup(caption = policy.label) {
        Description(policy.description)
        EffyGroupDivider()
        EffySwitchRow(
            label = "Phone notifications",
            checked = choice.push,
            onCheckedChange = { vm.setChannel(policy.category, PreferenceChannel.PUSH, it) },
        )
        if (PreferenceChannel.EMAIL in choice.changeable) {
            EffyGroupDivider()
            EffySwitchRow(label = "Email", checked = choice.email, onCheckedChange = { vm.setChannel(policy.category, PreferenceChannel.EMAIL, it) })
        }
    }
}

/** Offers and News: the main switch is the shopper's yes; the phone switch shows once they have said it. */
@Composable
private fun MarketingGroup(policy: CategoryPolicy, choice: CategoryChoice, prefs: NotificationPreferences, vm: NotificationSettingsViewModel) {
    val granted = prefs.consent(policy.category)?.granted == true
    EffyGroup(caption = policy.label) {
        EffySwitchRow(
            label = "Hear about ${policy.label.lowercase()}",
            supporting = policy.description,
            checked = granted,
            onCheckedChange = { vm.setConsent(policy.category, it) },
        )
        if (granted) {
            EffyGroupDivider()
            EffySwitchRow(label = "Phone notifications", checked = choice.push, onCheckedChange = { vm.setChannel(policy.category, PreferenceChannel.PUSH, it) })
        }
    }
}

/** Important and Support: always on, with why. */
@Composable
private fun FixedGroup(policy: CategoryPolicy) {
    EffyGroup(caption = policy.label) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = EffySize.target).padding(horizontal = EffySpacing.lg, vertical = EffySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
        ) {
            Column(Modifier.weight(1f)) {
                Text(policy.description, style = MaterialTheme.typography.bodyLarge)
                policy.reason?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            Text("Always on", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun Description(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = EffySpacing.lg, vertical = EffySpacing.md),
    )
}

@Composable
private fun Footnote(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = EffySpacing.xs),
    )
}

/** The page's own shape: each group's caption is known, the rows are bones. */
@Composable
private fun SettingsSkeleton() {
    EffyLoading(label = "Loading your notification settings") {
        Column(
            Modifier.fillMaxSize().padding(EffySpacing.lg),
            verticalArrangement = Arrangement.spacedBy(EffySpacing.lg),
        ) {
            for (policy in NotificationCategoryPolicy.CUSTOMER) {
                EffyGroup(caption = policy.label) {
                    Column(Modifier.padding(EffySpacing.lg), verticalArrangement = Arrangement.spacedBy(EffySpacing.md)) {
                        EffySkeletonText(MaterialTheme.typography.bodyMedium, widthFraction = 0.8f)
                        EffySkeletonText(MaterialTheme.typography.bodyLarge, widthFraction = 0.5f)
                    }
                }
            }
        }
    }
}
