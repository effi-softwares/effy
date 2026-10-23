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
 * The cart as a product tile sees it: how many of this product are in it, changed from the tile's "+" /
 * stepper. One read for a whole screen of tiles, so two rails never disagree; changes go through the same
 * use cases as the product page and the cart.
 */
@Stable
class TileCart internal constructor(
    private val snapshot: CartSnapshot,
    private val container: AppContainer,
) {
    /** How many of the tile's size ([ProductCard.variantId]) are in the cart. */
    fun quantityOf(variantId: String): Int = snapshot.lines.firstOrNull { it.variantId == variantId }?.quantity ?: 0

    fun change(product: ProductCard, quantity: Int) {
        val current = quantityOf(product.variantId)
        when {
            quantity <= 0 -> container.removeFromCart(product.variantId)
            current == 0 -> container.addToCart(
                GuestCartLine(
                    variantId = product.variantId,
                    productId = product.id,
                    unitPrice = product.unitPrice,
                    name = product.name,
                    imageUrl = product.imageUrl,
                    unitPriceAmount = product.priceAmount,
                    currency = product.currency,
                    quantity = quantity,
                    packageKey = product.packageKey,
                ),
            )
            else -> container.setCartQuantity(product.variantId, quantity)
        }
    }
}

/** The tile view of the cart for one screen. */
@Composable
fun rememberTileCart(container: AppContainer): TileCart {
    val snapshot by container.cart.state.collectAsState()
    return remember(snapshot) { TileCart(snapshot, container) }
}
