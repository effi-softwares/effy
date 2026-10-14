package com.effyshopping.customer.mobile.features.cart.presentation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.features.cart.domain.CartSnapshot
import com.effyshopping.customer.mobile.features.cart.domain.GuestCartLine
import com.effyshopping.customer.mobile.features.catalog.domain.ProductCard

/**
 * The cart, as a product tile sees it (087 FR-027; Product card board) — how many of THIS product are
 * in the cart, and how to change that from the tile's "+" / stepper.
 *
 * ONE read of the cart for a whole screen of tiles, so two rails carrying the same product can never
 * disagree. Changes go through the same use-cases the product page and the cart use (optimistic, then
 * synchronised), so a tile is not a second way of editing the cart — it is the same way, closer.
 */
@Stable
class TileCart internal constructor(
    private val snapshot: CartSnapshot,
    private val container: AppContainer,
) {
    fun quantityOf(productId: String): Int = snapshot.lines.firstOrNull { it.productId == productId }?.quantity ?: 0

    fun change(product: ProductCard, quantity: Int) {
        val current = quantityOf(product.id)
        when {
            quantity <= 0 -> container.removeFromCart(product.id)
            current == 0 -> container.addToCart(
                GuestCartLine(
                    productId = product.id,
                    name = product.name,
                    imageUrl = product.imageUrl,
                    unitPriceAmount = product.priceAmount,
                    currency = product.currency,
                    quantity = quantity,
                    packageKey = product.packageKey,
                ),
            )
            else -> container.setCartQuantity(product.id, quantity)
        }
    }
}

/** The tile view of the cart for one screen. */
@Composable
fun rememberTileCart(container: AppContainer): TileCart {
    val snapshot by container.cart.state.collectAsState()
    return remember(snapshot) { TileCart(snapshot, container) }
}
