import Link from "next/link"

import type { StorefrontCategoryDTO } from "@effy/shared-types"

import { categoryIcon } from "@/components/chrome/category-icon"
import { MediaFrame, SectionShell } from "@/components/storefront/kit"
import { Bone } from "@/components/ui/skeletons"

/**
 * The category shortcut row: circular tiles and a "Shop all products" action into `/search`. A tile is
 * the picture staff attached to the category, else the icon they chose, else the default glyph - never a
 * product's photograph (the server sends only the category's own picture).
 * Stocked categories only (filtering is exact-match, and `productCount` does not roll up from children,
 * so in practice leaves only). The scrollbar is hidden but scrolling is not; the fixed 80/96px tiles
 * leave a partial tile at the edge as the affordance, so keep them fixed.
 */

/** Twelve: a full department set at desktop width without becoming a second navigation (asserted by the test). */
export const CATEGORY_SHORTCUT_CAP = 12

export function CategoryStrip({ categories }: { categories: StorefrontCategoryDTO[] }) {
  const stocked = categories.filter((c) => c.productCount > 0).slice(0, CATEGORY_SHORTCUT_CAP)

  return (
    <SectionShell title="Shop by aisle" href="/search" linkLabel="All products">
      {stocked.length > 0 ? (
        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
          {stocked.map((category) => (
            <li key={category.key} className="shrink-0">
              <Link
                href={`/search?category=${encodeURIComponent(category.key)}`}
                className="group flex w-22 flex-col items-center gap-3 rounded-lg py-2 text-center sm:w-28"
              >
                {/* The whole tile is the target, past the 44px minimum. */}
                <CategoryFace category={category} />
                {/* The name is the caption + a hidden count, not an aria-label: a label that drops the
                    fallback letter on screen fails WCAG 2.5.3 (label in name). */}
                <span className="text-xs leading-tight font-medium sm:text-sm">
                  {category.name}
                  <span className="sr-only">
                    {" "}
                    ({category.productCount} {category.productCount === 1 ? "item" : "items"})
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </SectionShell>
  )
}

/** Picture → chosen icon → default glyph (`categoryIcon` resolves the last two). */
function CategoryFace({ category }: { category: StorefrontCategoryDTO }) {
  if (category.imageUrl) {
    return (
      <MediaFrame
        src={category.imageUrl}
        widths={category.imageWidths}
        alt=""
        ratio="square"
        rounded="rounded-full"
        sizes="112px"
        className="w-18 transition-shadow sm:w-24"
      />
    )
  }
  const Icon = categoryIcon(category.icon)
  return (
    <span
      aria-hidden="true"
      data-testid="category-icon-tile"
      className="flex aspect-square w-18 items-center justify-center rounded-full bg-muted text-foreground sm:w-24"
    >
      <Icon className="size-8 sm:size-10" strokeWidth={1.5} />
    </span>
  )
}

/** The aisle strip before its aisles arrive: the same heading and row of round tiles. */
export function CategoryStripSkeleton() {
  return (
    <SectionShell title="Shop by aisle" href="/search" linkLabel="All products">
      <ul className="-mx-4 flex gap-2 overflow-hidden px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i} className="flex w-22 shrink-0 flex-col items-center gap-3 py-2 sm:w-28">
            <Bone className="aspect-square w-18 rounded-full sm:w-24" />
            <Bone kind="small" className="w-14" />
          </li>
        ))}
      </ul>
    </SectionShell>
  )
}
