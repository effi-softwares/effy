import type { LucideIcon } from "lucide-react"

import { isCategoryIcon } from "@effy/shared-types"
import { categoryIconComponent } from "@effy/web-kit/category-icon"

/**
 * The glyph beside a category: the icon staff chose for it in back-office (101), else a neutral box, so
 * a new category always gets *a* glyph and never a blank gap in the row.
 *
 * Server-only on purpose: the icon map imported into a client component would ride the guest bundle.
 */
export function categoryIcon(key: string | null | undefined): LucideIcon {
  // A key this build does not know (a newer icon) shows the neutral box.
  return categoryIconComponent(isCategoryIcon(key) ? key : null)
}
