package com.effyshopping.customer.mobile.features.favorites.data

import com.effyshopping.customer.mobile.commerce.contract.FavoriteDTO
import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.http.ensureSuccess
import com.effyshopping.customer.mobile.features.favorites.domain.FavoriteCard
import com.effyshopping.customer.mobile.features.favorites.domain.FavoritesRepository
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.put
import io.ktor.util.network.UnresolvedAddressException
import kotlinx.coroutines.CancellationException
import kotlinx.io.IOException

/**
 * Favorites over the CORE api (019 US2). [core] carries the customer's session; a guest never reaches
 * here (the UI raises deferred sign-in first). Idempotent PUT/DELETE → 204.
 */
class HttpFavoritesRepository(private val core: HttpClient) : FavoritesRepository {

    override suspend fun save(productId: String) = request {
        core.put("v1/favorites/$productId").ensureSuccess()
        Unit
    }

    override suspend fun remove(productId: String) = request {
        core.delete("v1/favorites/$productId").ensureSuccess()
        Unit
    }

    override suspend fun list(): List<FavoriteCard> = request {
        core.get("v1/favorites").ensureSuccess().body<List<FavoriteDTO>>().map {
            FavoriteCard(
                id = it.id, name = it.name, imageUrl = it.imageURL,
                priceAmount = it.priceAmount, currency = it.currency, available = it.available,
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
