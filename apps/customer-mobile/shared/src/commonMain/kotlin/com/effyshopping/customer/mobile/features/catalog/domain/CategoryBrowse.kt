package com.effyshopping.customer.mobile.features.catalog.domain

/**
 * One level of the category tree as the app browses it (101, FR-033): the category being looked into (null at
 * the top: the departments) and its sub-categories with something to sell, in the platform's order. The tree is
 * up to five levels deep; a leaf is never a level - it opens its products.
 */
data class BrowseLevel(val parent: Category?, val children: List<Category>)

fun browseLevel(categories: List<Category>, parentKey: String?): BrowseLevel = BrowseLevel(
    parent = parentKey?.let { key -> categories.firstOrNull { it.key == key } },
    children = categories.filter { it.parentKey == parentKey && it.productCount > 0 },
)

/** Where tapping a category goes: deeper when it has sub-categories with products, else its products. */
sealed interface BrowseTarget {
    data class Level(val category: Category) : BrowseTarget
    data class Products(val category: Category) : BrowseTarget
}

fun browseTarget(category: Category, categories: List<Category>): BrowseTarget =
    if (!category.isLeaf && categories.any { it.parentKey == category.key && it.productCount > 0 }) {
        BrowseTarget.Level(category)
    } else {
        BrowseTarget.Products(category)
    }
