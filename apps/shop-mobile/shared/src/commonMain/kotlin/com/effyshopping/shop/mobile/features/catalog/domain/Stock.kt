package com.effyshopping.shop.mobile.features.catalog.domain

/**
 * Stock, as an operator sees it (054 US1). Pure domain — no DTO, no HTTP (Principle VI).
 *
 * ⚠ NOTHING HERE IS CUSTOMER-FACING. FR-015 forbids disclosing a unit count on any browse surface and
 * shop identity anywhere; this is the shop's own console, reading its own shelf.
 */

/** Why a count moved. A closed set, mirroring the database CHECK and the wire contract. */
enum class StockReason(val wire: String) {
    RECEIVED("received"),
    CORRECTION("correction"),
    DAMAGE("damage"),
    EXPIRY("expiry"),
    ORDER_PAID("order_paid"),
    PICK_SHORTFALL("pick_shortfall"),
    TRACKING_ENABLED("tracking_enabled"),
    TRACKING_DISABLED("tracking_disabled");

    companion object {
        fun fromWire(value: String): StockReason =
            entries.firstOrNull { it.wire == value } ?: CORRECTION
    }
}

/** The four an operator may choose. The rest are written by the platform, never picked by a person. */
val OPERATOR_STOCK_REASONS: List<StockReason> =
    listOf(StockReason.RECEIVED, StockReason.CORRECTION, StockReason.DAMAGE, StockReason.EXPIRY)

/**
 * WHO acted, kept separate from WHY.
 *
 * ⚠ The separation is what makes FR-027 possible: a shop must be able to see plainly that back-office
 * changed their numbers on their behalf, WITHOUT back-office having to pick a reason that says so.
 */
enum class StockActor(val wire: String) {
    SHOP("shop"),
    BACK_OFFICE("back_office"),
    SYSTEM("system");

    companion object {
        fun fromWire(value: String): StockActor = entries.firstOrNull { it.wire == value } ?: SYSTEM
    }
}

/**
 * One product's stock.
 *
 * ⚠ [onHand] is null EXACTLY when untracked, which the database enforces in both directions. An
 * untracked product is unlimited and behaves precisely as it did before 054 existed (FR-002).
 */
data class ProductStock(
    val productId: String,
    val tracked: Boolean,
    val onHand: Int?,
    val threshold: Int?,
    val effectiveThreshold: Int?,
    val outOfStock: Boolean,
    val low: Boolean,
)

data class StockMovement(
    val id: String,
    val quantityDelta: Int,
    val quantityBefore: Int,
    val quantityAfter: Int,
    val reason: StockReason,
    val actor: StockActor,
    /** A display name where the platform holds one. ⚠ Never an email address. */
    val actorLabel: String?,
    val orderNumber: String?,
    val note: String?,
    val createdAt: String,
)

/**
 * One line of the restock list (054 US5).
 *
 * ⚠ `severity` is two values, not a boolean. An empty shelf and a thin one need different actions —
 * restock now versus restock soon — and collapsing them tells an operator nothing to act on.
 */
data class LowStockItem(
    val productId: String,
    val name: String,
    val sku: String?,
    val onHand: Int,
    val effectiveThreshold: Int?,
    val outOfStock: Boolean,
)

/** Stock plus its history, newest first (FR-009). */
data class ProductStockDetail(
    val stock: ProductStock,
    val movements: List<StockMovement>,
)

/**
 * The stock boundary. Everything goes to `edge-api/inventory` with the same single access-token bearer
 * the catalog uses.
 *
 * ⚠ NOTE THE SERVICE. Stock is served by a SEPARATE cold-path service from the rest of the catalog,
 * because `edge-api/admin` had no CloudFormation resources left for the back-office half of this
 * feature (research R6). Same gateway, same bearer; only the path prefix differs. The backend still
 * scopes every call `WHERE shop_id = actorShopId` — the client never supplies a shop id.
 */
interface StockRepository {
    /** `GET /inventory/v1/products/{id}/stock` */
    suspend fun getStock(productId: String): ProductStockDetail

    /** `PUT /inventory/v1/products/{id}/stock` — an absolute count. */
    suspend fun setCount(productId: String, onHand: Int, reason: StockReason, note: String?): ProductStockDetail

    /** `POST /inventory/v1/products/{id}/stock/adjustments` — a relative change. */
    suspend fun adjust(productId: String, delta: Int, reason: StockReason, note: String?): ProductStockDetail

    /** `PUT /inventory/v1/products/{id}/stock/tracking` — [onHand] is REQUIRED when enabling (FR-003). */
    suspend fun setTracking(productId: String, tracked: Boolean, onHand: Int?): ProductStockDetail

    /** `PUT /inventory/v1/products/{id}/stock/threshold` — null clears it, falling back to the shop default. */
    suspend fun setThreshold(productId: String, threshold: Int?): ProductStockDetail

    /** `GET /inventory/v1/low-stock` — this shop's restock list, out-of-stock first. */
    suspend fun lowStock(): List<LowStockItem>
}
