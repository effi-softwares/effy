import { Package } from "lucide-react"
import Link from "next/link"

import type { StorefrontProductCardDTO } from "@effy/shared-types"

import { AgeBadge } from "@/components/storefront/AgeBadge"
import { CatalogImage } from "@/components/storefront/CatalogImage"
import { Badge } from "@/components/ui/badge"
import { Bone, boneWidth, Loading } from "@/components/ui/skeletons"
import { formatMoney, isDiscounted } from "@/lib/money"

import { CardAdd } from "./CardAdd"
import { UnitPrice } from "./UnitPrice"

/**
 * A product tile: the recorded no-card exception (a scannable product grid is the right pattern).
 * Equal height across a row (`h-full`, a fixed-aspect image, `mt-auto` on the price); the image fills
 * its area (`object-cover`); no border or shadow, the tinted tile separates it. No star rating: there
 * are no reviews. Pictures come from the media CDN at the drawn size (`CatalogImage`).
 */
/**
 * The grid every product listing uses, one constant so every listing shares the rhythm. Column counts
 * come from the tile width inside `container` (80rem): 5-up on a wide screen is about 14rem a tile.
 * Gutters are taller than wide, so rows read as separate.
 */
const gutters = "gap-x-4 gap-y-8"

/** Full-bleed listings: the home rails and any page whose grid owns the whole content column. */
export const productGrid = `grid items-stretch ${gutters} grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`

/**
 * Listings that share the row with the filter rail (search). One column narrower at every step
 * the rail takes 16rem, so reusing `productGrid` here would squeeze the tiles below the width the
 * card was designed for.
 */
export const productGridNarrow = `grid items-stretch ${gutters} grid-cols-2 md:grid-cols-3 xl:grid-cols-4`

/** One tile before its product arrives: picture, name, price and the add button, each where the card puts them. */
export function ProductCardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <div className="flex h-full w-full flex-col" aria-hidden="true">
      <Bone kind="thumb" className="w-full" />
      <Bone className={`mt-3 ${index % 3 === 1 ? "w-2/3" : "w-11/12"}`} />
      <Bone className={`mt-2 ${boneWidth(index)}`} />
      <div className="mt-auto flex items-end justify-between gap-2 pt-3">
        <Bone kind="price" />
        <Bone kind="control" className="h-8 w-16" />
      </div>
    </div>
  )
}

/** The grid before its products arrive - the same tiles, so the swap-in moves nothing. */
export function ProductGridSkeleton({ className, count = 8 }: { className: string; count?: number }) {
  return (
    <Loading label="Loading products">
      <div className={className}>
        {Array.from({ length: count }, (_, i) => (
          <ProductCardSkeleton key={i} index={i} />
        ))}
      </div>
    </Loading>
  )
}

/** How many cards open a listing above the fold - one row at the widest layout the rails and the search grid share. */
export const FIRST_ROW = 4

/**
 * The product page, opened on the size this tile stands for when there is a choice - a search
 * that matched one size's stock code or barcode opens on that size.
 */
export function productHref(product: Pick<StorefrontProductCardDTO, "id" | "variantId" | "variantCount">): string {
  return product.variantCount > 1 ? `/product/${product.id}?variant=${product.variantId}` : `/product/${product.id}`
}

export function ProductCard({
  product,
  saveControl,
  priority = false,
}: {
  product: StorefrontProductCardDTO
  saveControl?: React.ReactNode
  /**
   * The card opens the page's first listing: its picture is fetched with the document instead of
   * waiting for layout to prove it is on screen. No preload in the head - that would also write a
   * preload into the head, and four of those would compete with the stylesheet and the typeface.
   */
  priority?: boolean
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

      {/* The whole card is one link, laid under the controls: the heart and the Add button sit above
          it (z-10) and stay separately pressable, and a screen reader meets one link, not three. */}
      <Link href={productHref(product)} className="absolute inset-0 z-0 rounded-lg" aria-label={product.name} />

      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-muted">
        {product.imageUrl ? (
          <CatalogImage
            src={product.imageUrl}
            widths={product.imageWidths}
            alt=""
            fill
            priority={priority}
            sizes="(min-width: 1280px) 15rem, (min-width: 1024px) 22vw, (min-width: 768px) 30vw, 45vw"
            className={`object-cover transition-transform duration-300 group-hover:scale-[1.03] ${product.available ? "" : "opacity-50"}`}
          />
        ) : (
          <div aria-hidden="true" className="grid h-full w-full place-items-center text-muted-foreground">
            <Package className="size-10" strokeWidth={1.5} />
          </div>
        )}

        {/* One badge, by precedence: a product that cannot be bought says so and nothing else. */}
        <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
          {/* An offer on the product ("15% off", "Buy 2 get 1 free") leads; it is what the cart will apply. */}
          {product.offer && product.available ? (
            <Badge variant="brand">{product.offer.label}</Badge>
          ) : discounted && product.available ? (
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
      <h3 className={`line-clamp-2 text-sm leading-snug font-medium ${product.brand ? "mt-1" : "mt-3"}`}>
        {product.name}
      </h3>
      {product.ageRestricted ? <AgeBadge className="mt-1 self-start" /> : null}

      <div className="mt-auto flex items-end justify-between gap-2 pt-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-base font-semibold tabular-nums">
              {/* Sizes at different prices: the tile says the lowest, and says it is a lowest. */}
              {product.priceVaries ? <span className="text-xs font-normal text-muted-foreground">From </span> : null}
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
          <UnitPrice unit={product.unitPrice} className="block" />
        </div>
        {product.available && (
          <CardAdd
            href={productHref(product)}
            product={{
              variantId: product.variantId,
              variantCount: product.variantCount,
              productId: product.id,
              name: product.name,
              ageRestricted: product.ageRestricted,
              imageUrl: product.imageUrl,
              imageWidths: product.imageWidths,
              unitPriceAmount: product.priceAmount,
              currency: product.currency,
            }}
          />
        )}
      </div>
    </div>
  )
}
