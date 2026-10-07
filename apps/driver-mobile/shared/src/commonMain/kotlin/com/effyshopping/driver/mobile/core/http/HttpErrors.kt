package com.effyshopping.driver.mobile.core.http

import com.effyshopping.driver.mobile.contract.ProblemJSON
import com.effyshopping.driver.mobile.core.error.AppError
import com.effyshopping.driver.mobile.core.error.AppException
import com.effyshopping.driver.mobile.core.opening.Opening
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
    return AppException(appErrorFor(status.value, problem))
}

/**
 * The status-and-problem → [AppError] rule, with no transport in it — so the one mapping that
 * depends on the BODY (072's "not open yet") can be tested without a server.
 */
internal fun appErrorFor(status: Int, problem: ProblemJSON?): AppError = when (status) {
    401 -> AppError.Unauthenticated
    403 -> AppError.Forbidden
    404 -> AppError.NotFound
    // 072 — "not open yet" is its own answer, not a conflict: see AppError.NotOpenYet.
    409 -> if (problem?.type == ROUND_NOT_OPEN) AppError.NotOpenYet(problem.opening()) else AppError.Conflict
    429 -> AppError.RateLimited()
    in 500..599 -> AppError.Unavailable
    400 -> AppError.Validation(problem?.detail ?: problem?.title ?: "That didn't work — please try again.")
    else -> AppError.Unexpected
}

/** The problem type every route that progresses a round answers with before the round opens (072). */
private const val ROUND_NOT_OPEN = "round_not_open"

/** The opening the refusal carries, as its `opensAt` and `opensLabel` field issues. */
private fun ProblemJSON.opening(): Opening? {
    val issues = errors ?: return null
    return Opening.of(
        at = issues.firstOrNull { it.field == "opensAt" }?.message,
        label = issues.firstOrNull { it.field == "opensLabel" }?.message,
    )
}

/** Throw the mapped [AppException] if this response is not 2xx; otherwise return it. */
suspend fun HttpResponse.ensureSuccess(): HttpResponse {
    if (!status.isSuccess()) throw toAppException()
    return this
}
