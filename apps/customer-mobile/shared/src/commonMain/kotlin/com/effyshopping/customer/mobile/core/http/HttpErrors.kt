package com.effyshopping.customer.mobile.core.http

import com.effyshopping.customer.mobile.contract.ProblemJSON
import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.isSuccess

/**
 * Map a non-2xx response to a closed [AppError] (013 contracts/edge-api-customer.contract.md § Errors).
 * Primarily by status code; the human message comes from the `application/problem+json` body when present.
 * Transport failures (no response at all) are mapped to [AppError.Network] by the repository's try/catch.
 */
suspend fun HttpResponse.toAppException(): AppException {
    val problem = runCatching { effyJson.decodeFromString(ProblemJSON.serializer(), bodyAsText()) }.getOrNull()
    val message = problem?.detail ?: problem?.title
    val title = problem?.title.orEmpty()

    val error = when (status.value) {
        400 -> AppError.Validation(message ?: "That didn't work — check your details and try again.")
        401 -> if (title.contains("password", ignoreCase = true)) AppError.WrongPassword
        else AppError.Unauthenticated
        403 -> AppError.Forbidden
        409 -> AppError.WrongPasswordMode
        429 -> AppError.RateLimited()
        in 500..599 -> AppError.Unavailable
        else -> AppError.Unexpected
    }
    return AppException(error)
}

/** Throw the mapped [AppException] if this response is not 2xx; otherwise return it. */
suspend fun HttpResponse.ensureSuccess(): HttpResponse {
    if (!status.isSuccess()) throw toAppException()
    return this
}
