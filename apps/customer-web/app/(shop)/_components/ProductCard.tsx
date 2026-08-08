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
const gutters = "gap-x-6 gap-y-12 sm:gap-x-10 sm:gap-y-14"

/** Full-bleed listings: the home rails and any page whose grid owns the whole content column. */
export const productGrid = `grid items-stretch ${gutters} grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`

/**
 * Listings that share the row with the filter rail (search). One column narrower at every step —
 * the rail takes 16rem, so reusing `productGrid` here would squeeze the tiles below the width the
 * card was designed for.
 */
export const productGridNarrow = `grid items-stretch ${gutters} grid-cols-2 sm:grid-cols-3 xl:grid-cols-4`

export function ProductCard({
  product,
  saveControl,
}: {
  product: StorefrontProductCardDTO
  /**
   * ⚠ A SLOT, not a hook inside this component (033). `ProductCard` has NO "use client" directive and
   * is dual-mode: client-bundled on `/` (via RecentlyViewedRail) and `/search` (via SearchExperience),
   * but SERVER-rendered on `/product/[id]` (via RelatedProducts). Putting a hook in here would make it
   * a client component everywhere, including inside RelatedProducts. Passing an already-built island
   * in as a prop costs the server-rendered call sites nothing.
   */
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

  return (
    // ⚠ RELATIVE WRAPPER, not a <Link> around everything. The card used to be one big anchor, and a
    // <button> nested inside an <a> is invalid HTML that produces hydration warnings. The link is now
    // a STRETCHED OVERLAY (`after:absolute after:inset-0`) covering the card, and the save control
    // sits ABOVE it on the z-axis — so the whole tile is still one big tap target for navigation
    // while the heart remains independently clickable.
    <div className="group relative flex h-full w-full flex-col">
      {saveControl ? (
        // z-10 to sit above the stretched link. `pointer-events-auto` because the wrapper below is
        // inert to pointers; only these two things take clicks.
        <div className="absolute right-2 top-2 z-10">{saveControl}</div>
      ) : null}

      <Link
        href={`/product/${product.id}`}
        className="absolute inset-0 z-0"
        aria-label={product.name}
      />

      {/* The tinted tile. No border, no shadow — the tint is the whole separation. */}
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-background">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            unoptimized
            // Matches the widths `productGrid` actually produces: ~14rem from `lg` up (4-up at lg
            // and 5-up at xl land on nearly the same tile width), then 3-up and 2-up below.
            // ⚠ Inert while `unoptimized` is set — a presigned URL gets no srcset — but wrong values
            // become a real over-fetch the moment the media pipeline stops signing URLs.
            sizes="(min-width: 1024px) 14rem, (min-width: 640px) 30vw, 45vw"
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

      {/* The name is `text-base`, NOT the display weight used for headings. It is a label on a tile,
          not a heading on a page — at `text-lg font-bold` it competed with the section heading above
          the grid and made a wall of tiles shout. */}
      <h3 className="mt-3 line-clamp-2 text-base font-semibold leading-snug">{product.name}</h3>

      {/* ⚠ The reference's rating row sits here. Nothing to render until reviews exist. */}

      {/* `mt-auto` pins every price row in a grid to the same baseline. */}
      <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-2">
        {/* The price stays the largest thing on the tile — it is what the shopper is scanning for —
            but one step down from the old `text-2xl`, which out-shouted the name it belongs to. */}
        <span className="text-xl font-bold">
          {formatMoney(product.priceAmount, product.currency)}
        </span>
        {discounted && product.compareAtAmount && (
          <>
            {/* The struck-through price is REFERENCE information, so it is smaller than the price
                that is actually being charged. Rendering both at the same size (as this did) makes a
                shopper read the discount twice to work out which number they pay. */}
            <span className="text-base font-semibold text-muted-foreground/70 line-through">
              {formatMoney(product.compareAtAmount, product.currency)}
            </span>
            {percentOff !== null && percentOff > 0 && (
              // The reference's soft red discount chip. `destructive` is Effy's terracotta — the
              // token that already means "negative", so no new colour enters the system.
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                -{percentOff}%
              </span>
            )}
          </>
        )}
      </div>
    </div>
  )
}
