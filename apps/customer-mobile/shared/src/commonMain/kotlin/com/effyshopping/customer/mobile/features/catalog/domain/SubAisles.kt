package com.effyshopping.customer.mobile.features.catalog.domain

/**
 * The sub-aisles of an aisle: categories whose parent is [parentKey] with something to sell, in the
 * platform's order. An aisle's results include its sub-aisles, so "All" is the parent itself.
 */
fun subAislesOf(parentKey: String, categories: List<Category>): List<Category> =
    categories.filter { it.parentKey == parentKey && it.productCount > 0 }

/** The aisle a category belongs to: itself when it is top-level, else its parent. */
fun aisleOf(key: String, categories: List<Category>): String =
    categories.firstOrNull { it.key == key }?.parentKey ?: key
