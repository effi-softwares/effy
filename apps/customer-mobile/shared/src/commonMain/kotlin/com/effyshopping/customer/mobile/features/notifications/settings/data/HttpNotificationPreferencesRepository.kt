package com.effyshopping.customer.mobile.features.notifications.settings.data

import com.effyshopping.customer.mobile.contract.ConsentChange
import com.effyshopping.customer.mobile.contract.ConsentSurface
import com.effyshopping.customer.mobile.contract.NotificationPreferencesChange
import com.effyshopping.customer.mobile.contract.NotificationPreferencesDTO
import com.effyshopping.customer.mobile.contract.PreferenceChoiceChange
import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.http.effyJson
import com.effyshopping.customer.mobile.core.http.ensureSuccess
import com.effyshopping.customer.mobile.features.notifications.settings.domain.CategoryChoice
import com.effyshopping.customer.mobile.features.notifications.settings.domain.ConsentState
import com.effyshopping.customer.mobile.features.notifications.settings.domain.ConsentVia
import com.effyshopping.customer.mobile.features.notifications.settings.domain.ConsentWordingChanged
import com.effyshopping.customer.mobile.features.notifications.settings.domain.NotificationPreferences
import com.effyshopping.customer.mobile.features.notifications.settings.domain.NotificationPreferencesRepository
import com.effyshopping.customer.mobile.features.notifications.settings.domain.PreferenceChannel
import com.effyshopping.customer.mobile.features.notifications.settings.domain.PreferencesUpdate
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.patch
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.util.network.UnresolvedAddressException
import kotlinx.coroutines.CancellationException
import kotlinx.io.IOException
import com.effyshopping.customer.mobile.contract.ConsentVia as WireVia
import com.effyshopping.customer.mobile.contract.PreferenceChannel as WireChannel

/** Notification preferences over the customer service (111, contracts/preferences-api.md). The DTOs never leave this file. */
class HttpNotificationPreferencesRepository(private val edge: HttpClient) : NotificationPreferencesRepository {

    override suspend fun read(): NotificationPreferences = request {
        toDomain(edge.get(PATH).ensureSuccess().body<NotificationPreferencesDTO>())
    }

    override suspend fun update(change: PreferencesUpdate): NotificationPreferences = request {
        val body = NotificationPreferencesChange(
            surface = ConsentSurface.App,
            via = change.via?.let { v -> WireVia.entries.first { it.value == v.wire } },
            changes = change.choices.takeIf { it.isNotEmpty() }?.map { c ->
                PreferenceChoiceChange(category = c.category, channel = WireChannel.entries.first { it.value == c.channel.wire }, enabled = c.enabled)
            },
            consent = change.consent.takeIf { it.isNotEmpty() }?.let { ConsentChange(offers = it["offers"], news = it["news"]) },
            wordingVersion = change.wordingVersion,
            emailWordingVersion = change.emailWordingVersion,
        )
        val response = edge.patch(PATH) {
            contentType(ContentType.Application.Json)
            setBody(effyJson.encodeToString(NotificationPreferencesChange.serializer(), body))
        }
        if (response.status.value == 409) throw ConsentWordingChanged()
        toDomain(response.ensureSuccess().body<NotificationPreferencesDTO>())
    }

    private fun toDomain(dto: NotificationPreferencesDTO) = NotificationPreferences(
        categories = dto.categories.map { c ->
            CategoryChoice(
                category = c.category,
                required = c.required,
                marketing = c.marketing,
                push = c.push,
                email = c.email,
                changeable = c.changeable.mapNotNull { w -> PreferenceChannel.entries.firstOrNull { it.wire == w.value } }.toSet(),
            )
        },
        offers = ConsentState(dto.consent.offers.granted, dto.consent.offers.answeredAt),
        news = ConsentState(dto.consent.news.granted, dto.consent.news.answeredAt),
        askForOffers = dto.askForOffers,
        wordingVersion = dto.wordingVersion,
        emailWordingVersion = dto.emailWordingVersion,
    )

    private suspend inline fun <T> request(block: () -> T): T =
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (e: AppException) {
            throw e
        } catch (e: ConsentWordingChanged) {
            throw e
        } catch (e: IOException) {
            throw AppException(AppError.Network)
        } catch (e: UnresolvedAddressException) {
            throw AppException(AppError.Network)
        } catch (e: Throwable) {
            throw AppException(AppError.Unexpected)
        }

    private companion object {
        const val PATH = "customer/v1/notification-preferences"
    }
}
