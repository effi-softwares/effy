import type { Metadata } from "next"
import { Suspense } from "react"

import type { StorefrontCategoryDTO, StorefrontHomeDTO } from "@effy/shared-types"

import { EmptyState } from "@/components/storefront/kit"
import { coreApi, uncached } from "@/lib/api/core"
import { siteUrl } from "@/lib/config"
import { JsonLd, organizationLd } from "@/lib/json-ld"

import { type HomeSection, composeSections, isEmptyStore } from "./home-composition"

import { AppPromo } from "./_components/AppPromo"
import { CategoryStrip } from "./_components/CategoryStrip"
import { Hero } from "./_components/Hero"
import { OffersPanels } from "./_components/OffersPanels"
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

      {/* Static shell — in the prerender, present in the raw HTML a crawler receives (FR-040), and
          NOT gated on the catalogue read below (FR-012).

          ⚠ The H1 is screen-reader-only and every section — including the hero — heads itself at H2.
          The page therefore has exactly one top-level heading no matter which sections have data
          (SC-009), which is the one structural invariant that has to survive all six 039 sections
          landing one at a time.

          ⚠ 039 REPLACES 025's type-led hero with an image-led one. 025's note here argued a retail
          storefront should lead with what is on offer rather than a slogan, and put the promo carousel
          in the top slot; the operator's 039 direction is a hero band, and the offers now get their
          own dedicated panels further down (contract rows 3 and 6) rather than the first screen. */}
      <h1 className="sr-only">Effy — groceries, delivered</h1>
      <Hero />

      {/* Client island: shown only when the shopper's postcode is outside a serviced zone. */}

      {/* Dynamic hole — the merchandised store, streamed from the hot path. */}
      <Suspense fallback={<HomeSkeleton />}>
        <HomeContent />
      </Suspense>

      {/* Contract row 7 — static shell, no request-time data, present for crawlers (FR-040). It sits
          AFTER the streamed merchandising hole in the document, which is where a shopper meets it, and
          still prerenders because it is outside the <Suspense> boundary. */}
      <AppPromo />

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

  // ⚠ "Empty" is decided from the PRODUCTS, not the rail count. A server that returns four rails with
  // nothing in them is an empty store, and the previous `rails.length === 0` check called that a full
  // one — then rendered four headings above four blank spaces (FR-016).
  if (isEmptyStore(home)) {
    return <EmptyStore />
  }

  const sections = composeSections(home, categories)
  if (sections.length === 0) {
    return <EmptyStore />
  }

  return (
    <>
      {/* ⚠ The page RENDERS A COMPOSED SEQUENCE, it does not decide the order here. `composeSections`
          owns the top-to-bottom argument (FR-001) and the self-hiding rule (FR-004) so both are unit
          testable — rendering async Server Components is exactly what Vitest cannot do.

          ⚠ 039 RETIRES `CategoryMosaic`, which used to sit at the BOTTOM of this page. The mosaic was a
          discovery block a shopper reached after scrolling the whole storefront; the shortcut strip is
          a navigation affordance, and navigation belongs before the thing it navigates. The file is
          deleted rather than left unused — its only call site was here. */}
      {sections.map((section, i) => (
        <div key={sectionKey(section)}>
          {section.kind === "categories" && <CategoryStrip categories={section.categories} />}
          {section.kind === "carousel" && <PromoCarousel banners={section.banners} />}
          {section.kind === "offers" && (
            <OffersPanels banners={section.banners} title={section.title} />
          )}
          {section.kind === "rail" && (
            <ProductRail
              title={section.rail.title}
              products={section.rail.products}
              href={section.href}
            />
          )}
          {/* The reference closes each merchandising section with a hairline rule. */}
          {section.kind === "rail" && i < sections.length - 1 && (
            <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
              <hr className="border-border" />
            </div>
          )}
        </div>
      ))}
    </>
  )
}

/** A stable React key per section — `kind` alone repeats once several rails are on the page. */
function sectionKey(section: HomeSection): string {
  return section.kind === "rail" ? `rail:${section.key}` : section.kind
}

/**
 * The streaming fallback.
 *
 * ⚠ BUILT FROM THE SAME PRIMITIVES AS THE CONTENT, deliberately. 028 shipped a skeleton assembled from
 * different building blocks than the thing it stood in for, so it could not match its shape at any
 * width and the swap-in visibly jumped. It now mirrors the real sequence: a category strip of circles,
 * then two product rails on the shared `productGrid`.
 */
function HomeSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6" aria-hidden="true">
      {/* The category strip — circles, matching CategoryStrip's tiles rather than generic bars. */}
      <div className="mb-16 space-y-8">
        <div className="h-9 w-64 animate-pulse rounded bg-muted" />
        <div className="flex gap-6 sm:gap-8">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="flex w-24 shrink-0 flex-col items-center gap-3 sm:w-28">
              <div className="w-20 animate-pulse rounded-full bg-muted pb-[100%] sm:w-24" />
              <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>

      {[0, 1].map((row) => (
        <div key={row} className="mb-16 space-y-8">
          <div className="h-9 w-64 animate-pulse rounded bg-muted" />
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

/**
 * ⚠ BOTH DEGRADED STATES OFFER A WAY FORWARD (FR-016/FR-043). They previously explained themselves and
 * then dead-ended — "check back soon" and "try again in a moment" with nothing to press. A shopper who
 * reached the storefront and found nothing has to be able to do something other than leave, and on a
 * catalogue error the other routes may well be fine.
 */
function EmptyStore() {
  return (
    <div className="mx-auto my-16 w-full max-w-7xl px-4 sm:px-6">
      <EmptyState
        title="The shelves are still being stocked"
        description="Our catalogue is on its way. Search is open if you know what you're after."
        action={{ label: "Search the store", href: "/search" }}
      />
    </div>
  )
}

function StoreUnavailable() {
  return (
    <div className="mx-auto my-16 w-full max-w-7xl px-4 sm:px-6">
      <EmptyState
        title="We couldn&rsquo;t load the store just now"
        description="This is on us, not you. Reloading usually sorts it — or browse the categories directly."
        action={{ label: "Browse categories", href: "/browse" }}
      />
    </div>
  )
}
