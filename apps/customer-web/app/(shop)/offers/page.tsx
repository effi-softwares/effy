import type { Banner } from "../promotion-groups"
import type { Metadata } from "next"
import { Suspense } from "react"
import { Tag } from "lucide-react"
import { PROMOTION_GROUP_KEYS } from "@effy/shared-types"

import { EmptyState } from "@/components/storefront/kit"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Breadcrumb, Skeleton } from "@/components/ui/misc"

import { getPromotionGroups, type PlacedBanner } from "../promotion-groups"
import { CopyCodeButton } from "../_components/CopyCodeButton"
import { OfferCard } from "../_components/OffersPanels"
import { isDesigned } from "../_components/skin-designed"
import { SkinnedPromotion } from "../_components/SkinnedPromotion"

export const metadata: Metadata = {
  title: "Offers",
  description: "Current Effy promotions and codes. Codes are entered in your cart.",
  alternates: { canonical: "/offers" },
}

/**
 * Offers: every advertised promotion, from the home payload (`getHome`, the same visibility rule as the
 * single-offer page). No filter chips: promotions carry no aisle or product scope to filter on.
 */
export default function OffersPage() {
  return (
    <div className="container py-6">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Offers" }]} />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">Offers</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Current promotions and codes. Codes are entered in your cart.
      </p>
      <div className="mt-6">
        <Suspense
          fallback={
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-44 rounded-lg" />
              ))}
            </div>
          }
        >
          <OfferList />
        </Suspense>
      </div>
    </div>
  )
}

async function OfferList() {
  let offers: PlacedBanner[]
  try {
    // The Offers page is its own display group.
    offers = (await getPromotionGroups(PROMOTION_GROUP_KEYS.offers))[PROMOTION_GROUP_KEYS.offers] ?? []
  } catch {
    return (
      <EmptyState
        icon={Tag}
        title="We couldn't load offers just now"
        description="This is on us, not you. Please try again in a moment."
        action={{ label: "Browse products", href: "/search" }}
      />
    )
  }

  if (offers.length === 0) {
    return (
      <EmptyState
        icon={Tag}
        title="No offers right now"
        description="Check back soon — or see what's on sale today."
        action={{ label: "See what's on sale", href: "/search?saleOnly=true" }}
      />
    )
  }

  return (
    <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {offers.map((offer) => (
        <li key={offer.key}>
          {isDesigned(offer) ? (
            <SkinnedPromotion banner={offer} groupKey="offers" imageSizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw" />
          ) : offer.code ? (
            <CodeOffer offer={offer} />
          ) : (
            <OfferCard banner={offer} />
          )}
        </li>
      ))}
    </ul>
  )
}

/** An offer with a code: the code is the point, so it is on the card with its Copy button. */
function CodeOffer({ offer }: { offer: Banner }) {
  return (
    <Card className="h-full gap-3 p-5">
      <Badge variant="primary-muted" className="self-start">
        Code
      </Badge>
      <h2 className="font-semibold">
        <a href={offer.href ?? "#"} className="hover:underline">
          {offer.title}
        </a>
      </h2>
      {offer.subtitle && <p className="text-sm text-muted-foreground">{offer.subtitle}</p>}
      {offer.terms && <p className="text-xs text-muted-foreground">{offer.terms}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
        <span className="rounded-md border px-2 py-1 font-mono text-sm font-medium">{offer.code}</span>
        <CopyCodeButton code={offer.code!} />
      </div>
    </Card>
  )
}
