import Image from "next/image"
import Link from "next/link"

import type { StorefrontCategoryDTO } from "@effy/shared-types"

import { SectionHeading } from "./Display"

/**
 * "Shop by category", adapted from the reference template's "BROWSE BY DRESS STYLE" block
 * (025 UI refresh).
 *
 * The reference's composition is the distinctive part: a large tinted ROUNDED PANEL containing the
 * heading and an ASYMMETRIC mosaic — two tiles on the first row split roughly 1:2, and two on the
 * second split 2:1. That deliberate imbalance is what stops it reading as another uniform grid, and
 * it is the single most recognisable block on the reference homepage.
 *
 * ⚠ The mosaic only works with FOUR categories. With fewer, the asymmetry becomes an accident rather
 * than a composition, so this falls back to an even grid — and with none at all it renders nothing.
 * Cleverness that only holds for one input count is a bug waiting for real data.
 */
export function CategoryMosaic({ categories }: { categories: StorefrontCategoryDTO[] }) {
  const stocked = categories.filter((c) => c.productCount > 0)
  if (stocked.length === 0) return null

  const featured = stocked.slice(0, 4)
  const mosaic = featured.length === 4

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="rounded-3xl bg-background px-4 py-10 sm:px-10 sm:py-14">
        <SectionHeading>Shop by category</SectionHeading>

        <div
          className={
            mosaic
              ? "mt-9 grid gap-4 sm:grid-cols-3 sm:gap-5"
              : "mt-9 grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-5"
          }
        >
          {featured.map((category, i) => (
            <CategoryTile
              key={category.key}
              category={category}
              // Rows split 1:2 then 2:1 — the reference's asymmetry, expressed as column spans.
              className={
                mosaic ? (i === 1 || i === 2 ? "sm:col-span-2" : "sm:col-span-1") : undefined
              }
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function CategoryTile({
  category,
  className,
}: {
  category: StorefrontCategoryDTO
  className?: string
}) {
  return (
    <Link
      href={`/search?category=${encodeURIComponent(category.key)}`}
      className={`group relative flex h-44 items-start overflow-hidden rounded-2xl bg-card sm:h-52 ${className ?? ""}`}
      aria-label={`${category.name}, ${category.productCount} ${category.productCount === 1 ? "item" : "items"}`}
    >
      {category.imageUrl ? (
        <Image
          src={category.imageUrl}
          alt=""
          fill
          unoptimized
          sizes="(min-width: 640px) 33vw, 50vw"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center bg-background text-3xl font-extrabold text-muted-foreground/50"
        >
          {category.name.charAt(0).toUpperCase()}
        </div>
      )}

      {/* A scrim only where the label sits, so the label survives any photograph without dimming the
          whole tile. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-background/85 to-transparent"
      />
      <span className="relative m-5 text-lg font-bold tracking-tight sm:text-xl">
        {category.name}
      </span>
    </Link>
  )
}
