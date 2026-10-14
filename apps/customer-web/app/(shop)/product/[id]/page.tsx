import type { Metadata } from "next"
import Link from "next/link"
import { cacheLife, cacheTag } from "next/cache"
import { notFound } from "next/navigation"
import { cache, Suspense } from "react"

import type {
  ProductSearchResultDTO,
  StorefrontProductCardDTO,
  StorefrontProductDetailDTO,
} from "@effy/shared-types"

import { CircleCheck, CircleX } from "lucide-react"

import { Alert } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Breadcrumb } from "@/components/ui/misc"
import { edgeApiPublic, uncached } from "@/lib/api/edge"
import { CACHE_LIFE } from "@/lib/cache-life"
import { formatMoney, isDiscounted } from "@/lib/money"

import { AddToCartControl } from "../../_components/AddToCartControl"
import { AddToListButton } from "../../_components/AddToListButton"
import { SaveControl } from "../../_components/SaveControl"
import { ProductGallery } from "../../_components/ProductGallery"
import { RecordView } from "../../_components/RecordView"
import { ProductDeliveryNote, ProductDeliveryNoteFallback } from "../../_components/ProductDeliveryNote"
import { MoreFromBrand, RelatedProducts } from "../../_components/RelatedProducts"

/**
 * What a product page says that stock and pricing cannot change: its words, pictures, attributes and
 * aisle. The price, the was-price and "Available now" are deliberately NOT in it — they are stripped
 * here, before anything is kept, so no render can reach a cached one.
 */
type ProductContent = Omit<
  StorefrontProductDetailDTO,
  "priceAmount" | "compareAtAmount" | "currency" | "available" | "badges"
>

/** The part of a product page that must be current: read live on every view (054 FR-015a). */
type ProductLive = Pick<StorefrontProductCardDTO, "priceAmount" | "compareAtAmount" | "currency" | "available">

/**
 * The product's content — SHARED between requests for minutes (PERF-07, 054 FR-015a as amended).
 *
 * ⚠ An unknown product is kept only as long as a listing (`listing`): a product staff have just
 * approved must not 404 for a quarter of an hour. A failure is thrown, and a thrown read is not kept.
 * ⚠ A presigned picture address expires in 15 minutes, so a payload still carrying one (a backend
 * from before 086) is kept no longer than a listing either — `catalogue` would outlive its links.
 * ⚠ No writer revalidates the tag (lib/cache-life.ts says why); the lifetime is the contract.
 */
async function readProductContent(id: string): Promise<ProductContent | null> {
  "use cache"
  cacheTag(`product:${id}`)
  let detail: StorefrontProductDetailDTO
  try {
    detail = await edgeApiPublic().get<StorefrontProductDetailDTO>(`/storefront/v1/products/${encodeURIComponent(id)}`)
  } catch (err) {
    if ((err as { status?: number }).status !== 404) throw err // a real outage bubbles to the error boundary
    cacheLife(CACHE_LIFE.listing)
    return null
  }
  const { priceAmount, compareAtAmount, currency, available, badges, ...content } = detail
  const signed = [content.imageUrl, ...content.gallery.map((m) => m.imageUrl)].some((u) => u?.includes("X-Amz-"))
  cacheLife(signed ? CACHE_LIFE.listing : CACHE_LIFE.catalogue)
  return content
}

/** One lookup per render: the page body and `generateMetadata` both ask. */
const getProductContent = cache(readProductContent)

/**
 * The price and availability, LIVE — the same card read the recently-viewed rail makes (`?ids=`), so
 * the product page's current tier costs no route of its own. Null when the product has stopped being
 * sold since its content was kept.
 */
const getProductLive = cache(async (id: string): Promise<ProductLive | null> => {
  const page = await edgeApiPublic().get<ProductSearchResultDTO>(
    `/storefront/v1/products?ids=${encodeURIComponent(id)}`,
    uncached(),
  )
  return page.items[0] ?? null
})

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const product = await getProductContent(id).catch(() => null)
  return {
    title: product ? product.name : "Product", // the root layout adds " · Effy"
    description: product?.longDescription ? excerpt(product.longDescription) : undefined,
    alternates: { canonical: `/product/${id}` },
  }
}

/** A search result's description: the first ~155 characters, cut at a word. */
function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim()
  if (flat.length <= 155) return flat
  return `${flat.slice(0, 155).replace(/\s+\S*$/, "")}…`
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
  const product = await getProductContent(id)
  if (!product) notFound()

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

          {/* ⚠ THE CURRENT TIER (054 FR-015a): price and availability stream in from a live read beside
              the kept content. Both islands ask `getProductLive`, which is one request per render. */}
          <Suspense fallback={<PriceSkeleton />}>
            <LivePrice id={product.id} />
          </Suspense>

          {product.longDescription && (
            <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{product.longDescription}</p>
          )}

          <div className="mt-6 border-t pt-6">
            <Suspense fallback={<div className="h-12 w-full animate-pulse rounded-lg bg-muted" aria-hidden="true" />}>
              <LiveBuy product={product} />
            </Suspense>
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

/** Price, was-price and "Available now" — read live. A failed read says nothing rather than guess. */
async function LivePrice({ id }: { id: string }) {
  const live = await getProductLive(id).catch(() => undefined)
  if (live === undefined) return null
  if (live === null) return <AvailabilityStatus available={false} />

  const discounted = isDiscounted(live.priceAmount, live.compareAtAmount)
  const saving = discounted && live.compareAtAmount ? Number(live.compareAtAmount) - Number(live.priceAmount) : 0
  const percentOff =
    discounted && live.compareAtAmount ? Math.round((saving / Number(live.compareAtAmount)) * 100) : null

  return (
    <>
      <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-3xl font-bold tabular-nums">{formatMoney(live.priceAmount, live.currency)}</span>
        {discounted && live.compareAtAmount && (
          <>
            <span className="text-sm text-muted-foreground tabular-nums line-through">
              <span className="sr-only">was </span>
              {formatMoney(live.compareAtAmount, live.currency)}
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
          Save {formatMoney(saving.toFixed(2), live.currency)} ({percentOff}% off)
        </p>
      )}
      <AvailabilityStatus available={live.available} />
    </>
  )
}

/**
 * ⚠ "Available" is all that is said — never a count. A shopper learns it can be bought, not how many
 * are on a shelf they will never see.
 */
function AvailabilityStatus({ available }: { available: boolean }) {
  return (
    <p role="status" className={`mt-4 flex items-center gap-2 text-sm font-medium ${available ? "text-brand" : ""}`}>
      {available ? (
        <CircleCheck aria-hidden="true" className="size-4" />
      ) : (
        <CircleX aria-hidden="true" className="size-4" />
      )}
      {available ? "Available now" : "Currently unavailable"}
    </p>
  )
}

/**
 * The add-to-cart control, priced from the live read. A product that has stopped being sold since its
 * content was kept offers no control; a failed read offers none either — the cart would refuse a
 * price this page could not confirm.
 */
async function LiveBuy({ product }: { product: ProductContent }) {
  const live = await getProductLive(product.id).catch(() => null)
  if (!live) {
    return (
      <p className="text-sm text-muted-foreground">
        This product can&rsquo;t be added right now. Save it and we&rsquo;ll show you when it&rsquo;s back.
      </p>
    )
  }
  return (
    <>
      {!live.available && (
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
          unitPriceAmount: live.priceAmount,
          currency: live.currency,
          available: live.available,
        }}
      />
    </>
  )
}

function PriceSkeleton() {
  return (
    <div className="mt-4 space-y-3" aria-hidden="true">
      <div className="h-9 w-1/3 animate-pulse rounded-md bg-muted" />
      <div className="h-5 w-32 animate-pulse rounded-md bg-muted" />
    </div>
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
function ProductSections({ product }: { product: ProductContent }) {
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
