package com.effyshopping.customer.mobile.features.catalog.data

import com.effyshopping.customer.mobile.commerce.contract.UnitPriceDTO
import com.effyshopping.customer.mobile.features.catalog.domain.UnitBasis
import com.effyshopping.customer.mobile.features.catalog.domain.UnitPrice

/**
 * 098 — the comparison price, wire → domain. Every feature that shows one (catalogue, cart, saved)
 * maps it here, once. A basis this build does not know leaves the comparison out.
 */
fun UnitPriceDTO.toDomain(): UnitPrice? = UnitBasis.fromWire(basis.value)?.let { UnitPrice(amount, it) }
