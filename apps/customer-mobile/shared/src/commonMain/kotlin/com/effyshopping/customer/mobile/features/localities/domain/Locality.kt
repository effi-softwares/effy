package com.effyshopping.customer.mobile.features.localities.domain

/**
 * The locality lookup (030 US1) — how a shopper names where they live by SUBURB rather than by a
 * postcode they have to already know.
 *
 * Clean Architecture, same shape as every other mobile feature: this file is the domain (entity +
 * repository interface + use case), `data/` implements the repository over HTTP, and presentation
 * consumes the use case. The domain depends on nothing.
 */

/**
 * One Australian place a shopper can name.
 *
 * ⚠ ALL THREE FIELDS IDENTIFY IT, and no two of them do: a locality name recurs across states (there
 * are many Springfields — six Richmonds in the real dataset), a locality spans several postcodes, and
 * a postcode covers several localities. That is why FR-008 forbids offering a bare name to select,
 * and why `public.locality`'s natural key is the triple.
 */
data class Locality(
    val name: String,
    val state: String,
    val postcode: String,
)

/**
 * The outcome of a lookup.
 *
 * ⚠ THREE OUTCOMES, and keeping them apart all the way to the shopper is the entire job:
 *
 *   [Places] (possibly empty) — the lookup ran; empty means "no place matches"
 *   [Invalid]                 — too little input; the UI says "keep typing"
 *   [Failed]                  — we could not look it up
 *
 * **None of them is "we don't deliver there."** That is a different question with its own answer, and
 * collapsing any of these into it is the failure the whole delivery-location capability exists to
 * prevent (FR-012, FR-013). A sealed type is used rather than `List<Locality>?` precisely so a caller
 * cannot accidentally treat "failed" and "no matches" as the same thing — the compiler makes them
 * distinguish.
 */
sealed interface LocalityResult {
    data class Places(val places: List<Locality>) : LocalityResult
    data object Invalid : LocalityResult
    data object Failed : LocalityResult
}

interface LocalityRepository {
    suspend fun search(query: String): LocalityResult
}

/** Find the places a shopper could mean (030 FR-005). */
class SearchLocalities(private val repo: LocalityRepository) {
    suspend operator fun invoke(query: String): LocalityResult = repo.search(query)
}
