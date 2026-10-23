import type { OptionDTO, OptionValueIds, StorefrontVariantDTO } from "@effy/shared-types"

/**
 * Choosing a size on the product page — pure, so the rules are tested without a browser. The
 * customer app's `VariantSelection.kt` follows the same rules.
 *
 * The shopper picks one value per option ("1 kg", then "Brown"); the selection is always one variant,
 * never a half-chosen state:
 *
 *  - picking a value keeps the other option's value when that combination is sold, else moves to the
 *  first variant carrying the picked value (an available one first);
 *  - a value is `available` when, with the other option as currently chosen, a variant with it can be
 *  bought; `sold_out` when it exists but cannot be bought; `unsold` when no such combination exists
 *  at all. Sold-out values stay visible — hiding them would hide that the size exists.
 */

export type ValueState = "available" | "sold_out" | "unsold"

const same = (a: OptionValueIds, b: OptionValueIds) => a[0] === b[0] && a[1] === b[1]

/** The variant a link asked for when it is on sale, else the platform's default. */
export function initialVariantId(variants: readonly StorefrontVariantDTO[], defaultVariantId: string, requested?: string | null): string {
  return requested && variants.some((v) => v.id === requested) ? requested : defaultVariantId
}

export function variantById(variants: readonly StorefrontVariantDTO[], id: string): StorefrontVariantDTO | undefined {
  return variants.find((v) => v.id === id)
}

/** The state of value `valueId` of the option at `slot` (0 or 1), given the current selection. */
export function valueState(
  variants: readonly StorefrontVariantDTO[],
  current: OptionValueIds,
  slot: 0 | 1,
  valueId: string,
): ValueState {
  const other: 0 | 1 = slot === 0 ? 1 : 0
  const matches = variants.filter((v) => v.optionValueIds[slot] === valueId && v.optionValueIds[other] === current[other])
  if (matches.length === 0) {
    // No variant with this value alongside the other choice: picking it would move the other choice.
    const anyWithValue = variants.filter((v) => v.optionValueIds[slot] === valueId)
    if (anyWithValue.length === 0) return "unsold"
    return anyWithValue.some((v) => v.available) ? "available" : "sold_out"
  }
  return matches.some((v) => v.available) ? "available" : "sold_out"
}

/** The variant selected after picking value `valueId` at `slot`. */
export function pickValue(
  variants: readonly StorefrontVariantDTO[],
  current: OptionValueIds,
  slot: 0 | 1,
  valueId: string,
): StorefrontVariantDTO | undefined {
  const wanted: OptionValueIds = slot === 0 ? [valueId, current[1]] : [current[0], valueId]
  const exact = variants.find((v) => same(v.optionValueIds, wanted))
  if (exact) return exact
  const withValue = variants.filter((v) => v.optionValueIds[slot] === valueId)
  return withValue.find((v) => v.available) ?? withValue[0]
}

/** The options as the selector draws them: each value with its state under the current selection. */
export function selectorRows(
  options: readonly OptionDTO[],
  variants: readonly StorefrontVariantDTO[],
  selected: StorefrontVariantDTO,
): { option: OptionDTO; slot: 0 | 1; values: { id: string; value: string; state: ValueState; selected: boolean }[] }[] {
  return [...options]
    .sort((a, b) => a.position - b.position)
    .map((option, i) => {
      const slot = (i === 0 ? 0 : 1) as 0 | 1
      return {
        option,
        slot,
        values: [...option.values]
          .sort((a, b) => a.position - b.position)
          .map((v) => ({
            id: v.id,
            value: v.value,
            state: valueState(variants, selected.optionValueIds, slot, v.id),
            selected: selected.optionValueIds[slot] === v.id,
          }))
          // A value no variant on sale carries is not offered at all (it would lead nowhere).
          .filter((v) => v.state !== "unsold"),
      }
    })
}
