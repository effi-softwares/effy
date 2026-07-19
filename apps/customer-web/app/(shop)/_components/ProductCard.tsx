import Image from "next/image"
import Link from "next/link"

import type { StorefrontProductCardDTO } from "@effy/shared-types"

import { badgeLabel, formatMoney, isDiscounted } from "@/lib/money"

/**
 * A product tile — the industry-standard commerce card (eBay/Uber Eats), the Principle V no-card
 * exception the plan records: a scannable product grid IS the right pattern and no better layout
 * exists. Product DETAIL stays card-free.
 *
 * The whole card is a link to the product. Images are presigned, expiring S3 URLs, so they are
 * rendered `unoptimized` (R7) — the Next optimizer cannot cache a signed URL.
 */
export function ProductCard({ product }: { product: StorefrontProductCardDTO }) {
  const discounted = isDiscounted(product.priceAmount, product.compareAtAmount)
  return (
    <Link
      href={`/product/${product.id}`}
      className="group flex w-40 shrink-0 flex-col sm:w-48"
      aria-label={product.name}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-lg border bg-muted">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            unoptimized
            sizes="(min-width: 640px) 12rem, 10rem"
            className="object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-full w-full items-center justify-center text-muted-foreground"
          >
            <span className="text-xs">No image</span>
          </div>
        )}
        {product.badges.length > 0 && (
          <div className="absolute left-2 top-2 flex gap-1">
            {product.badges.map((b) => (
              <span
                key={b}
                className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground"
              >
                {badgeLabel(b)}
              </span>
            ))}
          </div>
        )}
        {!product.available && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 text-sm font-medium">
            Unavailable
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-col gap-0.5">
        {product.brand && (
          <span className="truncate text-xs text-muted-foreground">{product.brand}</span>
        )}
        <span className="line-clamp-2 text-sm font-medium leading-tight">{product.name}</span>
        <span className="mt-0.5 flex items-baseline gap-1.5">
          <span className="text-sm font-semibold">
            {formatMoney(product.priceAmount, product.currency)}
          </span>
          {discounted && product.compareAtAmount && (
            <span className="text-xs text-muted-foreground line-through">
              {formatMoney(product.compareAtAmount, product.currency)}
            </span>
          )}
        </span>
      </div>
    </Link>
  )
}
