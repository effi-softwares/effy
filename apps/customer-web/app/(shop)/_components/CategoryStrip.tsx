import Link from "next/link"

import type { StorefrontCategoryDTO } from "@effy/shared-types"

import { MediaFrame, SectionShell } from "@/components/storefront/kit"

/**
 * The category shortcut row (039 US2, FR-013/FR-014) — the reference's "Popular Categories" band.
 *
 * A horizontally-scrolling row of circular image tiles with the category name beneath, and a "View all
 * categories" action into `/browse`. Deliberately distinct from the two category presentations this app
 * already has (research R7): `CategoryChips` is a text-only filter row, and `CategoryTile` is the large
 * rectangular tile `/browse` uses. Neither is a circular shortcut strip, so this is a new composition
 * rather than a fork of either — and `CategoryTile` is left untouched for `/browse`.
 *
 * ⚠ ONLY STOCKED CATEGORIES. Filtering on `productCount > 0` is not tidiness — category filtering is
 * exact-match everywhere on this platform, so a shortcut to an empty category opens a listing with
 * nothing in it. That is a worse outcome than the shortcut simply not being there.
 *
 * ⚠ AND THAT SILENTLY EXCLUDES EVERY TOP-LEVEL CATEGORY, which is correct but worth knowing. The
 * platform's `productCount` does **not roll up from child categories** (028's recorded, still-open
 * defect), so `food`, `grocery` and `household` all report 0 while their leaves hold the products. The
 * strip therefore shows leaf categories only. A recursive-CTE rollup is 028's carry-forward; when it
 * lands, this component needs no change — it will simply start seeing parents as stocked.
 */

/**
 * ⚠ A named constant, not a literal at the call site — the cap is asserted by
 * `CategoryStrip.test.tsx`, and a magic number in two places drifts.
 *
 * Twelve: enough for a full grocery department set at desktop width, few enough that the row does not
 * become a second navigation competing with the header. The live seed has 9 stocked categories, so the
 * cap is **not exercised by real data** — which is exactly why the test drives it synthetically.
 */
export const CATEGORY_SHORTCUT_CAP = 12

export function CategoryStrip({ categories }: { categories: StorefrontCategoryDTO[] }) {
  const stocked = categories.filter((c) => c.productCount > 0).slice(0, CATEGORY_SHORTCUT_CAP)

  return (
    <SectionShell title="Shop by category" href="/browse" linkLabel="View all categories">
      {stocked.length > 0 ? (
        <ul className="-mx-4 flex gap-6 overflow-x-auto px-4 pb-2 sm:mx-0 sm:gap-8 sm:px-0">
          {stocked.map((category) => (
            <li key={category.key} className="shrink-0">
              <Link
                href={`/search?category=${encodeURIComponent(category.key)}`}
                className="group flex w-24 flex-col items-center gap-3 rounded-xl py-2 text-center hover:bg-accent sm:w-28"
                aria-label={`${category.name}, ${category.productCount} ${
                  category.productCount === 1 ? "item" : "items"
                }`}
              >
                {/* ⚠ The whole tile is the target, not the label — a 96px circle plus its caption is
                    comfortably past the 44×44 CSS px minimum (plan § Numeric thresholds, SC-009). */}
                <MediaFrame
                  src={category.imageUrl}
                  alt=""
                  ratio="square"
                  rounded="rounded-full"
                  fallbackLabel={category.name.charAt(0).toUpperCase()}
                  sizes="112px"
                  className="w-20 transition-transform group-hover:scale-105 sm:w-24"
                />
                <span className="text-sm font-medium leading-tight">{category.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </SectionShell>
  )
}
