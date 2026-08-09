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
 * ⚠ NO SCROLLBAR (operator direction, 2026-08-09) — but the BAR is hidden, not the scrolling.
 * `overflow-x-auto` stays, so the row still scrolls by wheel, trackpad, touch and keyboard;
 * `[scrollbar-width:none]` + `[&::-webkit-scrollbar]:hidden` only suppress the chrome. That pair is
 * the same one `ProductGallery` already uses — if a third scroller ever wants it, it should become a
 * shared utility rather than another copy.
 *
 * ⚠ What is genuinely given up: on a platform with CLASSIC (non-overlay) scrollbars — Windows, and
 * macOS set to "always show" — the bar was the only thing announcing that this row continues past
 * the edge, and the only pointer-drag handle for it. What has to replace it is the layout: the tiles
 * are a fixed 80/96px and deliberately NOT fitted to the viewport, so a partial tile is cut off at
 * the right edge whenever there is more to see. That peek is now the entire affordance, which is why
 * the tile width must stay fixed rather than becoming responsive.
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
        <ul className="-mx-4 flex gap-6 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:gap-8 sm:px-0 [&::-webkit-scrollbar]:hidden">
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
