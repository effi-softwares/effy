import type { SavedVerdict } from "@effy/shared-types"

/**
 * How each purchasability outcome is said to a shopper, and what they may do about it. One distinct
 * sentence per outcome, because each implies a different next action (wait · change address · give up ·
 * tell us where you live · buy now). Kept out of the component so it can be tested.
 */
export function verdictNote(verdict: SavedVerdict): string {
  switch (verdict) {
    case "purchasable":
      return "Available now"
    case "temporarily_unavailable":
      return "Out of stock right now"
    case "no_longer_sold":
      return "No longer sold"
  }
}

/** Only a purchasable item may be added to a cart — everything else needs the shopper to act first. */
export function isPurchasable(verdict: SavedVerdict): boolean {
  return verdict === "purchasable"
}
