package com.effyshopping.customer.mobile.features.notifications

import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.observability.AnalyticsEvent
import com.effyshopping.customer.mobile.features.legal.generated.MarketingConsent
import com.effyshopping.customer.mobile.features.notifications.settings.domain.CategoryChoice
import com.effyshopping.customer.mobile.features.notifications.settings.domain.ConsentState
import com.effyshopping.customer.mobile.features.notifications.settings.domain.ConsentVia
import com.effyshopping.customer.mobile.features.notifications.settings.domain.ConsentWordingChanged
import com.effyshopping.customer.mobile.features.notifications.settings.domain.NotificationPreferences
import com.effyshopping.customer.mobile.features.notifications.settings.domain.NotificationPreferencesRepository
import com.effyshopping.customer.mobile.features.notifications.settings.domain.PreferenceChannel
import com.effyshopping.customer.mobile.features.notifications.settings.domain.PreferencesUpdate
import com.effyshopping.customer.mobile.features.notifications.settings.presentation.NotificationSettingsViewModel
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/** Notification settings (111 US1): load, a switch that moves at once and comes back on refusal, consent in Effy's words. */
@OptIn(ExperimentalCoroutinesApi::class)
class NotificationSettingsViewModelTest {

    @BeforeTest fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @AfterTest fun tearDown() = Dispatchers.resetMain()

    private class FakeRepo : NotificationPreferencesRepository {
        var prefs = NotificationPreferences(
            categories = listOf(
                CategoryChoice("orders", required = false, marketing = false, push = true, email = true, changeable = setOf(PreferenceChannel.PUSH, PreferenceChannel.EMAIL)),
                CategoryChoice("offers", required = false, marketing = true, push = true, email = false, changeable = setOf(PreferenceChannel.PUSH)),
                CategoryChoice("important", required = true, marketing = false, push = true, email = true, changeable = emptySet()),
            ),
            offers = ConsentState(false, null),
            news = ConsentState(false, null),
            askForOffers = true,
            wordingVersion = MarketingConsent.version,
        )
        var failRead = false
        var refuse: Throwable? = null
        var gate: CompletableDeferred<Unit>? = null
        val updates = mutableListOf<PreferencesUpdate>()
        override suspend fun read(): NotificationPreferences {
            if (failRead) throw AppException(AppError.Network)
            return prefs
        }
        override suspend fun update(change: PreferencesUpdate): NotificationPreferences {
            updates += change
            gate?.await()
            refuse?.let { throw it }
            change.choices.forEach { c -> prefs = prefs.copy(categories = prefs.categories.map { if (it.category == c.category) it.with(c.channel, c.enabled) else it }) }
            change.consent["offers"]?.let { prefs = prefs.copy(offers = ConsentState(it, "2026-11-10T00:00:00Z"), askForOffers = false) }
            return prefs
        }
    }

    private val events = mutableListOf<AnalyticsEvent>()

    @Test
    fun loads_the_choices() {
        val vm = NotificationSettingsViewModel(FakeRepo(), events::add)
        val s = vm.state.value
        assertFalse(s.loading)
        assertEquals(3, s.prefs!!.categories.size)
    }

    @Test
    fun a_failed_load_offers_a_retry() {
        val repo = FakeRepo().apply { failRead = true }
        val vm = NotificationSettingsViewModel(repo, events::add)
        assertTrue(vm.state.value.loadFailed)
        repo.failRead = false
        vm.load()
        assertNotNull(vm.state.value.prefs)
    }

    @Test
    fun a_switch_moves_at_once_and_is_saved() {
        val repo = FakeRepo().apply { gate = CompletableDeferred() }
        val vm = NotificationSettingsViewModel(repo, events::add)
        vm.setChannel("orders", PreferenceChannel.PUSH, false)
        assertFalse(vm.state.value.prefs!!.categories.first { it.category == "orders" }.push, "optimistic")
        repo.gate!!.complete(Unit)
        assertEquals(listOf(PreferencesUpdate.Choice("orders", PreferenceChannel.PUSH, false)), repo.updates.single().choices)
        assertEquals("notification_setting_changed", events.single().name)
    }

    @Test
    fun a_refused_change_comes_back_with_a_message() {
        val repo = FakeRepo().apply { refuse = AppException(AppError.Network) }
        val vm = NotificationSettingsViewModel(repo, events::add)
        vm.setChannel("orders", PreferenceChannel.EMAIL, false)
        assertTrue(vm.state.value.prefs!!.categories.first { it.category == "orders" }.email)
        assertNotNull(vm.state.value.message)
        vm.messageShown()
        assertEquals(null, vm.state.value.message)
    }

    @Test
    fun a_required_category_or_a_channel_it_lacks_never_reaches_the_server() {
        val repo = FakeRepo()
        val vm = NotificationSettingsViewModel(repo, events::add)
        vm.setChannel("important", PreferenceChannel.PUSH, false)
        vm.setChannel("offers", PreferenceChannel.EMAIL, true)
        assertTrue(repo.updates.isEmpty())
    }

    @Test
    fun turning_offers_on_is_a_yes_in_effys_current_words_from_settings() {
        val repo = FakeRepo()
        val vm = NotificationSettingsViewModel(repo, events::add)
        vm.setConsent("offers", true)
        val sent = repo.updates.single()
        assertEquals(mapOf("offers" to true), sent.consent)
        assertEquals(ConsentVia.SETTINGS, sent.via)
        assertEquals(MarketingConsent.version, sent.wordingVersion)
        assertTrue(vm.state.value.prefs!!.offers.granted)
    }

    @Test
    fun changed_wording_puts_the_switch_back_and_reads_again() {
        val repo = FakeRepo().apply { refuse = ConsentWordingChanged() }
        val vm = NotificationSettingsViewModel(repo, events::add)
        vm.setConsent("offers", true)
        assertFalse(vm.state.value.prefs!!.offers.granted)
        assertNotNull(vm.state.value.message)
    }
}
