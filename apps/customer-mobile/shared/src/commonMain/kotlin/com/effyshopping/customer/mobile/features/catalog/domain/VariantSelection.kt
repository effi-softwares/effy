package com.effyshopping.customer.mobile.features.catalog.domain

/**
 * Choosing a size on the product page (098) — pure, host-tested. The SAME rules as the storefront's
 * `lib/variant-selection.ts`:
 *
 *  - the selection is always ONE variant, never a half-chosen state;
 *  - picking a value keeps the other option's value when that combination is sold, else moves to the
 *    first variant carrying the picked value (an available one first);
 *  - a value is [ValueState.Available] when, with the other option as chosen, a variant with it can be
 *    bought; [ValueState.SoldOut] when it exists but cannot; values no variant carries are not offered.
 *    Sold-out values stay visible (FR-015) — hiding one would hide that the size exists.
 */
enum class ValueState { Available, SoldOut, Unsold }

/** One option as the selector draws it. */
data class SelectorRow(val option: VariantOption, val slot: Int, val values: List<SelectorValue>)

data class SelectorValue(val id: String, val value: String, val state: ValueState, val selected: Boolean)

object VariantSelection {

    /** The variant a link asked for when it is on sale, else the platform's default. */
    fun initialVariantId(variants: List<Variant>, defaultVariantId: String, requested: String? = null): String =
        if (requested != null && variants.any { it.id == requested }) requested else defaultVariantId

    private fun Variant.valueAt(slot: Int): String? = if (slot == 0) optionValueIds.first else optionValueIds.second

    fun valueState(variants: List<Variant>, current: Pair<String?, String?>, slot: Int, valueId: String): ValueState {
        val other = if (slot == 0) 1 else 0
        val otherValue = if (other == 0) current.first else current.second
        val matches = variants.filter { it.valueAt(slot) == valueId && it.valueAt(other) == otherValue }
        if (matches.isEmpty()) {
            // Not sold alongside the other choice: picking it would move the other choice too.
            val withValue = variants.filter { it.valueAt(slot) == valueId }
            if (withValue.isEmpty()) return ValueState.Unsold
            return if (withValue.any { it.available }) ValueState.Available else ValueState.SoldOut
        }
        return if (matches.any { it.available }) ValueState.Available else ValueState.SoldOut
    }

    /** The variant selected after picking value [valueId] at [slot]. */
    fun pickValue(variants: List<Variant>, current: Pair<String?, String?>, slot: Int, valueId: String): Variant? {
        val wanted = if (slot == 0) valueId to current.second else current.first to valueId
        variants.firstOrNull { it.optionValueIds == wanted }?.let { return it }
        val withValue = variants.filter { it.valueAt(slot) == valueId }
        return withValue.firstOrNull { it.available } ?: withValue.firstOrNull()
    }

    /** The options in order, each value with its state under [selected]. */
    fun rows(options: List<VariantOption>, variants: List<Variant>, selected: Variant): List<SelectorRow> =
        options.sortedBy { it.position }.mapIndexed { i, option ->
            val slot = if (i == 0) 0 else 1
            SelectorRow(
                option = option,
                slot = slot,
                values = option.values.sortedBy { it.position }
                    .map { v ->
                        SelectorValue(
                            id = v.id,
                            value = v.value,
                            state = valueState(variants, selected.optionValueIds, slot, v.id),
                            selected = selected.valueAt(slot) == v.id,
                        )
                    }
                    .filter { it.state != ValueState.Unsold },
            )
        }
}
