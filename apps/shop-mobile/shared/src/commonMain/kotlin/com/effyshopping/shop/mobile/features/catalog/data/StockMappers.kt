package com.effyshopping.shop.mobile.features.catalog.data

import com.effyshopping.shop.mobile.contract.OperatorStockReason
import com.effyshopping.shop.mobile.contract.LowStockRowDTO
import com.effyshopping.shop.mobile.contract.Severity
import com.effyshopping.shop.mobile.contract.ProductStockDTO
import com.effyshopping.shop.mobile.contract.ProductStockDetailDTO
import com.effyshopping.shop.mobile.contract.StockMovementDTO
import com.effyshopping.shop.mobile.features.catalog.domain.LowStockItem
import com.effyshopping.shop.mobile.features.catalog.domain.ProductStock
import com.effyshopping.shop.mobile.features.catalog.domain.ProductStockDetail
import com.effyshopping.shop.mobile.features.catalog.domain.StockActor
import com.effyshopping.shop.mobile.features.catalog.domain.StockMovement
import com.effyshopping.shop.mobile.features.catalog.domain.StockReason

/**
 * DTO → domain (Principle VI: a DTO never escapes the data layer).
 *
 * ⚠ THE COUNTS ARRIVE AS `Long`, NOT `Double`, and that is the contract's doing, not luck. The
 * generated Kotlin is derived from `WireInt` (`@asType integer`) in `packages/shared-types` — the
 * alias 027 introduced after Kotlin's bare-`number` serialisation sent `1.0` where an integer was
 * expected and silently broke every mobile cart write. The first draft of the 054 contract used bare
 * `number` and duly generated `Double`; the drift guard would not have caught it, because the
 * generated file matched the source exactly. Only reading the Kotlin back does.
 */
fun ProductStockDetailDTO.toDomain(): ProductStockDetail =
    ProductStockDetail(
        stock = stock.toDomain(),
        movements = movements.map { it.toDomain() },
    )

fun ProductStockDTO.toDomain(): ProductStock =
    ProductStock(
        productId = productID,
        tracked = tracked,
        onHand = onHand?.toInt(),
        threshold = threshold?.toInt(),
        effectiveThreshold = effectiveThreshold?.toInt(),
        outOfStock = outOfStock,
        low = low,
    )

fun StockMovementDTO.toDomain(): StockMovement =
    StockMovement(
        id = id,
        quantityDelta = quantityDelta.toInt(),
        quantityBefore = quantityBefore.toInt(),
        quantityAfter = quantityAfter.toInt(),
        reason = StockReason.fromWire(reason.value),
        actor = StockActor.fromWire(actorKind.value),
        actorLabel = actorLabel,
        orderNumber = orderNumber,
        note = note,
        createdAt = createdAt,
    )

fun LowStockRowDTO.toDomain(): LowStockItem =
    LowStockItem(
        productId = productID,
        name = name,
        sku = sku,
        onHand = onHand.toInt(),
        effectiveThreshold = effectiveThreshold?.toInt(),
        // The wire carries "out" | "low"; the domain carries the fact, so the UI cannot mis-spell it.
        outOfStock = severity == Severity.Out,
    )

/**
 * Domain reason → the generated request enum.
 *
 * ⚠ Only the four an operator may choose are representable in a request. `order_paid`,
 * `pick_shortfall` and the two tracking reasons are facts the PLATFORM records; a human choosing one
 * would be writing a false account of why stock moved into the table that exists to be true. The
 * generated `OperatorStockReason` has exactly four members, so this is exhaustive by construction —
 * `else` throws rather than silently sending a wrong reason.
 */
fun StockReason.toRequestEnum(): OperatorStockReason = when (this) {
    StockReason.RECEIVED -> OperatorStockReason.Received
    StockReason.CORRECTION -> OperatorStockReason.Correction
    StockReason.DAMAGE -> OperatorStockReason.Damage
    StockReason.EXPIRY -> OperatorStockReason.Expiry
    else -> error("$this is written by the platform and cannot be chosen by an operator")
}
