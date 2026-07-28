import Image from "next/image"
import Link from "next/link"

import type { StorefrontCategoryDTO } from "@effy/shared-types"

/**
 * A browsable category tile (025 US1 / FR-009).
 *
 * ── Why this is a permitted card (Principle V) ───────────────────────────────────────────────────
 *
 * The no-card doctrine bans cards as a general layout device. This is recorded in research.md R11 as
 * an EXTENSION of the existing product-tile exception, not a new class of card: it is the same
 * pattern — a navigable catalogue entity presented for visual scanning — applied to the same kind of
 * thing. For a food-first store the alternative is a twenty-item text list, which is measurably worse
 * at the one job browse has.
 *
 * The image is DERIVED server-side from a product in the category (categories store no imagery, and
 * FR-001 forbids adding a column). When a category has no imagery at all, a typed brand tile renders —
 * never a broken frame.
 */
export function CategoryTile({ category }: { category: StorefrontCategoryDTO }) {
  return (
    <Link
      href={`/search?category=${encodeURIComponent(category.key)}`}
      className="group flex flex-col"
      aria-label={`${category.name}, ${category.productCount} ${category.productCount === 1 ? "item" : "items"}`}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-background">
        {category.imageUrl ? (
          <Image
            src={category.imageUrl}
            alt=""
            fill
            unoptimized
            sizes="(min-width: 1024px) 20rem, (min-width: 640px) 33vw, 50vw"
            className="object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-full w-full items-center justify-center bg-muted text-2xl font-semibold text-muted-foreground/60"
          >
            {category.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <span className="mt-3 text-base font-bold leading-tight">{category.name}</span>
      <span className="text-xs text-muted-foreground">
        {category.productCount} {category.productCount === 1 ? "item" : "items"}
      </span>
    </Link>
  )
}
