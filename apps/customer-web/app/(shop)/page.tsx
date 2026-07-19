import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import type { StorefrontCategoryDTO, StorefrontHomeDTO } from "@effy/shared-types"

import { coreApi, uncached } from "@/lib/api/core"
import { siteUrl } from "@/lib/config"
import { JsonLd, organizationLd } from "@/lib/json-ld"

import { CategoryChips } from "./_components/CategoryChips"
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
 * The static shell (H1, the search entry) prerenders and is present in the raw HTML for crawlers
 * (FR-002). The merchandised rails depend on `core-api` (the hot path, local-only this slice), so they
 * stream inside a <Suspense> boundary — the PPR model: instant static shell + dynamic content that
 * degrades to a skeleton then a friendly empty/error state. When the hot path deploys, this can move to
 * `"use cache"` with no structural change.
 */
export default function HomePage() {
  return (
    <>
      <JsonLd data={organizationLd(siteUrl())} />

      {/* Static shell — in the prerender, present in raw HTML. */}
      <section className="mx-auto w-full max-w-7xl">
        <div className="px-4 pt-6 sm:px-6">
          <h1 className="sr-only">Effy — groceries, delivered</h1>
          <Link
            href="/search"
            className="flex h-11 w-full items-center rounded-full border bg-muted/50 px-4 text-sm text-muted-foreground hover:bg-muted"
            aria-label="Search products"
          >
            Search groceries, brands and more…
          </Link>
        </div>

        {/* Dynamic hole — the merchandised store, streamed from the hot path. */}
        <Suspense fallback={<HomeSkeleton />}>
          <HomeContent />
        </Suspense>

        {/* Device-local recently-viewed (client island). */}
        <RecentlyViewedRail />
      </section>
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
      <CategoryChips categories={categories} />
      {home.rails.map((rail) => (
        <ProductRail key={rail.key} title={rail.title} products={rail.products} />
      ))}
    </>
  )
}

function HomeSkeleton() {
  return (
    <div className="space-y-6 px-4 py-6 sm:px-6" aria-hidden="true">
      <div className="h-40 w-full animate-pulse rounded-xl bg-muted" />
      {[0, 1].map((row) => (
        <div key={row} className="space-y-3">
          <div className="h-5 w-40 animate-pulse rounded bg-muted" />
          <div className="flex gap-3 overflow-hidden">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-56 w-40 shrink-0 animate-pulse rounded-lg bg-muted sm:w-48" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyStore() {
  return (
    <div className="mx-4 my-10 rounded-lg border border-dashed p-12 text-center sm:mx-6">
      <h2 className="text-lg font-medium">The shelves are still being stocked</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Our catalogue is on its way. Check back soon.
      </p>
    </div>
  )
}

function StoreUnavailable() {
  return (
    <div className="mx-4 my-10 rounded-lg border border-dashed p-12 text-center sm:mx-6">
      <h2 className="text-lg font-medium">We couldn’t load the store just now</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Please try again in a moment.
      </p>
    </div>
  )
}
