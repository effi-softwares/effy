import type { SavedVerdict } from "@effy/shared-types"

/**
 * How each purchasability outcome is said to a shopper, and what they may do about it (033).
 *
 * ⚠ EXTRACTED SO IT CAN BE TESTED. Inline in the list component this mapping was unreachable by
 * Vitest, which cannot render async Server Components — and this is precisely the logic that must not
 * drift, because the whole feature rests on the five outcomes staying distinguishable.
 *
 * ⚠ ONE SENTENCE PER OUTCOME, and they are deliberately DIFFERENT sentences. Each implies a different
 * next action — wait · change address · give up · tell us where you live · buy now — and a shopper who
 * cannot tell "out of stock" from "we don't deliver that to you" cannot act on either. Collapsing any
 * two of these reintroduces the defect this feature exists to remove (FR-036).
 */
export function verdictNote(verdict: SavedVerdict): string {
  switch (verdict) {
    case "purchasable":
      return "Available now"
    case "temporarily_unavailable":
      return "Out of stock right now"
    case "not_delivered_to_your_area":
      return "Not delivered to your area"
    case "no_longer_sold":
      return "No longer sold"
    case "not_yet_determined":
      return "Tell us where you live to check availability"
  }
}

/** Only a purchasable item may be added to a cart — everything else needs the shopper to act first. */
export function isPurchasable(verdict: SavedVerdict): boolean {
  return verdict === "purchasable"
}
