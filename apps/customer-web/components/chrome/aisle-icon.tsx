import {
  Apple,
  Baby,
  Beef,
  Cookie,
  Croissant,
  CupSoda,
  Fish,
  Milk,
  Package,
  PawPrint,
  ScrollText,
  Snowflake,
  Soup,
  SprayCan,
  Wheat,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

/**
 * The glyph beside an aisle.
 *
 * Aisles are data — back-office names them — so this cannot be a table keyed on the reference's
 * sample aisles. It matches on words in the name and falls back to a neutral box, which means a new
 * aisle always gets *a* glyph and never a blank gap in the row.
 *
 * Server-only on purpose: fifteen icons imported into a client component would ride the guest bundle.
 */
const RULES: ReadonlyArray<[RegExp, LucideIcon]> = [
  [/fruit|veg|produce|fresh/i, Apple],
  [/dairy|milk|egg|chilled|cheese/i, Milk],
  [/bak|bread/i, Croissant],
  [/seafood|fish/i, Fish],
  [/meat|poultry|butcher/i, Beef],
  [/pantry|grain|rice|pasta/i, Wheat],
  [/snack|confection|chocolate|biscuit/i, Cookie],
  [/drink|beverage|juice|water|coffee|tea/i, CupSoda],
  [/clean|household|laundry/i, SprayCan],
  [/paper|tissue/i, ScrollText],
  [/baby|kid/i, Baby],
  [/frozen|ice/i, Snowflake],
  [/meal|ready|deli|soup/i, Soup],
  [/pet/i, PawPrint],
]

export function aisleIcon(name: string): LucideIcon {
  return RULES.find(([re]) => re.test(name))?.[1] ?? Package
}
