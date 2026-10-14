package com.effyshopping.customer.mobile.features.catalog.presentation

import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.lucide_apple
import com.effyshopping.customer.mobile.resources.lucide_baby
import com.effyshopping.customer.mobile.resources.lucide_beef
import com.effyshopping.customer.mobile.resources.lucide_cookie
import com.effyshopping.customer.mobile.resources.lucide_croissant
import com.effyshopping.customer.mobile.resources.lucide_cup_soda
import com.effyshopping.customer.mobile.resources.lucide_fish
import com.effyshopping.customer.mobile.resources.lucide_milk
import com.effyshopping.customer.mobile.resources.lucide_package
import com.effyshopping.customer.mobile.resources.lucide_paw_print
import com.effyshopping.customer.mobile.resources.lucide_scroll_text
import com.effyshopping.customer.mobile.resources.lucide_snowflake
import com.effyshopping.customer.mobile.resources.lucide_soup
import com.effyshopping.customer.mobile.resources.lucide_spray_can
import com.effyshopping.customer.mobile.resources.lucide_wheat
import org.jetbrains.compose.resources.DrawableResource

/**
 * An aisle's glyph (087 T057) — THE SAME RULES as the website's `aisleIcon`
 * (`apps/customer-web/components/chrome/aisle-icon.tsx`), in the same order, over the same Lucide set,
 * so an aisle looks the same on both customer surfaces.
 *
 * ⚠ RULES, NOT A KEY TABLE. The table this replaced knew twelve keys from the 2026-07 taxonomy; 084
 * re-seeded the catalogue with keys like `dairy_eggs` and `fruit_veg`, and every one of them fell
 * through to the fallback glyph. A word rule ("milk", "fruit", "clean") survives a re-seed; a key
 * table does not. First matching rule wins; nothing matching is the neutral package glyph.
 */
private val RULES: List<Pair<Regex, DrawableResource>> = listOf(
    Regex("fruit|veg|produce|fresh", RegexOption.IGNORE_CASE) to Res.drawable.lucide_apple,
    Regex("dairy|milk|egg|chilled|cheese", RegexOption.IGNORE_CASE) to Res.drawable.lucide_milk,
    Regex("bak|bread", RegexOption.IGNORE_CASE) to Res.drawable.lucide_croissant,
    Regex("seafood|fish", RegexOption.IGNORE_CASE) to Res.drawable.lucide_fish,
    Regex("meat|poultry|butcher", RegexOption.IGNORE_CASE) to Res.drawable.lucide_beef,
    Regex("pantry|grain|rice|pasta", RegexOption.IGNORE_CASE) to Res.drawable.lucide_wheat,
    Regex("snack|confection|chocolate|biscuit", RegexOption.IGNORE_CASE) to Res.drawable.lucide_cookie,
    Regex("drink|beverage|juice|water|coffee|tea", RegexOption.IGNORE_CASE) to Res.drawable.lucide_cup_soda,
    Regex("clean|household|laundry", RegexOption.IGNORE_CASE) to Res.drawable.lucide_spray_can,
    Regex("paper|tissue", RegexOption.IGNORE_CASE) to Res.drawable.lucide_scroll_text,
    Regex("baby|kid", RegexOption.IGNORE_CASE) to Res.drawable.lucide_baby,
    Regex("frozen|ice", RegexOption.IGNORE_CASE) to Res.drawable.lucide_snowflake,
    Regex("meal|ready|deli|soup", RegexOption.IGNORE_CASE) to Res.drawable.lucide_soup,
    Regex("pet", RegexOption.IGNORE_CASE) to Res.drawable.lucide_paw_print,
)

/** The neutral glyph for an aisle no rule describes. */
val CATEGORY_FALLBACK_ICON: DrawableResource get() = Res.drawable.lucide_package

/** The glyph for an aisle, by its key or name. */
fun categoryIcon(key: String): DrawableResource =
    RULES.firstOrNull { (re, _) -> re.containsMatchIn(key) }?.second ?: CATEGORY_FALLBACK_ICON
