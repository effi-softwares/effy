import type { Banner } from "../promotion-groups"
import Link from "next/link"

import { ArrowRight } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { SectionShell } from "@/components/storefront/kit"
import { OFFER_THEMES, PromoBanner, type PromoTheme } from "@/components/storefront/PromoBanner"

import type { PlacedBanner } from "../promotion-groups"

import { isDesigned } from "./skin-designed"
import { SkinnedPromotion } from "./SkinnedPromotion"

/**
 * The promotional offers block: one large panel beside two stacked (three or more promotions), two
 * equal panels (two), one wide panel (one), nothing at all (none). Fed by `inline`-placement banners. No
 * placeholder tile: an empty frame reads as a broken advert.
 */
export function offerHref(banner: Banner): string | null {
  return banner.href ?? (banner.target?.kind === "promotion" ? `/promotions/${banner.target.promotionId}` : null)
}

/**
 * The home "Offers" row (reference: Home · Offers): up to three cards, each a 16:9 promo banner
 * carrying the offer's name over a line about it and a way in.
 *
 * The reference's aisle words ("Bakery offer", the "Bakery" badge) are sample content - a promotion
 * has no aisle scope, so none is invented here. The banner says "Offer", and the
 * badge appears only for the one thing that is true of a promotion today: it carries a code.
 */
export function OffersPanels({
  banners,
  title = "Offers",
}: {
  banners: PlacedBanner[]
  title?: string
}) {
  const offers = banners.slice(0, 3)
  return (
    <SectionShell title={title} href="/offers" linkLabel="All offers" headless={offers.length === 0}>
      {offers.length > 0 ? (
        <ul className="grid gap-4 md:grid-cols-3">
          {offers.map((banner, i) => (
            <li key={banner.key}>
              {isDesigned(banner) ? (
                <SkinnedPromotion banner={banner} groupKey="home-between" imageSizes="(min-width: 768px) 33vw, 100vw" />
              ) : (
                <OfferBannerCard banner={banner} theme={OFFER_THEMES[i % OFFER_THEMES.length]!} />
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </SectionShell>
  )
}

/**
 * One home offer: the banner on top, the words about it below, the whole card one link.
 *
 * `imageUrl` is not `banner.imageUrl`, and the home page does not pass it yet. It is the slot for a
 * real 16:9 promo image: given one, the drawn banner is replaced by it at the same size and the
 * offer's name moves below it - the name stays real text, and is never laid on artwork nobody has
 * measured for contrast.
 */
export function OfferBannerCard({
  banner,
  theme,
  imageUrl,
}: {
  banner: Banner
  theme: PromoTheme
  imageUrl?: string | null
}) {
  const href = offerHref(banner)
  const name = "text-2xl leading-[1.1] font-semibold tracking-[-0.02em]"
  return (
    <Card padded={false} className="relative h-full overflow-hidden">
      <PromoBanner theme={theme} imageUrl={imageUrl} arcOpacity={0.35} className="aspect-video">
        {!imageUrl && (
          <div className="absolute top-5 right-[45%] left-5">
            <p className="text-xs font-semibold tracking-[0.08em] uppercase opacity-85">Offer</p>
            <h3 className={`mt-2 ${name}`}>{banner.title}</h3>
          </div>
        )}
      </PromoBanner>
      <div className="flex flex-col items-start px-5 pt-4">
        {imageUrl && <h3 className={`mb-2 ${name}`}>{banner.title}</h3>}
        {banner.code && <Badge variant="secondary">Code</Badge>}
        {banner.subtitle && <p className="mt-2 text-sm text-muted-foreground">{banner.subtitle}</p>}
        {banner.terms && <p className="mt-1 text-xs text-muted-foreground">{banner.terms}</p>}
      </div>
      <div className="mt-auto px-5 pt-3 pb-5">
        {href && (
          <Link
            href={href}
            aria-label={`View offer: ${banner.title}`}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary after:absolute after:inset-0"
          >
            View offer
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        )}
      </div>
    </Card>
  )
}

/** The plain offer card the Offers index still uses. */
export function OfferCard({ banner }: { banner: Banner }) {
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
