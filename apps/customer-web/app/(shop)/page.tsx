import type { Metadata } from "next"
import { Suspense } from "react"

import type { StorefrontCategoryDTO, StorefrontHomeDTO } from "@effy/shared-types"

import { coreApi, uncached } from "@/lib/api/core"
import { siteUrl } from "@/lib/config"
import { JsonLd, organizationLd } from "@/lib/json-ld"

import { CategoryMosaic } from "./_components/CategoryMosaic"
import { Hero } from "./_components/Hero"
import { DeliveryNotice } from "./_components/DeliveryAffordance"
import { productGrid } from "./_components/ProductCard"
import { ProductRail } from "./_components/ProductRail"
import { PromoCarousel } from "./_components/PromoCarousel"
import { RecentlyViewedRail } from "./_components/RecentlyViewedRail"

export const metadata: Metadata = {
  title: "Effy — groceries, delivered",
  description:
    "Shop fresh groceries and everyday essentials from Effy. Browse without an account; sign in only when you order.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Effy — groceries, delivered",
    description:
      "Shop fresh groceries and everyday essentials from Effy, delivered to your door.",
    url: "/",
  },
}

/**
 * The storefront home (US1). GUEST-FIRST (FR-001) — fully usable with no account, never asks for one.
 *
 * ── Composition, from the reference template (025 UI refresh) ────────────────────────────────────
 *
 * The reference's homepage order is: hero band → merchandising rail → merchandising rail → category
 * mosaic panel → social proof → closing CTA → footer. This follows it, with two substitutions driven
 * by what Effy actually has:
 *
 *  - The reference's BRAND STRIP (Versace, Zara, Gucci…) has no analogue: Effy is single-brand by
 *    definition, so a logo wall would be a row of one. Dropped rather than faked.
 *  - The reference's TESTIMONIAL CAROUSEL is dropped for the same reason the product cards carry no
 *    star ratings — there are no reviews on this platform, and inventing them is not a design
 *    decision.
 *
 * The static shell (H1, hero, section scaffolding) prerenders and is present in the raw HTML for
 * crawlers (FR-002). The merchandised rails depend on `core-api`, so they stream inside a <Suspense>
 * boundary — the PPR model: instant static shell, then content, degrading to a skeleton and then to a
 * friendly empty/error state.
 */
export default function HomePage() {
  return (
    <>
      <JsonLd data={organizationLd(siteUrl())} />

      {/* Static — in the prerender, present in raw HTML.
          ⚠ The reference opens the homepage with a full-width PROMOTIONAL BANNER, not a type-led
          hero: a retail storefront leads with what is on offer, not with a slogan. So the H1 is
          screen-reader-only and the carousel takes the top slot. */}
      <h1 className="sr-only">Effy — groceries, delivered</h1>
      <Hero />

      {/* Client island: shown only when the shopper's postcode is outside a serviced zone. */}
      <DeliveryNotice />

      {/* Dynamic hole — the merchandised store, streamed from the hot path. */}
      <Suspense fallback={<HomeSkeleton />}>
        <HomeContent />
      </Suspense>

      {/* Device-local recently-viewed (client island). */}
      <RecentlyViewedRail />
    </>
  )
}

async function HomeContent() {
  let home: StorefrontHomeDTO
  let categories: StorefrontCategoryDTO[]
  try {
    ;[home, categories] = await Promise.all([
      coreApi().get<StorefrontHomeDTO>("/v1/storefront/home", uncached()),
      coreApi().get<StorefrontCategoryDTO[]>("/v1/storefront/categories", uncached()),
    ])
  } catch {
    return <StoreUnavailable />
  }

  if (home.rails.length === 0) {
    return <EmptyStore />
  }

  return (
    <>
      <PromoCarousel banners={home.banners} />

      {home.rails.map((rail, i) => (
        <div key={rail.key}>
          <ProductRail title={rail.title} products={rail.products} href={railHref(rail.key)} />
          {/* The reference closes each merchandising section with a hairline rule. */}
          {i < home.rails.length - 1 && (
            <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
              <hr className="border-border" />
            </div>
          )}
        </div>
      ))}

      <CategoryMosaic categories={categories} />
    </>
  )
}

/** "View all" for a rail — category rails filter by category, on-sale filters, featured goes to search. */
function railHref(key: string): string {
  if (key.startsWith("category:")) {
    return `/search?category=${encodeURIComponent(key.slice("category:".length))}`
  }
  if (key === "on_sale") return "/search?saleOnly=true"
  return "/search"
}

function HomeSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6" aria-hidden="true">
      {[0, 1].map((row) => (
        <div key={row} className="mb-16 space-y-8">
          <div className="mx-auto h-10 w-64 animate-pulse rounded bg-muted" />
          <div className={productGrid}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-3">
                <div className="aspect-square w-full animate-pulse rounded-2xl bg-muted" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-5 w-1/3 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyStore() {
  return (
    <div className="mx-auto my-16 w-full max-w-7xl px-4 sm:px-6">
      <div className="rounded-2xl border border-dashed p-12 text-center">
        <h2 className="text-lg font-medium">The shelves are still being stocked</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Our catalogue is on its way. Check back soon.
        </p>
      </div>
    </div>
  )
}

function StoreUnavailable() {
  return (
    <div className="mx-auto my-16 w-full max-w-7xl px-4 sm:px-6">
      <div className="rounded-2xl border border-dashed p-12 text-center">
        <h2 className="text-lg font-medium">We couldn&rsquo;t load the store just now</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Please try again in a moment.
        </p>
      </div>
    </div>
  )
}
