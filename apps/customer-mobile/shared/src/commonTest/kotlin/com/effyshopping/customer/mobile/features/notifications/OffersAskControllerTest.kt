package com.effyshopping.customer.mobile.features.notifications

import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.observability.AnalyticsEvent
import com.effyshopping.customer.mobile.features.legal.generated.MarketingConsent
import com.effyshopping.customer.mobile.features.notifications.offers.OffersAskController
import com.effyshopping.customer.mobile.features.notifications.settings.domain.ConsentState
import com.effyshopping.customer.mobile.features.notifications.settings.domain.ConsentVia
import com.effyshopping.customer.mobile.features.notifications.settings.domain.NotificationPreferences
import com.effyshopping.customer.mobile.features.notifications.settings.domain.NotificationPreferencesRepository
import com.effyshopping.customer.mobile.features.notifications.settings.domain.PreferencesUpdate
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** The one-time offers ask (111 US2): only when Effy says so, both categories answered, the phone asked only after a yes. */
class OffersAskControllerTest {
    private class FakeRepo(var ask: Boolean = true, val failRead: Boolean = false, val failUpdate: Boolean = false) : NotificationPreferencesRepository {
        val updates = mutableListOf<PreferencesUpdate>()
        override suspend fun read(): NotificationPreferences {
            if (failRead) throw AppException(AppError.Network)
            return NotificationPreferences(emptyList(), ConsentState(false, null), ConsentState(false, null), ask, MarketingConsent.version)
        }
        override suspend fun update(change: PreferencesUpdate): NotificationPreferences {
            if (failUpdate) throw AppException(AppError.Network)
            updates += change
            ask = false
            return read()
        }
    }

    private val events = mutableListOf<AnalyticsEvent>()
    private var phoneAsked = 0

    @Test
    fun asks_only_when_effy_says_so_and_only_once_per_screen() = runTest {
        val repo = FakeRepo(ask = true)
        val c = OffersAskController(repo, events::add) { phoneAsked++ }
        assertTrue(c.shouldAsk())
        assertFalse(c.shouldAsk())
        assertFalse(OffersAskController(FakeRepo(ask = false), events::add) { }.shouldAsk())
        assertEquals(listOf("offers_ask_shown"), events.map { it.name })
    }

    @Test
    fun a_failure_to_ask_means_not_now() = runTest {
        assertFalse(OffersAskController(FakeRepo(failRead = true), events::add) { }.shouldAsk())
    }

    @Test
    fun yes_records_both_categories_from_the_prompt_then_asks_the_phone() = runTest {
        val repo = FakeRepo()
        val c = OffersAskController(repo, events::add) { phoneAsked++ }
        c.answer(true)
        val sent = repo.updates.single()
        assertEquals(mapOf("offers" to true, "news" to true), sent.consent)
        assertEquals(ConsentVia.PROMPT, sent.via)
        assertEquals(MarketingConsent.version, sent.wordingVersion)
        assertEquals(1, phoneAsked)
    }

    @Test
    fun not_now_records_two_nos_and_never_asks_the_phone() = runTest {
        val repo = FakeRepo()
        OffersAskController(repo, events::add) { phoneAsked++ }.answer(false)
        assertEquals(mapOf("offers" to false, "news" to false), repo.updates.single().consent)
        assertEquals(0, phoneAsked)
    }

    @Test
    fun an_unrecorded_yes_does_not_ask_the_phone() = runTest {
        OffersAskController(FakeRepo(failUpdate = true), events::add) { phoneAsked++ }.answer(true)
        assertEquals(0, phoneAsked)
    }
}
