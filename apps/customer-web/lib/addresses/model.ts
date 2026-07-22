import type { AddressDTO } from "@effy/shared-types"

/**
 * Address-book domain model (022).
 *
 * The wire DTO (`AddressDTO`) is already close to what the UI needs — this module adds the ONE piece
 * of presentation logic the spec calls for: the **label chips**. The column is a free-text `label`
 * (019); the form offers Home / Work / Other chips over it (FR-006a), and on read a stored label
 * re-selects the matching chip (Home/Work) or falls to Other with the value in a free-text field.
 * See data-model.md §"The label chips → free-text mapping".
 */

/** A saved delivery address as the address book renders it. Structurally the DTO — kept as its own
 *  name so the surface never depends on the wire shape directly. */
export type Address = AddressDTO

/** The label presets, in display order. "Other" reveals a free-text field. */
export const LABEL_CHIPS = ["Home", "Work", "Other"] as const
export type LabelChip = (typeof LABEL_CHIPS)[number]

export function toAddress(dto: AddressDTO): Address {
  return dto
}

/**
 * The chip a stored label maps to on read: exactly `"Home"`/`"Work"` select that chip; any other
 * non-empty label selects **Other**; an empty/absent label selects no chip.
 */
export function chipForLabel(label: string | null | undefined): LabelChip | null {
  if (label === "Home" || label === "Work") return label
  if (label && label.trim().length > 0) return "Other"
  return null
}

/** The free text to prefill the Other field from a stored label (empty for Home/Work/none). */
export function customLabelForLabel(label: string | null | undefined): string {
  return chipForLabel(label) === "Other" ? (label ?? "") : ""
}

/**
 * Resolve the chip selection + Other free-text back to the value written to the wire's `label`:
 * Home/Work → the literal string; Other → the trimmed free text (or null if blank); no chip → null.
 */
export function labelForChip(chip: LabelChip | null, customLabel: string): string | null {
  if (chip === "Home" || chip === "Work") return chip
  if (chip === "Other") {
    const trimmed = customLabel.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  return null
}

/** The recognisable address lines for a row, joined for display. */
export function addressLines(a: Address): string {
  return [a.line1, a.line2, [a.city, a.region, a.postalCode].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ")
}
