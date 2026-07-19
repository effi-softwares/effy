import type { Metadata } from "next"
import Image from "next/image"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import type { StorefrontProductDetailDTO } from "@effy/shared-types"

import { coreApi, uncached } from "@/lib/api/core"
import { formatMoney, isDiscounted } from "@/lib/money"

import { AddToCartControl } from "../../_components/AddToCartControl"
import { FavoriteButton } from "../../_components/FavoriteButton"
import { RecordView } from "../../_components/RecordView"

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
 * Product detail (US2). The content depends on the hot path (local-only this slice), so it streams
 * inside <Suspense> — the same PPR pattern as Home. Attributes are laid out as SECTIONED DETAIL ROWS,
 * never cards (Principle V / DOCTRINE-2). Guest-first: add-to-cart needs no account; save prompts it.
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

  return (
    <article className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <RecordView productId={product.id} />

      {product.categoryPath.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
          {product.categoryPath.join(" › ")}
        </nav>
      )}

      <div className="grid gap-8 md:grid-cols-2">
        <Gallery gallery={product.gallery} name={product.name} />

        <div className="flex flex-col gap-4">
          {product.brand && (
            <span className="text-sm text-muted-foreground">{product.brand}</span>
          )}
          <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>

          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold">
              {formatMoney(product.priceAmount, product.currency)}
            </span>
            {discounted && product.compareAtAmount && (
              <span className="text-base text-muted-foreground line-through">
                {formatMoney(product.compareAtAmount, product.currency)}
              </span>
            )}
          </div>

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
          <FavoriteButton productId={product.id} />
        </div>
      </div>

      {product.longDescription && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Description</h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {product.longDescription}
          </p>
        </section>
      )}

      {product.attributes.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Details</h2>
          <div className="mt-2 divide-y">
            {product.attributes.map((group) => (
              <div key={group.groupLabel} className="py-4">
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                  {group.groupLabel}
                </h3>
                <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {group.items.map((item) => (
                    <div key={item.label} className="flex justify-between gap-4 border-b py-1.5">
                      <dt className="text-sm text-muted-foreground">{item.label}</dt>
                      <dd className="text-sm font-medium">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </section>
      )}
    </article>
  )
}

function Gallery({ gallery, name }: { gallery: StorefrontProductDetailDTO["gallery"]; name: string }) {
  const primary = gallery[0]
  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border bg-muted">
        {primary ? (
          <Image
            src={primary.imageUrl}
            alt={primary.alt ?? name}
            fill
            unoptimized
            sizes="(min-width: 768px) 40rem, 100vw"
            className="object-cover"
            priority
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
            No image
          </div>
        )}
      </div>
      {gallery.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {gallery.slice(1).map((m, i) => (
            <div key={i} className="relative size-16 shrink-0 overflow-hidden rounded-md border">
              <Image src={m.imageUrl} alt={m.alt ?? name} fill unoptimized sizes="4rem" className="object-cover" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ProductSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6" aria-hidden="true">
      <div className="grid gap-8 md:grid-cols-2">
        <div className="aspect-square w-full animate-pulse rounded-xl bg-muted" />
        <div className="space-y-4">
          <div className="h-6 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-8 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-11 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  )
}
