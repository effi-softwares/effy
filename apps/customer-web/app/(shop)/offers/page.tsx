import type { Metadata } from "next"
import { Suspense } from "react"
import { Tag } from "lucide-react"
import type { BannerDTO } from "@effy/shared-types"

import { EmptyState } from "@/components/storefront/kit"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Breadcrumb, Skeleton } from "@/components/ui/misc"

import { getHome } from "../home-data"
import { CopyCodeButton } from "../_components/CopyCodeButton"
import { OfferCard } from "../_components/OffersPanels"

export const metadata: Metadata = {
  title: "Offers",
  description: "Current Effy promotions and codes. Codes are entered in your cart.",
  alternates: { canonical: "/offers" },
}

/**
 * Offers (reference: Product & offers · Offers index; FR-026).
 *
 * ⚠ NO NEW ROUTE WAS NEEDED. The home payload already carries every advertised promotion — the same
 * visibility rule the single-offer page re-checks — so this page reads `getHome()` and lists them.
 * (084's plan proposed `GET /storefront/v1/promotions`; reading the code showed it would have returned
 * what Home already returns, and it would have cost the shared gateway a route.)
 *
 * ⚠ No filter chips. A promotion today is a whole-cart code with no aisle or product scope, and every
 * one of them carries a code — so the reference's "With a code / Fruit & veg / Dairy" chips would
 * filter on facts that do not exist (084 research D7).
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
  let offers: BannerDTO[]
  try {
    offers = (await getHome()).banners
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
          {offer.code ? <CodeOffer offer={offer} /> : <OfferCard banner={offer} />}
        </li>
      ))}
    </ul>
  )
}

/** An offer with a code: the code is the point, so it is on the card with its Copy button. */
function CodeOffer({ offer }: { offer: BannerDTO }) {
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
