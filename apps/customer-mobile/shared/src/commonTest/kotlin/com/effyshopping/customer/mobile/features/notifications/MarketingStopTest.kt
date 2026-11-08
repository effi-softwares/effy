package com.effyshopping.customer.mobile.features.notifications

import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.observability.AnalyticsEvent
import com.effyshopping.customer.mobile.features.legal.generated.MarketingConsent
import com.effyshopping.customer.mobile.features.notifications.offers.MarketingStop
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

/** "Stop offers like this" (111 US6): a no from the inbox, Undo a yes from the inbox, nothing for other categories. */
class MarketingStopTest {
    private class FakeRepo(val fail: Boolean = false) : NotificationPreferencesRepository {
        val updates = mutableListOf<PreferencesUpdate>()
        override suspend fun read() = NotificationPreferences(emptyList(), ConsentState(true, null), ConsentState(true, null), false, MarketingConsent.version)
        override suspend fun update(change: PreferencesUpdate): NotificationPreferences {
            if (fail) throw AppException(AppError.Network)
            updates += change
            return read()
        }
    }

    private val events = mutableListOf<AnalyticsEvent>()

    @Test
    fun stop_is_a_no_from_the_inbox_and_undo_gives_it_back() = runTest {
        val repo = FakeRepo()
        val s = MarketingStop(repo, events::add)
        assertTrue(s.stop("news"))
        assertTrue(s.undo("news"))
        assertEquals(listOf(mapOf("news" to false), mapOf("news" to true)), repo.updates.map { it.consent })
        assertTrue(repo.updates.all { it.via == ConsentVia.INBOX && it.wordingVersion == MarketingConsent.version })
        assertEquals(listOf("offers_stopped_from_inbox"), events.map { it.name })
    }

    @Test
    fun only_offers_and_news_can_be_stopped_and_a_failure_says_so() = runTest {
        val repo = FakeRepo()
        assertFalse(MarketingStop(repo, events::add).stop("orders"))
        assertTrue(repo.updates.isEmpty())
        assertFalse(MarketingStop(FakeRepo(fail = true), events::add).stop("offers"))
        assertEquals(MarketingConsent.stopNews, MarketingStop.label("news"))
        assertEquals(MarketingConsent.stopOffers, MarketingStop.label("offers"))
    }
}
