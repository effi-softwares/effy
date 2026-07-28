import Image from "next/image"
import Link from "next/link"

import type { StorefrontProductCardDTO } from "@effy/shared-types"

import { formatMoney, isDiscounted } from "@/lib/money"

/**
 * A product tile — Principle V's recorded no-card exception (a scannable product grid IS the right
 * pattern and no better layout exists). Product DETAIL stays card-free.
 *
 * ── Built to the operator's card spec ───────────────────────────────────────────────────────────
 *
 *  1. EQUAL HEIGHT across a row. `h-full` + a fixed-aspect image + `mt-auto` on the price means a
 *     two-line product name never shunts its neighbour's price out of alignment. Ragged price rows
 *     are the single most common reason a product grid looks amateur.
 *  2. WIDE. Four across at desktop rather than six — the tile is the merchandising unit, and a
 *     grocery photograph at 6-up is a thumbnail.
 *  3. THE IMAGE FILLS ITS AREA. `object-cover`, so the photograph reaches every edge of the tile
 *     instead of floating letterboxed inside it.
 *  4. NO BORDER, NO SHADOW. The tinted tile alone separates the product from the page. Borders on a
 *     white ground fragment a grid into boxes; the reference has none anywhere.
 *
 * ⚠ ONE ELEMENT OF THE REFERENCE CARD IS ABSENT: the star rating and "5.0/5". This platform has no
 * reviews — the spec puts ratings and review signals out of scope — so there is nothing to render.
 * Invented stars would be a lie printed on every tile. The slot is marked below; when reviews exist,
 * it goes there and the rest of the card is unchanged.
 *
 * Images are presigned, expiring S3 URLs, so they render `unoptimized` (R7) — the Next optimizer
 * cannot cache a signed URL.
 */
export function ProductCard({ product }: { product: StorefrontProductCardDTO }) {
  const discounted = isDiscounted(product.priceAmount, product.compareAtAmount)
  const percentOff =
    discounted && product.compareAtAmount
      ? Math.round(
          ((Number(product.compareAtAmount) - Number(product.priceAmount)) /
            Number(product.compareAtAmount)) *
            100,
        )
      : null

  return (
    <Link
      href={`/product/${product.id}`}
      className="group flex h-full w-full flex-col"
      aria-label={product.name}
    >
      {/* The tinted tile. No border, no shadow — the tint is the whole separation. */}
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-background">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            unoptimized
            sizes="(min-width: 1024px) 22rem, (min-width: 640px) 45vw, 90vw"
            // FILLS the area, edge to edge.
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-full w-full items-center justify-center text-sm text-muted-foreground"
          >
            No image
          </div>
        )}

        {!product.available && (
          <div className="absolute inset-0 flex items-center justify-center bg-card/70 text-sm font-semibold">
            Unavailable
          </div>
        )}
      </div>

      <h3 className="mt-4 line-clamp-2 text-lg font-bold leading-tight">{product.name}</h3>

      {/* ⚠ The reference's rating row sits here. Nothing to render until reviews exist. */}

      {/* `mt-auto` pins every price row in a grid to the same baseline. */}
      <div className="mt-auto flex flex-wrap items-center gap-2.5 pt-2">
        <span className="text-2xl font-bold">
          {formatMoney(product.priceAmount, product.currency)}
        </span>
        {discounted && product.compareAtAmount && (
          <>
            <span className="text-2xl font-bold text-muted-foreground/70 line-through">
              {formatMoney(product.compareAtAmount, product.currency)}
            </span>
            {percentOff !== null && percentOff > 0 && (
              // The reference's soft red discount chip. `destructive` is Effy's terracotta — the
              // token that already means "negative", so no new colour enters the system.
              <span className="rounded-full bg-destructive/10 px-3 py-1 text-sm font-medium text-destructive">
                -{percentOff}%
              </span>
            )}
          </>
        )}
      </div>
    </Link>
  )
}
