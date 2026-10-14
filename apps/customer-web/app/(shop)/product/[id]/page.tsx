import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import type { StorefrontProductDetailDTO } from "@effy/shared-types"

import { CircleCheck, CircleX } from "lucide-react"

import { Alert } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Breadcrumb } from "@/components/ui/misc"
import { edgeApiPublic, uncached } from "@/lib/api/edge"
import { formatMoney, isDiscounted } from "@/lib/money"

import { AddToCartControl } from "../../_components/AddToCartControl"
import { AddToListButton } from "../../_components/AddToListButton"
import { SaveControl } from "../../_components/SaveControl"
import { ProductGallery } from "../../_components/ProductGallery"
import { RecordView } from "../../_components/RecordView"
import { ProductDeliveryNote, ProductDeliveryNoteFallback } from "../../_components/ProductDeliveryNote"
import { MoreFromBrand, RelatedProducts } from "../../_components/RelatedProducts"

async function fetchProduct(id: string): Promise<StorefrontProductDetailDTO | null> {
  try {
    return await edgeApiPublic().get<StorefrontProductDetailDTO>(
      `/storefront/v1/products/${encodeURIComponent(id)}`,
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
  const saving = discounted && product.compareAtAmount ? Number(product.compareAtAmount) - Number(product.priceAmount) : 0
  const percentOff =
    discounted && product.compareAtAmount ? Math.round((saving / Number(product.compareAtAmount)) * 100) : null

  return (
    <article className="container py-6">
      <RecordView productId={product.id} />

      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "All products", href: "/search" },
          ...product.categoryPath.map((name) => ({ label: name })),
          { label: product.name },
        ]}
      />

      <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-12">
        <ProductGallery gallery={product.gallery} name={product.name} />

        <div className="flex min-w-0 flex-col">
          {product.brand && <p className="text-sm text-muted-foreground">{product.brand}</p>}
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{product.name}</h1>

          <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-3xl font-bold tabular-nums">{formatMoney(product.priceAmount, product.currency)}</span>
            {discounted && product.compareAtAmount && (
              <>
                <span className="text-sm text-muted-foreground tabular-nums line-through">
                  <span className="sr-only">was </span>
                  {formatMoney(product.compareAtAmount, product.currency)}
                </span>
                {percentOff !== null && percentOff > 0 && (
                  <Badge variant="brand" className="self-center">
                    −{percentOff}%
                  </Badge>
                )}
              </>
            )}
          </div>
          {saving > 0 && percentOff !== null && percentOff > 0 && (
            <p className="mt-1 text-sm font-medium text-brand">
              Save {formatMoney(saving.toFixed(2), product.currency)} ({percentOff}% off)
            </p>
          )}

          {/* ⚠ "Available" is all that is said — never a count. A shopper learns it can be bought,
              not how many are on a shelf they will never see. */}
          <p
            role="status"
            className={`mt-4 flex items-center gap-2 text-sm font-medium ${product.available ? "text-brand" : ""}`}
          >
            {product.available ? (
              <CircleCheck aria-hidden="true" className="size-4" />
            ) : (
              <CircleX aria-hidden="true" className="size-4" />
            )}
            {product.available ? "Available now" : "Currently unavailable"}
          </p>

          {product.longDescription && (
            <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{product.longDescription}</p>
          )}

          <div className="mt-6 border-t pt-6">
            {!product.available && (
              <p className="mb-3 text-sm text-muted-foreground">
                Browse similar products below, or save it and we&rsquo;ll show you when it&rsquo;s back.
              </p>
            )}
            <AddToCartControl
              product={{
                productId: product.id,
                name: product.name,
                imageUrl: product.imageUrl,
                imageWidths: product.imageWidths,
                unitPriceAmount: product.priceAmount,
                currency: product.currency,
                available: product.available,
              }}
            />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <SaveControl productId={product.id} label />
              <AddToListButton productId={product.id} />
            </div>
          </div>

          <div className="mt-6">
            <Suspense fallback={<ProductDeliveryNoteFallback />}>
              <ProductDeliveryNote />
            </Suspense>
          </div>
        </div>
      </div>

      <ProductSections product={product} />

      {product.categoryKey && (
        <Suspense fallback={<div className="h-72" aria-hidden="true" />}>
          <RelatedProducts categoryKey={product.categoryKey} excludeProductId={product.id} />
        </Suspense>
      )}
      {product.brand && (
        <Suspense fallback={null}>
          <MoreFromBrand brand={product.brand} excludeProductId={product.id} />
        </Suspense>
      )}
    </article>
  )
}

/**
 * Everything below the buy box, on ONE page with no tabs (reference: Product detail — single page).
 *
 * ⚠ A section with nothing to show is ABSENT, never an empty heading: Description needs a
 * description; Item specifics needs attributes; the Nutrition table appears only when the product
 * carries an attribute group by that name. The allergen notice is always shown — it is advice about
 * the label, not a fact about this product.
 */
function ProductSections({ product }: { product: StorefrontProductDetailDTO }) {
  const nutrition = product.attributes.filter((g) => /nutrition/i.test(g.groupLabel))
  const specifics = product.attributes.filter((g) => !/nutrition/i.test(g.groupLabel))

  return (
    <div className={`mt-12 grid gap-10 ${nutrition.length > 0 ? "lg:grid-cols-[minmax(0,1fr)_380px]" : ""}`}>
      <div className="min-w-0 max-w-3xl space-y-10">
        {product.longDescription && (
          <section>
            <h2 className="text-xl font-semibold">Description</h2>
            <p className="mt-4 text-sm leading-7 whitespace-pre-line">{product.longDescription}</p>
          </section>
        )}

        {specifics.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold">Item specifics</h2>
            {specifics.map((group) => (
              <SpecTable key={group.groupLabel} group={group} showLabel={specifics.length > 1} />
            ))}
          </section>
        )}

        <section>
          <h2 className="text-xl font-semibold">Allergens &amp; safety</h2>
          <Alert title="Allergen & ingredient information" live={false} className="mt-4">
            Always read the label on the physical product — online information may not be complete or
            current. See our{" "}
            <Link href="/legal/food-safety-allergens" className="text-foreground underline underline-offset-4">
              Food Safety &amp; Allergen Notice
            </Link>
            .
          </Alert>
        </section>
      </div>

      {nutrition.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold">Nutrition</h2>
          {nutrition.map((group) => (
            <SpecTable key={group.groupLabel} group={group} showLabel={false} />
          ))}
        </section>
      )}
    </div>
  )
}

function SpecTable({
  group,
  showLabel,
}: {
  group: StorefrontProductDetailDTO["attributes"][number]
  showLabel: boolean
}) {
  return (
    <div className="mt-4">
      {showLabel && <h3 className="mb-2 text-sm font-medium text-muted-foreground">{group.groupLabel}</h3>}
      <dl className="divide-y overflow-hidden rounded-lg border shadow-xs">
        {group.items.map((item) => (
          <div key={item.label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 px-4 py-2.5 text-sm">
            <dt className="text-muted-foreground">{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function ProductSkeleton() {
  return (
    <div className="container py-6" aria-hidden="true">
      <div className="h-4 w-56 animate-pulse rounded-md bg-muted" />
      <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="aspect-square w-full animate-pulse rounded-lg bg-muted" />
        <div className="space-y-4">
          <div className="h-8 w-3/4 animate-pulse rounded-md bg-muted" />
          <div className="h-9 w-1/3 animate-pulse rounded-md bg-muted" />
          <div className="h-16 w-full animate-pulse rounded-md bg-muted" />
          <div className="h-12 w-full animate-pulse rounded-md bg-muted" />
          <div className="h-36 w-full animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    </div>
  )
}
