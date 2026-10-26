package com.effyshopping.customer.mobile.features.catalog.presentation

import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.lucide_apple
import com.effyshopping.customer.mobile.resources.lucide_baby
import com.effyshopping.customer.mobile.resources.lucide_bath
import com.effyshopping.customer.mobile.resources.lucide_bed
import com.effyshopping.customer.mobile.resources.lucide_beef
import com.effyshopping.customer.mobile.resources.lucide_beer
import com.effyshopping.customer.mobile.resources.lucide_bike
import com.effyshopping.customer.mobile.resources.lucide_cable
import com.effyshopping.customer.mobile.resources.lucide_candy
import com.effyshopping.customer.mobile.resources.lucide_car
import com.effyshopping.customer.mobile.resources.lucide_carrot
import com.effyshopping.customer.mobile.resources.lucide_citrus
import com.effyshopping.customer.mobile.resources.lucide_coffee
import com.effyshopping.customer.mobile.resources.lucide_cookie
import com.effyshopping.customer.mobile.resources.lucide_cooking_pot
import com.effyshopping.customer.mobile.resources.lucide_croissant
import com.effyshopping.customer.mobile.resources.lucide_cup_soda
import com.effyshopping.customer.mobile.resources.lucide_drill
import com.effyshopping.customer.mobile.resources.lucide_dumbbell
import com.effyshopping.customer.mobile.resources.lucide_egg
import com.effyshopping.customer.mobile.resources.lucide_fish
import com.effyshopping.customer.mobile.resources.lucide_flower_2
import com.effyshopping.customer.mobile.resources.lucide_footprints
import com.effyshopping.customer.mobile.resources.lucide_gamepad_2
import com.effyshopping.customer.mobile.resources.lucide_gift
import com.effyshopping.customer.mobile.resources.lucide_hammer
import com.effyshopping.customer.mobile.resources.lucide_headphones
import com.effyshopping.customer.mobile.resources.lucide_heart_pulse
import com.effyshopping.customer.mobile.resources.lucide_ice_cream_cone
import com.effyshopping.customer.mobile.resources.lucide_lamp
import com.effyshopping.customer.mobile.resources.lucide_laptop
import com.effyshopping.customer.mobile.resources.lucide_leaf
import com.effyshopping.customer.mobile.resources.lucide_milk
import com.effyshopping.customer.mobile.resources.lucide_notebook
import com.effyshopping.customer.mobile.resources.lucide_package
import com.effyshopping.customer.mobile.resources.lucide_paintbrush
import com.effyshopping.customer.mobile.resources.lucide_party_popper
import com.effyshopping.customer.mobile.resources.lucide_paw_print
import com.effyshopping.customer.mobile.resources.lucide_pencil
import com.effyshopping.customer.mobile.resources.lucide_pill
import com.effyshopping.customer.mobile.resources.lucide_sandwich
import com.effyshopping.customer.mobile.resources.lucide_scroll_text
import com.effyshopping.customer.mobile.resources.lucide_shirt
import com.effyshopping.customer.mobile.resources.lucide_shopping_basket
import com.effyshopping.customer.mobile.resources.lucide_smartphone
import com.effyshopping.customer.mobile.resources.lucide_snowflake
import com.effyshopping.customer.mobile.resources.lucide_sofa
import com.effyshopping.customer.mobile.resources.lucide_soup
import com.effyshopping.customer.mobile.resources.lucide_sparkles
import com.effyshopping.customer.mobile.resources.lucide_spray_can
import com.effyshopping.customer.mobile.resources.lucide_sprout
import com.effyshopping.customer.mobile.resources.lucide_tent
import com.effyshopping.customer.mobile.resources.lucide_toy_brick
import com.effyshopping.customer.mobile.resources.lucide_tv
import com.effyshopping.customer.mobile.resources.lucide_utensils
import com.effyshopping.customer.mobile.resources.lucide_washing_machine
import com.effyshopping.customer.mobile.resources.lucide_watch
import com.effyshopping.customer.mobile.resources.lucide_wheat
import com.effyshopping.customer.mobile.resources.lucide_wine
import com.effyshopping.customer.mobile.resources.lucide_wrench
import org.jetbrains.compose.resources.DrawableResource

/**
 * A category's glyph (101): the icon key staff chose in back-office, one of `CATEGORY_ICONS` in
 * `packages/shared-types/src/category-icons.ts`, as its Lucide drawable — the same glyph the website shows.
 * `CategoryIconsTest` pins this map to `category-icons.fixtures.json`. A key this build does not know (an
 * icon added later) and a category with none show the neutral box.
 */
val CATEGORY_ICONS: Map<String, DrawableResource> = mapOf(
    "apple" to Res.drawable.lucide_apple,
    "baby" to Res.drawable.lucide_baby,
    "bath" to Res.drawable.lucide_bath,
    "bed" to Res.drawable.lucide_bed,
    "beef" to Res.drawable.lucide_beef,
    "beer" to Res.drawable.lucide_beer,
    "bike" to Res.drawable.lucide_bike,
    "cable" to Res.drawable.lucide_cable,
    "candy" to Res.drawable.lucide_candy,
    "car" to Res.drawable.lucide_car,
    "carrot" to Res.drawable.lucide_carrot,
    "citrus" to Res.drawable.lucide_citrus,
    "coffee" to Res.drawable.lucide_coffee,
    "cookie" to Res.drawable.lucide_cookie,
    "cooking-pot" to Res.drawable.lucide_cooking_pot,
    "croissant" to Res.drawable.lucide_croissant,
    "cup-soda" to Res.drawable.lucide_cup_soda,
    "drill" to Res.drawable.lucide_drill,
    "dumbbell" to Res.drawable.lucide_dumbbell,
    "egg" to Res.drawable.lucide_egg,
    "fish" to Res.drawable.lucide_fish,
    "flower-2" to Res.drawable.lucide_flower_2,
    "footprints" to Res.drawable.lucide_footprints,
    "gamepad-2" to Res.drawable.lucide_gamepad_2,
    "gift" to Res.drawable.lucide_gift,
    "hammer" to Res.drawable.lucide_hammer,
    "headphones" to Res.drawable.lucide_headphones,
    "heart-pulse" to Res.drawable.lucide_heart_pulse,
    "ice-cream-cone" to Res.drawable.lucide_ice_cream_cone,
    "lamp" to Res.drawable.lucide_lamp,
    "laptop" to Res.drawable.lucide_laptop,
    "leaf" to Res.drawable.lucide_leaf,
    "milk" to Res.drawable.lucide_milk,
    "notebook" to Res.drawable.lucide_notebook,
    "package" to Res.drawable.lucide_package,
    "paintbrush" to Res.drawable.lucide_paintbrush,
    "party-popper" to Res.drawable.lucide_party_popper,
    "paw-print" to Res.drawable.lucide_paw_print,
    "pencil" to Res.drawable.lucide_pencil,
    "pill" to Res.drawable.lucide_pill,
    "sandwich" to Res.drawable.lucide_sandwich,
    "scroll-text" to Res.drawable.lucide_scroll_text,
    "shirt" to Res.drawable.lucide_shirt,
    "shopping-basket" to Res.drawable.lucide_shopping_basket,
    "smartphone" to Res.drawable.lucide_smartphone,
    "snowflake" to Res.drawable.lucide_snowflake,
    "sofa" to Res.drawable.lucide_sofa,
    "soup" to Res.drawable.lucide_soup,
    "sparkles" to Res.drawable.lucide_sparkles,
    "spray-can" to Res.drawable.lucide_spray_can,
    "sprout" to Res.drawable.lucide_sprout,
    "tent" to Res.drawable.lucide_tent,
    "toy-brick" to Res.drawable.lucide_toy_brick,
    "tv" to Res.drawable.lucide_tv,
    "utensils" to Res.drawable.lucide_utensils,
    "washing-machine" to Res.drawable.lucide_washing_machine,
    "watch" to Res.drawable.lucide_watch,
    "wheat" to Res.drawable.lucide_wheat,
    "wine" to Res.drawable.lucide_wine,
    "wrench" to Res.drawable.lucide_wrench,
)

/** The neutral glyph for a category with no icon. */
val CATEGORY_FALLBACK_ICON: DrawableResource get() = Res.drawable.lucide_package

/** The glyph for a category, by its icon key. */
fun categoryIcon(iconKey: String?): DrawableResource = iconKey?.let { CATEGORY_ICONS[it] } ?: CATEGORY_FALLBACK_ICON

/**
 * An offer banner's glyph, from the words it is written in (fruit → apple, dairy → milk), else a gift. A
 * promotion has no icon key of its own; first match wins.
 */
private val OFFER_RULES: List<Pair<Regex, DrawableResource>> = listOf(
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

fun offerIcon(words: String): DrawableResource =
    OFFER_RULES.firstOrNull { (re, _) -> re.containsMatchIn(words) }?.second ?: Res.drawable.lucide_gift
