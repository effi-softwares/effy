package com.effyshopping.shop.mobile.features.catalog.domain

/**
 * The stock use cases (054 US1). The ViewModel depends on THESE, not on [StockRepository] directly —
 * the repository is private to the app container (Principle VI, no DI framework).
 */

/** Read a product's stock and its recent history. */
class GetProductStock(private val repo: StockRepository) {
    suspend operator fun invoke(productId: String): ProductStockDetail = repo.getStock(productId)
}

/** Set the count to an exact value. */
class SetStockCount(private val repo: StockRepository) {
    suspend operator fun invoke(
        productId: String,
        onHand: Int,
        reason: StockReason,
        note: String? = null,
    ): ProductStockDetail = repo.setCount(productId, onHand, reason, note)
}

/** Record a relative increase or decrease. */
class AdjustStock(private val repo: StockRepository) {
    suspend operator fun invoke(
        productId: String,
        delta: Int,
        reason: StockReason,
        note: String? = null,
    ): ProductStockDetail = repo.adjust(productId, delta, reason, note)
}

/**
 * Turn tracking on or off.
 *
 * ⚠ Enabling REQUIRES a count (FR-003). The backend refuses without one and the database makes the
 * state unrepresentable; this signature keeps the requirement visible at the call site rather than
 * letting a null slip through to a refusal the operator has to interpret.
 */
class SetStockTracking(private val repo: StockRepository) {
    suspend operator fun invoke(productId: String, tracked: Boolean, onHand: Int?): ProductStockDetail =
        repo.setTracking(productId, tracked, onHand)
}

/** Set or clear this product's own low-stock threshold. Null falls back to the shop default. */
class SetStockThreshold(private val repo: StockRepository) {
    suspend operator fun invoke(productId: String, threshold: Int?): ProductStockDetail =
        repo.setThreshold(productId, threshold)
}

/** This shop's restock list (FR-029) — everything out of stock or at/below its threshold. */
class GetLowStock(private val repo: StockRepository) {
    suspend operator fun invoke(): List<LowStockItem> = repo.lowStock()
}

/**
 * The stock use cases as one bundle, so a screen takes ONE parameter instead of five.
 *
 * ⚠ Not a service locator and not a DI container (Principle VI forbids both) — it is a plain data
 * class the app container fills in by hand at the entry point. It exists because the alternative is
 * threading five constructor arguments through three composables, which is how a parameter list stops
 * being read.
 */
data class StockUseCases(
    val getProductStock: GetProductStock,
    val setStockCount: SetStockCount,
    val adjustStock: AdjustStock,
    val setStockTracking: SetStockTracking,
    val setStockThreshold: SetStockThreshold,
    val getLowStock: GetLowStock,
)
