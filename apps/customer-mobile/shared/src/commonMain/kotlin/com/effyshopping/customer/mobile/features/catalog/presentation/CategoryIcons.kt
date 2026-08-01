package com.effyshopping.customer.mobile.features.catalog.presentation

import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.ic_cat_bakery
import com.effyshopping.customer.mobile.resources.ic_cat_beverages
import com.effyshopping.customer.mobile.resources.ic_cat_chilled
import com.effyshopping.customer.mobile.resources.ic_cat_cleaning
import com.effyshopping.customer.mobile.resources.ic_cat_fallback
import com.effyshopping.customer.mobile.resources.ic_cat_food
import com.effyshopping.customer.mobile.resources.ic_cat_frozen
import com.effyshopping.customer.mobile.resources.ic_cat_grocery
import com.effyshopping.customer.mobile.resources.ic_cat_household
import com.effyshopping.customer.mobile.resources.ic_cat_meals
import com.effyshopping.customer.mobile.resources.ic_cat_pantry
import com.effyshopping.customer.mobile.resources.ic_cat_paper_goods
import com.effyshopping.customer.mobile.resources.ic_cat_snacks
import org.jetbrains.compose.resources.DrawableResource

/**
 * Category key → shortcut icon (028 US3, research R5).
 *
 * ── ⚠ THE FALLBACK IS THE POINT, NOT AN AFTERTHOUGHT ────────────────────────────────────────────
 *
 * Categories are **operator data**. Someone can create "Pet supplies" in the back-office this
 * afternoon, and no app release will have shipped an icon for it. That is not an error case to be
 * defended against — it is the normal life of a catalogue, and it MUST render as a designed state
 * rather than a blank tile or a broken frame (FR-026).
 *
 * So this function is total: every key resolves, and an unknown one gets a deliberately generic tag
 * glyph. Generic is doing work here — a *wrong* icon (a bread loaf on "Pet supplies") is worse than a
 * neutral one, because it actively misleads.
 *
 * ── Why the map lives in the app, not the database ──────────────────────────────────────────────
 *
 * An `icon_key` column on `public.category`, chosen by the operator from a fixed vocabulary, is
 * strictly better and is the natural follow-up. It needs a migration, an admin route, a back-office
 * control and a hot-path read change — to solve a problem that does not exist yet at Effy's category
 * count. Recorded in research R5 rather than half-built here.
 *
 * Pure by design, so the fallback path is unit-testable without a device — which matters, because it
 * is the branch a device will almost never show you.
 */
fun categoryIcon(key: String): DrawableResource = when (key.lowercase()) {
    // Top level.
    "food" -> Res.drawable.ic_cat_food
    "grocery" -> Res.drawable.ic_cat_grocery
    "household" -> Res.drawable.ic_cat_household

    // Children — mapped too, because a child can be promoted to top level without an app release.
    "meals" -> Res.drawable.ic_cat_meals
    "bakery" -> Res.drawable.ic_cat_bakery
    "snacks" -> Res.drawable.ic_cat_snacks
    "pantry" -> Res.drawable.ic_cat_pantry
    "chilled" -> Res.drawable.ic_cat_chilled
    "frozen" -> Res.drawable.ic_cat_frozen
    "beverages" -> Res.drawable.ic_cat_beverages
    "cleaning" -> Res.drawable.ic_cat_cleaning
    "paper_goods" -> Res.drawable.ic_cat_paper_goods

    else -> Res.drawable.ic_cat_fallback
}

/** Every key [categoryIcon] answers with real artwork. Exposed so the test cannot drift from the map. */
val MAPPED_CATEGORY_KEYS: List<String> = listOf(
    "food", "grocery", "household",
    "meals", "bakery", "snacks", "pantry", "chilled", "frozen", "beverages",
    "cleaning", "paper_goods",
)
