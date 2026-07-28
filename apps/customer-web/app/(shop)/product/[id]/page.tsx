import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import type { StorefrontProductDetailDTO } from "@effy/shared-types"

import { Display, Rule } from "@/components/storefront/kit"
import { coreApi, uncached } from "@/lib/api/core"
import { formatMoney, isDiscounted } from "@/lib/money"

import { AddToCartControl } from "../../_components/AddToCartControl"
import { DeliveryEstimate } from "../../_components/DeliveryEstimate"
import { FavoriteButton } from "../../_components/FavoriteButton"
import { ProductGallery } from "../../_components/ProductGallery"
import { RecordView } from "../../_components/RecordView"
import { RelatedProducts } from "../../_components/RelatedProducts"

async function fetchProduct(id: string): Promise<StorefrontProductDetailDTO | null> {
  try {
    return await coreApi().get<StorefrontProductDetailDTO>(
      `/v1/storefront/products/${encodeURIComponent(id)}`,
      uncached(),
    )
  } catch (err) {
    if ((err as { status?: number }).status === 404) return null
    throw err // a real outage bubbles to the error boundary
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  return {
    title: "Product · Effy",
    alternates: { canonical: `/product/${id}` },
  }
}

/**
 * Product detail (US2), laid out from the reference template (025 UI refresh).
 *
 * The reference's composition, top to bottom: breadcrumb → gallery beside a buy column (display-caps
 * title, price row, description, rules between blocks, quantity + add) → a TABBED section → "YOU
 * MIGHT ALSO LIKE".
 *
 * Two substitutions, both driven by what Effy is rather than by what looks good:
 *
 *  - The reference's buy column has SIZE and COLOUR pickers. Effy sells groceries; there are no
 *    variants in the catalogue, and a disabled or invented picker is worse than none.
 *  - Its tab strip is Product Details / Rating & Reviews / FAQs. Effy has no reviews and no
 *    per-product FAQs, so the section carries only what exists — Description and Details. A tab bar
 *    managing one panel is furniture.
 *
 * Attributes remain SECTIONED DETAIL ROWS, never cards (Principle V / DOCTRINE-2). Guest-first:
 * add-to-cart needs no account; saving prompts it.
 */
export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  // Do NOT await params here — reading it outside <Suspense> makes the whole route blocking under
  // cacheComponents. Pass the promise in and await it inside the boundary.
  return (
    <Suspense fallback={<ProductSkeleton />}>
      <ProductDetail params={params} />
    </Suspense>
  )
}

async function ProductDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const product = await fetchProduct(id)
  if (!product) notFound()

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
    <article className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <RecordView productId={product.id} />

      {/* Breadcrumb — the reference opens every inner page with one. */}
      <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          Home
        </Link>
        <span aria-hidden="true" className="text-muted-foreground">
          ›
        </span>
        <Link href="/browse" className="text-muted-foreground hover:text-foreground">
          Browse
        </Link>
        {product.categoryPath.map((name, i) => (
          <span key={i} className="flex items-center gap-2">
            <span aria-hidden="true" className="text-muted-foreground">
              ›
            </span>
            <span className={i === product.categoryPath.length - 1 ? "" : "text-muted-foreground"}>
              {name}
            </span>
          </span>
        ))}
      </nav>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <ProductGallery gallery={product.gallery} name={product.name} />

        {/* The buy column. Rules between blocks give the reference's rhythm. */}
        <div className="flex flex-col">
          {product.brand && <span className="text-sm text-muted-foreground">{product.brand}</span>}
          <Display as="h1" size="sub" className="mt-1 sm:text-3xl">
            {product.name}
          </Display>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-3xl font-bold">
              {formatMoney(product.priceAmount, product.currency)}
            </span>
            {discounted && product.compareAtAmount && (
              <>
                <span className="text-3xl font-bold text-muted-foreground line-through">
                  {formatMoney(product.compareAtAmount, product.currency)}
                </span>
                {percentOff !== null && percentOff > 0 && (
                  <span className="rounded-full bg-destructive/10 px-3 py-1 text-sm font-medium text-destructive">
                    -{percentOff}%
                  </span>
                )}
              </>
            )}
          </div>

          {product.longDescription && (
            <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
              {product.longDescription}
            </p>
          )}

          <Rule className="my-6" />

          {/* FR-023: what the shopper needs before deciding, next to the price. */}
          <DeliveryEstimate />

          {/* FR-028: unavailability at the point of ACTION, not only over the photograph. */}
          {!product.available && (
            <p
              role="status"
              className="mt-4 rounded-2xl bg-background px-4 py-3 text-sm text-muted-foreground"
            >
              <span className="font-medium text-foreground">Currently unavailable.</span> Browse
              similar products below, or check back soon.
            </p>
          )}

          <div className="mt-6">
            <AddToCartControl
              product={{
                productId: product.id,
                name: product.name,
                imageUrl: product.imageUrl,
                unitPriceAmount: product.priceAmount,
                currency: product.currency,
                available: product.available,
              }}
            />
          </div>

          <div className="mt-4">
            <FavoriteButton productId={product.id} />
          </div>
        </div>
      </div>

      {/* The reference's tabbed block, carrying only what Effy actually has. */}
      <ProductSections product={product} />

      {product.categoryKey && (
        // Its OWN Suspense boundary: a slow related query must never delay the buy box.
        <Suspense fallback={<div className="mt-12 h-72" aria-hidden="true" />}>
          <RelatedProducts categoryKey={product.categoryKey} excludeProductId={product.id} />
        </Suspense>
      )}
    </article>
  )
}

/**
 * Description + specifics.
 *
 * The reference tabs these. With at most two panels and no reviews to hide behind a tab, plain
 * sections separated by a rule are honest and cost the shopper no clicks — the tab strip existed to
 * manage four panels, three of which Effy does not have.
 */
function ProductSections({ product }: { product: StorefrontProductDetailDTO }) {
  const hasDescription = Boolean(product.longDescription)
  const hasAttributes = product.attributes.length > 0
  if (!hasDescription && !hasAttributes) return null

  return (
    <section className="mt-14">
      <Rule className="mb-10" />

      {hasDescription && (
        <div className="mb-10">
          <h2 className="text-lg font-bold">Description</h2>
          <p className="mt-3 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {product.longDescription}
          </p>
        </div>
      )}

      {hasAttributes && (
        <div>
          <h2 className="text-lg font-bold">Details</h2>
          <div className="mt-3 divide-y">
            {product.attributes.map((group) => (
              <div key={group.groupLabel} className="py-5">
                <h3 className="mb-3 text-sm font-medium text-muted-foreground">{group.groupLabel}</h3>
                {/* Rows, never cards (DOCTRINE-2). */}
                <dl className="grid gap-x-10 gap-y-1 sm:grid-cols-2">
                  {group.items.map((item) => (
                    <div key={item.label} className="flex justify-between gap-4 border-b py-2.5">
                      <dt className="text-sm text-muted-foreground">{item.label}</dt>
                      <dd className="text-sm font-medium">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function ProductSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6" aria-hidden="true">
      <div className="mb-6 h-4 w-56 animate-pulse rounded bg-muted" />
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="flex flex-col-reverse gap-3 md:flex-row">
          <div className="flex gap-3 md:w-[92px] md:flex-col">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="aspect-square w-[76px] animate-pulse rounded-2xl bg-muted md:w-full"
              />
            ))}
          </div>
          <div className="aspect-square w-full animate-pulse rounded-2xl bg-muted" />
        </div>
        <div className="space-y-4">
          <div className="h-9 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-10 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-16 w-full animate-pulse rounded bg-muted" />
          <div className="h-12 w-1/2 animate-pulse rounded-full bg-muted" />
        </div>
      </div>
    </div>
  )
}
