package com.effyshopping.customer.mobile.features.points.data

import com.effyshopping.customer.mobile.contract.PointsBalanceDTO
import com.effyshopping.customer.mobile.contract.PointsHistoryPageDTO
import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.http.ensureSuccess
import com.effyshopping.customer.mobile.features.points.domain.PointsBalance
import com.effyshopping.customer.mobile.features.points.domain.PointsExpiry
import com.effyshopping.customer.mobile.features.points.domain.PointsHistoryPage
import com.effyshopping.customer.mobile.features.points.domain.PointsLine
import com.effyshopping.customer.mobile.features.points.domain.PointsRepository
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.util.network.UnresolvedAddressException
import kotlinx.coroutines.CancellationException
import kotlinx.io.IOException

/**
 * Points over the customer service (074 US1). The DTOs never leave this file (Principle VI).
 */
class HttpPointsRepository(private val edge: HttpClient) : PointsRepository {

    override suspend fun balance(): PointsBalance = request {
        edge.get("customer/v1/points").ensureSuccess().body<PointsBalanceDTO>().let { dto ->
            PointsBalance(
                points = dto.points,
                valueAmount = dto.valueAmount,
                nextExpiry = dto.nextExpiry?.let { PointsExpiry(points = it.points, date = it.date) },
            )
        }
    }

    override suspend fun history(cursor: String?): PointsHistoryPage = request {
        edge.get("customer/v1/points/history") { if (cursor != null) parameter("cursor", cursor) }
            .ensureSuccess()
            .body<PointsHistoryPageDTO>()
            .let { page ->
                PointsHistoryPage(
                    lines = page.entries.map { e ->
                        PointsLine(id = e.id, points = e.points, words = e.words, usableUntil = e.expiresOn, at = e.at)
                    },
                    nextCursor = page.nextCursor,
                )
            }
    }

    private suspend inline fun <T> request(block: () -> T): T =
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (e: AppException) {
            throw e
        } catch (e: IOException) {
            throw AppException(AppError.Network)
        } catch (e: UnresolvedAddressException) {
            throw AppException(AppError.Network)
        } catch (e: Throwable) {
            throw AppException(AppError.Unexpected)
        }
}
