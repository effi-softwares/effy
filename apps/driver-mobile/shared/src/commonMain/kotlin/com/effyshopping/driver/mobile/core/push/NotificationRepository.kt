package com.effyshopping.driver.mobile.core.push

import com.effyshopping.driver.mobile.contract.NotificationReadResponseDTO
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.ResponseException
import io.ktor.client.request.post
import io.ktor.http.encodeURLPathPart
import kotlinx.coroutines.CancellationException

/** What recording a tapped notification as read found (109). */
sealed interface ReadResult {
    /** It is this driver's; [destination] is where it leads, as stored (null when this build does not know it). */
    data class Opened(val destination: DriverDestination?) : ReadResult

    /** Not this driver's notification (or none): show nothing from it. */
    data object NotYours : ReadResult

    /** The question could not be asked (no signal, server error). */
    data object Unreachable : ReadResult
}

/** The driver's notifications. Only "opened" for now; the inbox (spec 2) adds the list. */
interface NotificationRepository {
    suspend fun markRead(notificationId: String): ReadResult
}

/** Over the driver service: `POST driver/v1/notifications/{id}/read`. The DTO never leaves this file. */
class HttpNotificationRepository(private val driver: HttpClient) : NotificationRepository {
    override suspend fun markRead(notificationId: String): ReadResult = try {
        val response = driver.post("driver/v1/notifications/${notificationId.encodeURLPathPart()}/read")
        when (response.status.value) {
            in 200..299 -> ReadResult.Opened(parseDriverDestination(response.body<NotificationReadResponseDTO>().destination))
            400, 404 -> ReadResult.NotYours
            else -> ReadResult.Unreachable
        }
    } catch (e: CancellationException) {
        throw e
    } catch (e: ResponseException) {
        if (e.response.status.value == 404 || e.response.status.value == 400) ReadResult.NotYours else ReadResult.Unreachable
    } catch (e: Exception) {
        ReadResult.Unreachable
    }
}

/**
 * After a sign-in, a tap held while signed out (109 FR-014): where to go if the notification is the signed-in
 * driver's, or null to drop it - someone else's, unverifiable (no signal) or without an id. The SERVER's stored
 * destination is used, not the one the push carried.
 */
suspend fun verifiedDestinationOf(held: OpenedNotification, repository: NotificationRepository): HeldOutcome {
    val id = held.notificationId ?: return HeldOutcome.Drop
    return when (val r = repository.markRead(id)) {
        is ReadResult.Opened -> HeldOutcome.Open(r.destination)
        ReadResult.NotYours, ReadResult.Unreachable -> HeldOutcome.Drop
    }
}

sealed interface HeldOutcome {
    data class Open(val destination: DriverDestination?) : HeldOutcome
    data object Drop : HeldOutcome
}
