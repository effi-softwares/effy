import type { Metadata } from "next"
import { Suspense } from "react"

import { PROMOTION_GROUP_KEYS, type StorefrontCategoryDTO, type StorefrontHomeDTO } from "@effy/shared-types"

import { CloudOff, PackageOpen } from "lucide-react"

import { EmptyState } from "@/components/storefront/kit"
import { Loading } from "@/components/ui/skeletons"
import { getCategories } from "@/lib/categories"
import { siteUrl } from "@/lib/config"
import { JsonLd, organizationLd } from "@/lib/json-ld"

import { type HomeSection, composeSections, isEmptyStore } from "./home-composition"
import { getHome } from "./home-data"
import { getPromotionGroups, type GroupBanner } from "./promotion-groups"

import { AppPromo } from "./_components/AppPromo"
import { CategoryStrip, CategoryStripSkeleton } from "./_components/CategoryStrip"
import { HomeShortcuts } from "./_components/HomeShortcuts"
import { PromoHero, PromoHeroSkeleton } from "./_components/PromoHero"
import { OffersPanels } from "./_components/OffersPanels"
import { ProductRail, ProductRailSkeleton } from "./_components/ProductRail"
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
 * The storefront home, guest-first. Hero band, merchandising rails, the category mosaic and the closing
 * CTA; no brand strip (Effy is one brand) and no testimonials (there are no reviews). The static shell
 * prerenders; the rails stream inside a <Suspense>, degrading to a skeleton and then an empty or error
 * state.
 */
export default function HomePage() {
  return (
    <>
      <JsonLd data={organizationLd(siteUrl())} />

      {/* Static shell — in the prerender, present in the raw HTML a crawler receives, and
          Not gated on the catalogue read below.

          The H1 is screen-reader-only and every section — including the hero — heads itself at H2.
          The page therefore has exactly one top-level heading no matter which sections have data
          , which is the one structural invariant that has to survive all six 039 sections
          landing one at a time.

          Replaces 025's type-led hero with an image-led one. 025's note here argued a retail
          storefront should lead with what is on offer rather than a slogan, and put the promo carousel
          in the top slot; the operator's 039 direction is a hero band, and the offers now get their
          own dedicated panels further down (contract rows 3 and 6) rather than the first screen. */}
      <h1 className="sr-only">Effy — groceries, delivered</h1>

      {/* Its own suspense boundary, at page level — not inside `HomeContent` (operator direction,
          2026-08-09). It cannot join the static shell the way `Hero` does, because it is built from
          advertised promotions, which are kept a minute at most and never prerendered. But it must
          not be behind the merchandising hole either: sharing that boundary made the page's largest element wait on the
          category read it has no use for, and put the whole first screen behind whichever of the two
          requests was slower. Its own boundary means it paints as soon as its own data lands.

          Both boundaries read `/storefront/v1/home`; `getHome` is `cache`-wrapped so that is one
          request, by construction rather than by relying on Next's memoization. */}
      <Suspense fallback={<PromoHeroSkeleton />}>
        <PromoHeroSection />
      </Suspense>

      {/* Client island: shown only when the shopper's postcode is outside a serviced zone. */}

      {/* Dynamic hole — the merchandised store, streamed from the backend. */}
      <Suspense fallback={null}>
        <HomeShortcuts />
      </Suspense>
      <Suspense fallback={<HomeSkeleton />}>
        <HomeContent />
      </Suspense>

      {/* Contract row 7 — static shell, no request-time data, present for crawlers. It sits
          After the streamed merchandising hole in the document, which is where a shopper meets it, and
          still prerenders because it is outside the <Suspense> boundary. */}
      <AppPromo />

      {/* Contract row 9 — static shell. The form posts to a Server Action; only its result state needs
          a client boundary (see NewsletterForm's header for why FR-033 forces one). */}

      {/* Device-local recently-viewed (client island). */}
      <RecentlyViewedRail />
    </>
  )
}

/** The promotions band. A failed read renders nothing: `HomeContent` owns the "store unavailable" message for the same payload. */
async function PromoHeroSection() {
  let groups: Record<string, GroupBanner[]>
  try {
    groups = await getPromotionGroups(PROMOTION_GROUP_KEYS.homeHero, PROMOTION_GROUP_KEYS.homeSide)
  } catch {
    return null
  }
  return <PromoHero slides={groups[PROMOTION_GROUP_KEYS.homeHero] ?? []} side={groups[PROMOTION_GROUP_KEYS.homeSide] ?? []} />
}

async function HomeContent() {
  let home: StorefrontHomeDTO
  let categories: StorefrontCategoryDTO[]
  let between: GroupBanner[] | undefined
  try {
    ;[home, categories, between] = await Promise.all([
      getHome(),
      getCategories(),
      // The offers between Home's sections are their own display group. A failed read leaves
      // them out; it never takes the page down.
      getPromotionGroups(PROMOTION_GROUP_KEYS.homeBetween).then((g) => g[PROMOTION_GROUP_KEYS.homeBetween] ?? [], () => undefined),
    ])
  } catch {
    return <StoreUnavailable />
  }

  // "Empty" is decided from the products, not the rail count. A server that returns four rails with
  // nothing in them is an empty store, and the previous `rails.length === 0` check called that a full
  // one — then rendered four headings above four blank spaces.
  if (isEmptyStore(home)) {
    return <EmptyStore />
  }

  const sections = composeSections(home, categories, between)
  if (sections.length === 0) {
    return <EmptyStore />
  }

  const firstRail = sections.find((section) => section.kind === "rail")

  return (
    <>
      {/* The page renders a composed sequence, it does not decide the order here. `composeSections`
          owns the top-to-bottom argument and the self-hiding rule so both are unit
          testable — rendering async Server Components is exactly what Vitest cannot do.

          Retires `CategoryMosaic`, which used to sit at the bottom of this page. The mosaic was a
          discovery block a shopper reached after scrolling the whole storefront; the shortcut strip is
          a navigation affordance, and navigation belongs before the thing it navigates. The file is
          deleted rather than left unused — its only call site was here. */}
      {sections.map((section) => (
        <div key={sectionKey(section)}>
          {section.kind === "categories" && <CategoryStrip categories={section.categories} />}
          {section.kind === "offers" && (
            <OffersPanels banners={section.banners} title={section.title} />
          )}
          {section.kind === "rail" && (
            <ProductRail
              title={section.rail.title}
              products={section.rail.products}
              href={section.href}
              priority={section === firstRail}
            />
          )}
          {/* The reference closes each merchandising section with a hairline rule. */}
        </div>
      ))}
    </>
  )
}

/** A stable React key per section — `kind` alone repeats once several rails are on the page. */
function sectionKey(section: HomeSection): string {
  return section.kind === "rail" ? `rail:${section.key}` : section.kind
}

/** The streaming fallback: the aisle strip and two rails, drawn by those components' own skeletons so the swap does not jump. */
function HomeSkeleton() {
  return (
    <Loading label="Loading the store">
      <CategoryStripSkeleton />
      <ProductRailSkeleton />
      <ProductRailSkeleton />
    </Loading>
  )
}

/** Both degraded states offer a way forward: other routes may well be fine. */
function EmptyStore() {
  return (
    <div className="container my-16">
      <EmptyState
        icon={PackageOpen}
        title="The shelves are still being stocked"
        description="Our catalogue is on its way. Search is open if you know what you're after."
        action={{ label: "Search the store", href: "/search" }}
      />
    </div>
  )
}

function StoreUnavailable() {
  return (
    <div className="container my-16">
      <EmptyState
        icon={CloudOff}
        title="We couldn't load the store just now"
        description="This is on us, not you. Reloading usually sorts it — or browse all products directly."
        action={{ label: "Browse products", href: "/search" }}
      />
    </div>
  )
}
