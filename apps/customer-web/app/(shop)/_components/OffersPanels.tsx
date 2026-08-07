import Link from "next/link"

import type { BannerDTO } from "@effy/shared-types"

import { MediaFrame, Scrim, SectionShell, onScrim } from "@/components/storefront/kit"

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
export function OffersPanels({
  banners,
  title = "Offers",
}: {
  banners: BannerDTO[]
  title?: string
}) {
  const offers = banners.slice(0, 3)

  return (
    <SectionShell title={title} headless={offers.length === 0}>
      {offers.length > 0 ? (
        <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
          <OfferPanel banner={offers[0]!} size="large" />
          {offers.length > 1 && (
            <div className="grid gap-4 sm:gap-5">
              {offers.slice(1).map((banner) => (
                <OfferPanel key={banner.key} banner={banner} size="small" />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </SectionShell>
  )
}

function OfferPanel({ banner, size }: { banner: BannerDTO; size: "large" | "small" }) {
  /**
   * ⚠ THE DESTINATION COMES FROM THE BANNER, never from a hand-built string. 029's post-mortem records
   * a banner that pointed every promotion at `/search` — the unfiltered store — for its entire life,
   * carrying none of the promotion's facts, because the code ignored `target` and the test asserted the
   * bug. `href` is the web path the server composed; `target` is the closed vocabulary mobile uses, and
   * it is the fallback here so the two surfaces cannot disagree about where one promotion leads.
   */
  const href =
    banner.href ??
    (banner.target?.kind === "promotion" ? `/promotions/${banner.target.promotionId}` : null)

  const body = (
    <MediaFrame
      src={banner.imageUrl}
      alt=""
      ratio={size === "large" ? "wide" : "banner"}
      fallbackLabel={banner.title.charAt(0).toUpperCase()}
      sizes={size === "large" ? "(min-width: 1024px) 50vw, 100vw" : "(min-width: 1024px) 25vw, 100vw"}
      className={size === "large" ? "h-full min-h-[14rem]" : "min-h-[9rem]"}
    >
      {/* A scrim regardless of the artwork, so the message is legible over anything an operator
          uploads — including a promotion image nobody previewed at this size (FR-017). */}
      <Scrim strength={size === "small" ? "strong" : "standard"} />
      <div className={`absolute inset-x-0 bottom-0 p-5 sm:p-6 ${onScrim}`}>
        <h3 className={size === "large" ? "text-xl font-semibold sm:text-2xl" : "text-base font-semibold"}>
          {banner.title}
        </h3>
        {banner.subtitle && (
          <p className="mt-1 max-w-md text-sm text-white/85">{banner.subtitle}</p>
        )}
        {/* ⚠ 029's carry-forward: a promotion with a minimum must not be advertised WITHOUT its terms.
            FR-037d — a shopper learns of a condition from the banner or from where it leads, never
            first at payment. */}
        {banner.terms && <p className="mt-1 text-xs text-white/75">{banner.terms}</p>}
      </div>
    </MediaFrame>
  )

  // ⚠ A promotion with no destination renders as a non-tappable panel rather than a dead link. A tap
  // that does nothing is worse than no tap (the same rule `BannerTarget` states for mobile).
  return href ? (
    <Link href={href} aria-label={banner.title} className="group block h-full">
      {body}
    </Link>
  ) : (
    body
  )
}
