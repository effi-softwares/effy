package com.effyshopping.customer.mobile.features.notifications.settings.domain

/**
 * The shopper's say over what Effy sends them (111): a choice per category and channel, and their yes or no to offers
 * and news. `ViewModel → UseCase → Repository` (Principle VI); the DTOs stay in the data layer. Words come from
 * `NotificationCategoryPolicy` and `MarketingConsent`, never the wire.
 */
enum class PreferenceChannel(val wire: String) { PUSH("push"), EMAIL("email") }

enum class ConsentVia(val wire: String) { SETTINGS("settings"), PROMPT("prompt"), INBOX("inbox") }

data class CategoryChoice(
    val category: String,
    val required: Boolean,
    val marketing: Boolean,
    /** For a marketing category, the push choice; it takes effect only while consent is granted. */
    val push: Boolean,
    val email: Boolean,
    val changeable: Set<PreferenceChannel>,
) {
    fun isOn(channel: PreferenceChannel): Boolean = if (channel == PreferenceChannel.PUSH) push else email
    fun with(channel: PreferenceChannel, enabled: Boolean): CategoryChoice =
        if (channel == PreferenceChannel.PUSH) copy(push = enabled) else copy(email = enabled)
}

data class ConsentState(val granted: Boolean, val answeredAt: String?)

data class NotificationPreferences(
    val categories: List<CategoryChoice>,
    val offers: ConsentState,
    val news: ConsentState,
    /** Show the one-time offers ask on an order confirmation. */
    val askForOffers: Boolean,
    val wordingVersion: String,
    /** 115: the marketing-email wording current now (`MarketingEmailConsent`); a build showing older words is refused. */
    val emailWordingVersion: String = "",
) {
    fun consent(category: String): ConsentState? = when (category) {
        "offers" -> offers
        "news" -> news
        else -> null
    }
}

/** One change, all or nothing. A consent answer must carry where it was given and the wording shown. */
data class PreferencesUpdate(
    val choices: List<Choice> = emptyList(),
    val consent: Map<String, Boolean> = emptyMap(),
    val via: ConsentVia? = null,
    val wordingVersion: String? = null,
    /** 115: the marketing-email wording shown, required when email is turned on for Offers or News. */
    val emailWordingVersion: String? = null,
) {
    data class Choice(val category: String, val channel: PreferenceChannel, val enabled: Boolean)
}

/** The server holds newer consent wording than this build showed: read again and show it. */
class ConsentWordingChanged : Exception()

interface NotificationPreferencesRepository {
    suspend fun read(): NotificationPreferences
    /** Returns the preferences after the change. A refusal throws (an `AppException`, or [ConsentWordingChanged]). */
    suspend fun update(change: PreferencesUpdate): NotificationPreferences
}
