package com.effyshopping.customer.mobile.features.notifications.offers

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.effyshopping.customer.mobile.core.observability.AnalyticsEvent
import com.effyshopping.customer.mobile.core.presentation.EffySecondaryButton
import com.effyshopping.customer.mobile.core.presentation.EffySheet
import com.effyshopping.customer.mobile.features.legal.generated.MarketingConsent
import com.effyshopping.customer.mobile.features.notifications.settings.domain.ConsentVia
import com.effyshopping.customer.mobile.features.notifications.settings.domain.NotificationPreferencesRepository
import com.effyshopping.customer.mobile.features.notifications.settings.domain.PreferencesUpdate
import com.effyshopping.mobile.design.EffySpacing
import kotlinx.coroutines.CancellationException

/**
 * The one-time offers ask (111 US2): shown on an order's confirmation when Effy says the shopper has never answered.
 * Yes or no - closing the sheet is "Not now" - is recorded for offers and news with where it was given and the wording
 * shown. Only after a yes may the phone's own permission be asked; the phone's answer is never taken as consent.
 */
class OffersAskController(
    private val repo: NotificationPreferencesRepository,
    private val track: (AnalyticsEvent) -> Unit,
    /** The phone's notification permission request; called only after a recorded yes. */
    private val requestPhonePermission: suspend () -> Unit,
) {
    private var shown = false

    /** Whether to show the ask now. A failure to ask (offline, a guest) means "not now", never a guess. */
    suspend fun shouldAsk(): Boolean {
        if (shown) return false
        val ask = try {
            repo.read().askForOffers
        } catch (e: CancellationException) {
            throw e
        } catch (_: Throwable) {
            false
        }
        if (ask) {
            shown = true
            track(AnalyticsEvent.OffersAskShown)
        }
        return ask
    }

    /** Records the answer for both offers and news. A yes then asks the phone. */
    suspend fun answer(yes: Boolean) {
        track(AnalyticsEvent.OffersAskAnswered(if (yes) "yes" else "no"))
        try {
            repo.update(
                PreferencesUpdate(
                    consent = mapOf("offers" to yes, "news" to yes),
                    via = ConsentVia.PROMPT,
                    wordingVersion = MarketingConsent.version,
                ),
            )
        } catch (e: CancellationException) {
            throw e
        } catch (_: Throwable) {
            // Not recorded: nothing is assumed, and the ask comes back on a later confirmation.
            return
        }
        if (yes) {
            try {
                requestPhonePermission()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                // The yes stands whatever the phone does.
            }
        }
    }
}

/** The ask, as a sheet (no centred dialogs in the customer app). Both answers look the same; nothing is pre-chosen. */
@Composable
fun OffersAskSheet(onAnswer: (Boolean) -> Unit) {
    EffySheet(
        title = MarketingConsent.heading,
        onDismiss = { onAnswer(false) },
        cancelLabel = null,
        footer = {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(EffySpacing.md)) {
                EffySecondaryButton(label = MarketingConsent.no, onClick = { onAnswer(false) }, modifier = Modifier.weight(1f))
                EffySecondaryButton(label = MarketingConsent.yes, onClick = { onAnswer(true) }, modifier = Modifier.weight(1f))
            }
        },
    ) {
        Text(MarketingConsent.body, style = MaterialTheme.typography.bodyLarge)
    }
}

/**
 * "Stop offers like this" (111 US6, FR-024): from an offer or news item in the inbox, one tap withdraws consent for that
 * category, recorded as given from the inbox; Undo gives it back the same way. Never a guess: a failure says so.
 */
class MarketingStop(
    private val repo: NotificationPreferencesRepository,
    private val track: (AnalyticsEvent) -> Unit,
) {
    /** True when recorded. */
    suspend fun stop(category: String): Boolean = answer(category, false).also { if (it) track(AnalyticsEvent.OffersStoppedFromInbox(category)) }

    suspend fun undo(category: String): Boolean = answer(category, true)

    private suspend fun answer(category: String, granted: Boolean): Boolean {
        if (category != "offers" && category != "news") return false
        return try {
            repo.update(PreferencesUpdate(consent = mapOf(category to granted), via = ConsentVia.INBOX, wordingVersion = MarketingConsent.version))
            true
        } catch (e: CancellationException) {
            throw e
        } catch (_: Throwable) {
            false
        }
    }

    companion object {
        fun isMarketing(category: String) = category == "offers" || category == "news"
        fun label(category: String) = if (category == "news") MarketingConsent.stopNews else MarketingConsent.stopOffers
    }
}
