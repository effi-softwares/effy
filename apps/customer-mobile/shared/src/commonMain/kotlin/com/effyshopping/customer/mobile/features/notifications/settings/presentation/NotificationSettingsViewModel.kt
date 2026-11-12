package com.effyshopping.customer.mobile.features.notifications.settings.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.customer.mobile.core.observability.AnalyticsEvent
import com.effyshopping.customer.mobile.features.legal.generated.MarketingConsent
import com.effyshopping.customer.mobile.features.legal.generated.MarketingEmailConsent
import com.effyshopping.customer.mobile.features.notifications.settings.domain.ConsentState
import com.effyshopping.customer.mobile.features.notifications.settings.domain.ConsentVia
import com.effyshopping.customer.mobile.features.notifications.settings.domain.ConsentWordingChanged
import com.effyshopping.customer.mobile.features.notifications.settings.domain.NotificationPreferences
import com.effyshopping.customer.mobile.features.notifications.settings.domain.NotificationPreferencesRepository
import com.effyshopping.customer.mobile.features.notifications.settings.domain.PreferenceChannel
import com.effyshopping.customer.mobile.features.notifications.settings.domain.PreferencesUpdate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Notification settings (111 US1) - `ViewModel → Repository`. A switch moves at once and is put back if Effy refuses;
 * turning Offers or News on is a yes in Effy's words (`MarketingConsent`), recorded with where it was given.
 */
data class NotificationSettingsUiState(
    val loading: Boolean = true,
    val loadFailed: Boolean = false,
    val prefs: NotificationPreferences? = null,
    /** A one-line message after a refused change ("We couldn't save that…"); cleared by [NotificationSettingsViewModel.messageShown]. */
    val message: String? = null,
    /** 115: Offers or News waiting for the shopper's yes to email, in Effy's words (a sheet); null when none. */
    val emailAsk: String? = null,
)

class NotificationSettingsViewModel(
    private val repo: NotificationPreferencesRepository,
    private val track: (AnalyticsEvent) -> Unit,
) : ViewModel() {

    private val _state = MutableStateFlow(NotificationSettingsUiState())
    val state: StateFlow<NotificationSettingsUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        _state.value = _state.value.copy(loading = true, loadFailed = false)
        viewModelScope.launch {
            try {
                _state.value = _state.value.copy(loading = false, prefs = repo.read())
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                _state.value = _state.value.copy(loading = false, loadFailed = true)
            }
        }
    }

    /** Push or email for a category the shopper may change. */
    fun setChannel(category: String, channel: PreferenceChannel, enabled: Boolean) {
        val prefs = _state.value.prefs ?: return
        val choice = prefs.categories.firstOrNull { it.category == category } ?: return
        if (channel !in choice.changeable) return
        val optimistic = prefs.copy(categories = prefs.categories.map { if (it.category == category) it.with(channel, enabled) else it })
        save(prefs, optimistic, PreferencesUpdate(choices = listOf(PreferencesUpdate.Choice(category, channel, enabled))))
        track(AnalyticsEvent.NotificationSettingChanged(category, channel.wire, enabled))
    }

    /** The main switch of Offers or News: a yes or a no, in Effy's current words. */
    fun setConsent(category: String, granted: Boolean) {
        val prefs = _state.value.prefs ?: return
        if (category != "offers" && category != "news") return
        val answer = ConsentState(granted, prefs.consent(category)?.answeredAt)
        val optimistic = if (category == "offers") prefs.copy(offers = answer, askForOffers = false) else prefs.copy(news = answer, askForOffers = false)
        save(
            prefs,
            optimistic,
            PreferencesUpdate(consent = mapOf(category to granted), via = ConsentVia.SETTINGS, wordingVersion = MarketingConsent.version),
        )
        track(AnalyticsEvent.NotificationSettingChanged(category, "consent", granted))
    }

    /**
     * 115: email for Offers or News. Turning it on first shows Effy's email wording (`MarketingEmailConsent`) and saves
     * only on the yes ([confirmMarketingEmail]); turning it off saves at once.
     */
    fun setMarketingEmail(category: String, enabled: Boolean) {
        val prefs = _state.value.prefs ?: return
        val choice = prefs.categories.firstOrNull { it.category == category } ?: return
        if (!choice.marketing || PreferenceChannel.EMAIL !in choice.changeable) return
        if (enabled) {
            if (prefs.consent(category)?.granted != true) return
            _state.value = _state.value.copy(emailAsk = category)
            return
        }
        saveEmail(prefs, category, false)
    }

    /** The yes on the email sheet. */
    fun confirmMarketingEmail() {
        val category = _state.value.emailAsk ?: return
        _state.value = _state.value.copy(emailAsk = null)
        val prefs = _state.value.prefs ?: return
        saveEmail(prefs, category, true)
    }

    /** "Not now", or the sheet dismissed: nothing is saved. */
    fun dismissMarketingEmail() {
        _state.value = _state.value.copy(emailAsk = null)
    }

    private fun saveEmail(prefs: NotificationPreferences, category: String, enabled: Boolean) {
        val optimistic = prefs.copy(categories = prefs.categories.map { if (it.category == category) it.with(PreferenceChannel.EMAIL, enabled) else it })
        save(
            prefs,
            optimistic,
            PreferencesUpdate(
                choices = listOf(PreferencesUpdate.Choice(category, PreferenceChannel.EMAIL, enabled)),
                emailWordingVersion = if (enabled) MarketingEmailConsent.version else null,
            ),
        )
        track(AnalyticsEvent.MarketingEmailToggled(category, enabled))
    }

    fun messageShown() {
        _state.value = _state.value.copy(message = null)
    }

    private fun save(before: NotificationPreferences, optimistic: NotificationPreferences, change: PreferencesUpdate) {
        _state.value = _state.value.copy(prefs = optimistic)
        viewModelScope.launch {
            try {
                _state.value = _state.value.copy(prefs = repo.update(change))
            } catch (e: CancellationException) {
                throw e
            } catch (_: ConsentWordingChanged) {
                // The words changed under us: show what Effy says now, and ask again by not saving.
                _state.value = _state.value.copy(prefs = before, message = "Our wording has changed. Please check it and try again.")
                load()
            } catch (_: Throwable) {
                _state.value = _state.value.copy(prefs = before, message = "We couldn't save that. Check your connection and try again.")
            }
        }
    }
}
