import Link from "next/link"

import type { BannerDTO } from "@effy/shared-types"

import { ArrowRight } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { SectionShell } from "@/components/storefront/kit"

/**
 * The promotional offers block (039 US4, FR-017/FR-018/FR-020) — the reference's one-large-plus-two-
 * stacked composition, driven by advertised promotions.
 *
 * ⚠ FED BY `inline`-PLACEMENT BANNERS, NOT `"offers"`. `BannerPlacement` is `"carousel" | "inline"`
 * (`packages/shared-types/src/banner.ts`); 039's spec and contract originally named an `offers`
 * placement that **does not exist**, which would have matched nothing and rendered this block as
 * absent — a *valid* state under FR-018, so it would not have looked like a bug. The dedicated offers
 * placement 029 created is `inline`.
 *
 * ⚠ THE COMPOSITION DEGRADES, IT DOES NOT PAD (FR-018). With three or more promotions: one large panel
 * beside two stacked. With two: two equal panels. With one: a single wide panel. With none: the section
 * renders nothing at all. There is deliberately no placeholder tile — an empty frame in a promotional
 * block reads as a broken advert, and a shopper cannot tell it from a promotion that failed to load.
 */
export function offerHref(banner: BannerDTO): string | null {
  return banner.href ?? (banner.target?.kind === "promotion" ? `/promotions/${banner.target.promotionId}` : null)
}

/**
 * The home "Offers" row (reference: Home · Offers): up to three bordered cards — what the offer is, a
 * line about it, and a way in.
 *
 * ⚠ The badge says only what is true of a promotion today: it either carries a code or it does not.
 * The reference's aisle tags ("Bakery", "Drinks") are sample content — a promotion has no aisle scope
 * (084 research D7), so none is invented here.
 */
export function OffersPanels({
  banners,
  title = "Offers",
}: {
  banners: BannerDTO[]
  title?: string
}) {
  const offers = banners.slice(0, 3)
  return (
    <SectionShell title={title} href="/offers" linkLabel="All offers" headless={offers.length === 0}>
      {offers.length > 0 ? (
        <ul className="grid gap-4 md:grid-cols-3">
          {offers.map((banner) => (
            <li key={banner.key}>
              <OfferCard banner={banner} />
            </li>
          ))}
        </ul>
      ) : null}
    </SectionShell>
  )
}

export function OfferCard({ banner }: { banner: BannerDTO }) {
  const href = offerHref(banner)
  return (
    <Card className="relative h-full gap-3 p-5">
      <Badge variant="secondary" className="self-start">
        {banner.code ? "Code" : "Offer"}
      </Badge>
      <h3 className="font-semibold">{banner.title}</h3>
      {banner.subtitle && <p className="text-sm text-muted-foreground">{banner.subtitle}</p>}
      {banner.terms && <p className="text-xs text-muted-foreground">{banner.terms}</p>}
      {href && (
        <Link
          href={href}
          aria-label={`View offer: ${banner.title}`}
          className="mt-auto inline-flex items-center gap-1 pt-2 text-sm font-medium text-primary after:absolute after:inset-0"
        >
          View offer
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      )}
    </Card>
  )
}
