package com.effyshopping.shop.mobile.features.shop.domain

/**
 * The shop domain use cases (014). Over the [ShopRepository] boundary — SessionManager and the
 * ManagerArea ViewModel depend on THESE, not the repository directly.
 */

/** Read the operator's platform RECORD (identity + role + status + assigned shop). Throws on refusal. */
class GetOperator(private val shopRepository: ShopRepository) {
    suspend operator fun invoke(): Operator = shopRepository.me()
}

/**
 * THE authorization decision (FR-023): the backend manager gate. GRANTED only when role AND status AND
 * active-shop scope all hold; DENIED (uniform) otherwise; fail-closed on any error (the repo enforces).
 */
class CheckManagerAccess(private val shopRepository: ShopRepository) {
    suspend operator fun invoke(): ManagerAccess = shopRepository.managerAccess()
}
