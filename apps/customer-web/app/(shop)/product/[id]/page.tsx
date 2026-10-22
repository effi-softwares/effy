import type { Metadata } from "next"
import Link from "next/link"
import { cacheLife, cacheTag } from "next/cache"
import { notFound } from "next/navigation"
import { cache, Suspense } from "react"

import type { StorefrontProductDetailDTO } from "@effy/shared-types"

import { CircleX } from "lucide-react"

import { Alert } from "@/components/ui/alert"
import { Breadcrumb } from "@/components/ui/misc"
import { edgeApiPublic, uncached } from "@/lib/api/edge"
import { CACHE_LIFE } from "@/lib/cache-life"
import { siteUrl } from "@/lib/config"
import { JsonLd, productLd } from "@/lib/json-ld"
import { initialVariantId } from "@/lib/variant-selection"

import { ProductGallery } from "../../_components/ProductGallery"
import { RecordView } from "../../_components/RecordView"
import { ProductDeliveryNote, ProductDeliveryNoteFallback } from "../../_components/ProductDeliveryNote"
import { MoreFromBrand, RelatedProducts } from "../../_components/RelatedProducts"
import { VariantBuyBox } from "../../_components/VariantBuyBox"

/**
 * The fields of a product page that stock, pricing or a size going on or off sale can change. They are
 * stripped from the KEPT content before anything is kept, so no render can reach a cached one; the
 * page reads them live (`getProductLive`). 098 — sizes are live too: each carries its own price and
 * availability, and a size taken off sale must vanish from the selector at once.
 */
const LIVE_FIELDS = [
  "priceAmount", "compareAtAmount", "currency", "available", "badges", "offer",
  "priceVaries", "variantId", "variantCount", "unitPrice", "options", "variants", "defaultVariantId",
] as const

/** What a product page says that stock and pricing cannot change: its words, pictures, attributes and aisle. */
type ProductContent = Omit<StorefrontProductDetailDTO, (typeof LIVE_FIELDS)[number]>

/** The part of a product page that must be current: read live on every view (054 FR-015a). */
type ProductLive = Pick<StorefrontProductDetailDTO, (typeof LIVE_FIELDS)[number]>

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
  // 094 — the offer changes with promotions, so it is live, never kept with the content.
  const kept: Partial<StorefrontProductDetailDTO> = { ...detail }
  for (const k of LIVE_FIELDS) delete kept[k]
  const content = kept as ProductContent
  const signed = [content.imageUrl, ...content.gallery.map((m) => m.imageUrl)].some((u) => u?.includes("X-Amz-"))
  cacheLife(signed ? CACHE_LIFE.listing : CACHE_LIFE.catalogue)
  return content
}

/** One lookup per render: the page body and `generateMetadata` both ask. */
const getProductContent = cache(readProductContent)

/**
 * The prices, sizes and availability, LIVE — the product read itself, uncached (098: a card read
 * carries one price, and the selector needs every size's). Null when the product has stopped being
 * sold since its content was kept.
 */
const getProductLive = cache(async (id: string): Promise<ProductLive | null> => {
  try {
    return await edgeApiPublic().get<StorefrontProductDetailDTO>(`/storefront/v1/products/${encodeURIComponent(id)}`, uncached())
  } catch (err) {
    if ((err as { status?: number }).status === 404) return null
    throw err
  }
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
 *  - The reference's buy column has SIZE and COLOUR pickers. 098 gave Effy sizes and flavours, so the
 *    selector is drawn from the product's own options — and only when it has some: a product sold one
 *    way shows no picker, because a disabled or invented one is worse than none.
 *  - Its tab strip is Product Details / Rating & Reviews / FAQs. Effy has no reviews and no
 *    per-product FAQs, so the section carries only what exists — Description and Details. A tab bar
 *    managing one panel is furniture.
 *
 * Attributes remain SECTIONED DETAIL ROWS, never cards (Principle V / DOCTRINE-2). Guest-first:
 * add-to-cart needs no account; saving prompts it.
 */
type SearchParams = Promise<{ variant?: string | string[] }>

export default function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  // Do NOT await params here — reading it outside <Suspense> makes the whole route blocking under
  // cacheComponents. Pass the promise in and await it inside the boundary.
  return (
    <Suspense fallback={<ProductSkeleton />}>
      <ProductDetail params={params} searchParams={searchParams} />
    </Suspense>
  )
}

async function ProductDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
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

          {/* ⚠ THE CURRENT TIER (054 FR-015a): prices, sizes and availability stream in from a live read
              beside the kept content — one request per render. */}
          <Suspense fallback={<PriceSkeleton />}>
            <LiveBuy product={product} searchParams={searchParams} />
          </Suspense>

          {product.longDescription && (
            <p className="mt-6 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{product.longDescription}</p>
          )}

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
 * Price, sizes, "Available now" and the add / save / list controls — read live, and the structured data
 * from the SAME read, so what a search engine is told matches what the page shows (`lib/json-ld.tsx`).
 * A product that has stopped being sold since its content was kept offers no control; a failed read
 * offers none either — the cart would refuse a price this page could not confirm.
 */
async function LiveBuy({ product, searchParams }: { product: ProductContent; searchParams: SearchParams }) {
  const [live, query] = await Promise.all([getProductLive(product.id).catch(() => undefined), searchParams])
  if (live === undefined) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        This product can&rsquo;t be added right now. Save it and we&rsquo;ll show you when it&rsquo;s back.
      </p>
    )
  }
  if (live === null || live.variants.length === 0) {
    return (
      <p role="status" className="mt-4 flex items-center gap-2 text-sm font-medium">
        <CircleX aria-hidden="true" className="size-4" />
        Currently unavailable
      </p>
    )
  }
  const requested = typeof query.variant === "string" ? query.variant : null
  return (
    <>
      <JsonLd data={productLd(siteUrl(), product, live)} />
      {!live.available && (
        <p className="mt-4 text-sm text-muted-foreground">
          Browse similar products below, or save it and we&rsquo;ll show you when it&rsquo;s back.
        </p>
      )}
      <VariantBuyBox
        product={{ id: product.id, name: product.name, imageUrl: product.imageUrl, imageWidths: product.imageWidths }}
        options={live.options}
        variants={live.variants}
        initialVariantId={initialVariantId(live.variants, live.defaultVariantId, requested)}
        offer={live.offer}
        currency={live.currency}
        gallery={product.gallery.map((m) => m.imageUrl)}
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
