package com.effyshopping.shop.mobile.core.http

import com.effyshopping.shop.mobile.contract.ProblemJSON
import com.effyshopping.shop.mobile.core.error.AppError
import com.effyshopping.shop.mobile.core.error.AppException
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.isSuccess

/**
 * Map a non-2xx response to a closed [AppError] (014 contracts/edge-api-shop.contract.md § Errors):
 * 401 → re-auth · 403 → denied/refused · 429 → wait · 503 → degraded+retry. Surfaces **no internal
 * detail** and never says which internal check failed. Transport failures → [AppError.Network] (repo).
 */
suspend fun HttpResponse.toAppException(): AppException {
    val problem = runCatching { effyJson.decodeFromString(ProblemJSON.serializer(), bodyAsText()) }.getOrNull()
    val error = when (status.value) {
        401 -> AppError.Unauthenticated
        403 -> AppError.Forbidden
        404 -> AppError.NotFound
        409 -> AppError.Conflict
        429 -> AppError.RateLimited()
        in 500..599 -> AppError.Unavailable
        400 -> AppError.Validation(problem?.detail ?: problem?.title ?: "That didn't work — please try again.")
        else -> AppError.Unexpected
    }
    return AppException(error)
}

/** Throw the mapped [AppException] if this response is not 2xx; otherwise return it. */
suspend fun HttpResponse.ensureSuccess(): HttpResponse {
    if (!status.isSuccess()) throw toAppException()
    return this
}
