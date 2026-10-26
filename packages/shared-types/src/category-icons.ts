/**
 * The glyph a category shows on the storefront (101). Staff pick one of these keys per category; each key is
 * a Lucide icon name, rendered by customer-web (`categoryIcon`) and the customer app (`CategoryIcons.kt`, pinned
 * to category-icons.fixtures.json). The migration's `category_icon_check` lists the same keys
 * (category-icons.test.ts compares). A category without one shows `CATEGORY_ICON_FALLBACK`.
 */
export const CATEGORY_ICONS = [
  "apple",
  "baby",
  "bath",
  "bed",
  "beef",
  "beer",
  "bike",
  "cable",
  "candy",
  "car",
  "carrot",
  "citrus",
  "coffee",
  "cookie",
  "cooking-pot",
  "croissant",
  "cup-soda",
  "drill",
  "dumbbell",
  "egg",
  "fish",
  "flower-2",
  "footprints",
  "gamepad-2",
  "gift",
  "hammer",
  "headphones",
  "heart-pulse",
  "ice-cream-cone",
  "lamp",
  "laptop",
  "leaf",
  "milk",
  "notebook",
  "package",
  "paintbrush",
  "party-popper",
  "paw-print",
  "pencil",
  "pill",
  "sandwich",
  "scroll-text",
  "shirt",
  "shopping-basket",
  "smartphone",
  "snowflake",
  "sofa",
  "soup",
  "sparkles",
  "spray-can",
  "sprout",
  "tent",
  "toy-brick",
  "tv",
  "utensils",
  "washing-machine",
  "watch",
  "wheat",
  "wine",
  "wrench",
] as const

export type CategoryIcon = (typeof CATEGORY_ICONS)[number]

export const CATEGORY_ICON_FALLBACK: CategoryIcon = "package"

export function isCategoryIcon(value: unknown): value is CategoryIcon {
  return typeof value === "string" && (CATEGORY_ICONS as readonly string[]).includes(value)
}
