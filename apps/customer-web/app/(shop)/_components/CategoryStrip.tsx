import Link from "next/link"

import type { StorefrontCategoryDTO } from "@effy/shared-types"

import { MediaFrame, SectionShell } from "@/components/storefront/kit"

/**
 * The category shortcut row: circular image tiles and a "Shop all products" action into `/search`.
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
                className="group flex w-[5.5rem] flex-col items-center gap-3 rounded-lg py-2 text-center sm:w-28"
              >
                {/* The whole tile is the target, past the 44px minimum. */}
                <MediaFrame
                  src={category.imageUrl}
                  widths={category.imageWidths}
                  alt=""
                  ratio="square"
                  rounded="rounded-full"
                  fallbackLabel={category.name.charAt(0).toUpperCase()}
                  sizes="112px"
                  className="w-[4.5rem] ring-ring transition-shadow group-hover:ring-2 sm:w-24"
                />
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
