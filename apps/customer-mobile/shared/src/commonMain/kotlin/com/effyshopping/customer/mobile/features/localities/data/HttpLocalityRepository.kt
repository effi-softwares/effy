package com.effyshopping.customer.mobile.features.localities.data

import com.effyshopping.customer.mobile.commerce.contract.LocalityDTO
import com.effyshopping.customer.mobile.features.localities.domain.Locality
import com.effyshopping.customer.mobile.features.localities.domain.LocalityRepository
import com.effyshopping.customer.mobile.features.localities.domain.LocalityResult
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.CancellationException

/**
 * The locality lookup over the CORE api (030 — the hot path, per the routing law: a public,
 * latency-sensitive read that fires while the shopper types).
 *
 * ⚠ THE ERROR MAPPING IS THE POINT OF THIS FILE. Three server outcomes become three distinct domain
 * outcomes, and the UI renders three distinct messages:
 *
 *   200 + list  → Places   ("here are the places you could mean" — an EMPTY list means we don't know
 *                           that place, which is NOT a delivery refusal)
 *   400         → Invalid  ("keep typing")
 *   anything else / transport failure → Failed ("we couldn't look that up")
 *
 * ⚠ A failure MUST NOT become an empty list. An outage would then read to the shopper as "that place
 * does not exist" — a false statement about the world, caused by us (FR-013). That collapse is the
 * single easiest mistake to make here, which is why the domain type is a sealed interface rather than
 * a nullable list.
 */
class HttpLocalityRepository(private val core: HttpClient) : LocalityRepository {

    override suspend fun search(query: String): LocalityResult =
        try {
            val response = core.get("v1/storefront/localities") { parameter("q", query) }
            when {
                response.status == HttpStatusCode.BadRequest -> LocalityResult.Invalid
                response.status.isSuccess() -> LocalityResult.Places(
                    response.body<List<LocalityDTO>>().map { it.toDomain() },
                )
                else -> LocalityResult.Failed
            }
        } catch (e: CancellationException) {
            // ⚠ Rethrown, never swallowed into Failed. A cancelled lookup is the shopper typing the
            // next character, not an outage, and reporting it as one would flash "we couldn't look
            // that up" on every keystroke.
            throw e
        } catch (_: Throwable) {
            LocalityResult.Failed
        }
}

private fun io.ktor.http.HttpStatusCode.isSuccess(): Boolean = value in 200..299

/** Wire → domain, mapped explicitly so the DTO never escapes the data layer (Principle VI). */
private fun LocalityDTO.toDomain(): Locality =
    Locality(name = name, state = state, postcode = postcode)
