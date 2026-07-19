package com.effyshopping.customer.mobile.features.favorites.domain

/**
 * Favorites (019 US2 save/un-save; the list is US6). Commerce → the hot path. Save is idempotent. Both
 * operations require a session (the core client sends the customer's tokens); a guest is sent through
 * deferred sign-in by the presentation layer before these are ever called.
 */
/** A saved product for the favourites list (US6). */
data class FavoriteCard(
    val id: String,
    val name: String,
    val imageUrl: String?,
    val priceAmount: String,
    val currency: String,
    val available: Boolean,
)

interface FavoritesRepository {
    suspend fun save(productId: String)
    suspend fun remove(productId: String)
    suspend fun list(): List<FavoriteCard>
}

class SaveFavorite(private val repo: FavoritesRepository) {
    suspend operator fun invoke(productId: String) = repo.save(productId)
}

class RemoveFavorite(private val repo: FavoritesRepository) {
    suspend operator fun invoke(productId: String) = repo.remove(productId)
}

class ListFavorites(private val repo: FavoritesRepository) {
    suspend operator fun invoke(): List<FavoriteCard> = repo.list()
}
