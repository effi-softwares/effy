package com.effyshopping.customer.mobile.features.catalog.domain

/**
 * The sub-aisles of an aisle (087 FR-035) — the categories whose parent is [parentKey], that have
 * something to sell, in the order the platform served them.
 *
 * `parentKey` has been on every category since 013 and nothing on mobile read it. Since 084 an aisle's
 * results already INCLUDE its sub-aisles server-side, so "All" is simply the parent itself.
 */
fun subAislesOf(parentKey: String, categories: List<Category>): List<Category> =
    categories.filter { it.parentKey == parentKey && it.productCount > 0 }

/** The aisle a category belongs to: itself when it is top-level, else its parent. */
fun aisleOf(key: String, categories: List<Category>): String =
    categories.firstOrNull { it.key == key }?.parentKey ?: key
