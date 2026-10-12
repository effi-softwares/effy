import { Package } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

import type { StorefrontProductCardDTO } from "@effy/shared-types"

import { Badge } from "@/components/ui/badge"
import { formatMoney, isDiscounted } from "@/lib/money"

import { CardAdd } from "./CardAdd"

/**
 * A product tile — Principle V's recorded no-card exception (a scannable product grid IS the right
 * pattern and no better layout exists). Product DETAIL stays card-free.
 *
 * ── Built to the operator's card spec ───────────────────────────────────────────────────────────
 *
 *  1. EQUAL HEIGHT across a row. `h-full` + a fixed-aspect image + `mt-auto` on the price means a
 *     two-line product name never shunts its neighbour's price out of alignment. Ragged price rows
 *     are the single most common reason a product grid looks amateur.
 *  2. WIDE, not huge. Four across at desktop and five on a wide screen — the tile is the
 *     merchandising unit, and a grocery photograph at 6-up is a thumbnail. See `productGrid` below.
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
/**
 * The grid every product listing uses.
 *
 * ⚠ This is a CONSTANT rather than a class string repeated per page for a reason: the column count
 * and the gutters are a single design decision, and it was previously written out in three separate
 * files. Tuning it meant finding all three and keeping them in step — which is exactly the kind of
 * thing that silently drifts, leaving the home page and the search results on different rhythms.
 *
 * Column counts are chosen from the CARD WIDTH they produce inside the `container` (80rem — see the
 * `@utility container` in app/globals.css), not picked
 * for symmetry: 5-up on a wide screen lands each tile near 14rem, which is the size a product tile
 * wants to be. Below `lg` it steps down so a tile never becomes a thumbnail.
 *
 * The gutters are deliberately ASYMMETRIC — more vertical than horizontal. Rows need visible
 * separation because a card's own name and price already sit below its image; without extra
 * vertical air, the row below reads as a continuation of the row above.
 */
const gutters = "gap-x-4 gap-y-8"

/** Full-bleed listings: the home rails and any page whose grid owns the whole content column. */
export const productGrid = `grid items-stretch ${gutters} grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`

/**
 * Listings that share the row with the filter rail (search). One column narrower at every step —
 * the rail takes 16rem, so reusing `productGrid` here would squeeze the tiles below the width the
 * card was designed for.
 */
export const productGridNarrow = `grid items-stretch ${gutters} grid-cols-2 md:grid-cols-3 xl:grid-cols-4`

export function ProductCard({
  product,
  saveControl,
}: {
  product: StorefrontProductCardDTO
  saveControl?: React.ReactNode
}) {
  const discounted = isDiscounted(product.priceAmount, product.compareAtAmount)
  const percentOff =
    discounted && product.compareAtAmount
      ? Math.round(
          ((Number(product.compareAtAmount) - Number(product.priceAmount)) /
            Number(product.compareAtAmount)) *
            100,
        )
      : null
  const isNew = product.badges.includes("new")

  return (
    <div className="group relative flex h-full w-full flex-col">
      {saveControl ? <div className="absolute top-2 right-2 z-10">{saveControl}</div> : null}

      {/* The whole card is one link, laid UNDER the controls: the heart and the Add button sit above
          it (z-10) and stay separately pressable, and a screen reader meets one link, not three. */}
      <Link href={`/product/${product.id}`} className="absolute inset-0 z-0 rounded-lg" aria-label={product.name} />

      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-muted">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt=""
            fill
            unoptimized
            sizes="(min-width: 1280px) 15rem, (min-width: 1024px) 22vw, (min-width: 768px) 30vw, 45vw"
            className={`object-cover transition-transform duration-300 group-hover:scale-[1.03] ${product.available ? "" : "opacity-50"}`}
          />
        ) : (
          <div aria-hidden="true" className="grid h-full w-full place-items-center text-muted-foreground">
            <Package className="size-10" strokeWidth={1.5} />
          </div>
        )}

        {/* ONE badge, by precedence: a product that cannot be bought says so and nothing else. */}
        <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
          {discounted && product.available ? (
            <Badge variant="brand">Sale</Badge>
          ) : isNew && product.available ? (
            <Badge>New</Badge>
          ) : null}
        </div>
        {!product.available && (
          <Badge variant="dark" className="absolute bottom-2 left-2">
            Unavailable
          </Badge>
        )}
      </div>

      {product.brand && <p className="mt-3 truncate text-xs text-muted-foreground">{product.brand}</p>}
      <h3 className={`line-clamp-2 text-sm leading-snug font-medium ${product.brand ? "mt-0.5" : "mt-3"}`}>
        {product.name}
      </h3>

      <div className="mt-auto flex items-end justify-between gap-2 pt-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-base font-semibold tabular-nums">
              {formatMoney(product.priceAmount, product.currency)}
            </span>
            {discounted && product.compareAtAmount && (
              <span className="text-xs text-muted-foreground tabular-nums line-through">
                <span className="sr-only">was </span>
                {formatMoney(product.compareAtAmount, product.currency)}
              </span>
            )}
          </p>
          {percentOff !== null && percentOff > 0 && (
            <p className="text-xs font-medium text-brand">{percentOff}% off</p>
          )}
        </div>
        {product.available && (
          <CardAdd
            product={{
              productId: product.id,
              name: product.name,
              imageUrl: product.imageUrl,
              unitPriceAmount: product.priceAmount,
              currency: product.currency,
            }}
          />
        )}
      </div>
    </div>
  )
}
