import Link from "next/link"

import type { BannerDTO } from "@effy/shared-types"

import { ArrowRight } from "lucide-react"

import { btnClass } from "@/components/storefront/actions"
import { HERO_THEME, PromoBanner, PromoBubbles, SIDE_THEMES, type PromoTheme } from "@/components/storefront/PromoBanner"
import { cn } from "@/lib/utils"

import { CopyCodeButton } from "./CopyCodeButton"
import { PromoCarousel } from "./PromoCarousel"
import { offerHref } from "./OffersPanels"

/**
 * THE PROMOTIONS HERO — a carousel of every advertised promotion, with two promo cards beside it.
 *
 * ⚠ IT CANNOT LIVE IN THE STATIC SHELL. It is built from `home.banners`, which comes from an
 * `uncached()` read — deliberately uncached, because "this offer is still available" is a live claim
 * another shopper can falsify (029). So the page's largest element arrives by stream.
 *
 * ⚠ THE WORDS SIT ON A DRAWN BANNER, NOT ON ARTWORK (2026-10-12). The band is a flat promo colour with
 * a white decoration and icon bubbles (`PromoBanner`), so white type reads at one known contrast
 * whatever a promotion uploads. A promotion's `imageUrl` is not drawn here.
 *
 * ⚠ IT IS A REAL CAROUSEL NOW (operator direction, 2026-10-12): previous / dots / pause / next, and
 * the move between slides animated with Motion. That replaced the CSS-only rotation and its generated
 * keyframes, which existed to keep script off this band. The behaviour is `PromoCarousel`, a client
 * island; the slides are still rendered here, on the server, and all of them are in the HTML.
 */

/** The band's height, in one place — the skeleton below reserves exactly this. */
const BAND_HEIGHT = "min-h-80"

export function PromoHeroSkeleton() {
  return (
    <div className="container pt-6" aria-hidden="true">
      <div className={`w-full animate-pulse rounded-xl bg-muted ${BAND_HEIGHT}`} />
    </div>
  )
}

const eyebrow = "text-xs font-semibold uppercase opacity-85"

/**
 * The home promo row (reference: Home · hero): a promo-green `rounded-xl` band spanning two of three
 * columns — the offer's words on the left, icon bubbles on the right from `md` — with up to two
 * full-colour cards stacked beside it.
 *
 * ⚠ SLIDES SHARE ONE GRID CELL rather than being pinned to the band, so the band is as tall as its
 * longest slide and a long title is never clipped. The decoration and the bubbles are drawn ONCE,
 * behind every slide.
 *
 * ⚠ The side cards: one promotion WITHOUT a code (the whole card is its link) above promotions WITH
 * one (the code and a copy button), two at most. The first slide is not repeated beside itself.
 */
export function PromoHero({ banners }: { banners: BannerDTO[] }) {
  const slides = banners
  if (slides.length === 0) return null

  const linked = banners.find((b) => !b.code && b !== slides[0] && offerHref(b) !== null)
  const tiles = [...(linked ? [linked] : []), ...banners.filter((b) => Boolean(b.code))].slice(0, 2)

  return (
    <section aria-roledescription="carousel" aria-label="Promotions" className="container pt-6">
      <div className={tiles.length > 0 ? "grid gap-4 lg:grid-cols-3" : undefined}>
        <PromoBanner
          theme={HERO_THEME}
          bubbles={false}
          className={cn("grid rounded-xl", BAND_HEIGHT, tiles.length > 0 && "lg:col-span-2")}
        >
          <PromoCarousel
            backdrop={
              <div aria-hidden="true" className="absolute inset-y-0 right-0 -z-10 hidden w-1/2 md:block">
                <PromoBubbles bubbles={HERO_THEME.bubbles} />
              </div>
            }
          >
            {slides.map((banner) => (
              <div
                key={banner.key}
                className={cn(
                  "flex min-w-0 flex-col items-start justify-center p-8 md:w-1/2",
                  // Room for the controls, which sit over the band's bottom edge.
                  slides.length > 1 && "pb-14",
                )}
              >
                <p className={cn(eyebrow, "tracking-[0.06em]")}>This week&rsquo;s offer</p>
                <h2 className="mt-3 line-clamp-3 text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
                  {banner.title}
                </h2>
                {banner.subtitle && <p className="mt-3 max-w-md text-sm opacity-95 sm:text-base">{banner.subtitle}</p>}
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <Link href={offerHref(banner) ?? "/search"} className={btnClass("outline", "lg", "border-transparent")}>
                    Shop now
                  </Link>
                  <Link
                    href="/search?saleOnly=true"
                    className={btnClass("ghost", "lg", "border-white/60 text-white hover:bg-white/15")}
                  >
                    See what&rsquo;s on sale
                  </Link>
                </div>
                {banner.terms && <p className="mt-3 text-xs opacity-80">{banner.terms}</p>}
              </div>
            ))}
          </PromoCarousel>
        </PromoBanner>

        {tiles.length > 0 && (
          // Stacked, equal rows, and absent below `md` — a phone gets the hero and then the store.
          <ul className="hidden auto-rows-fr gap-4 md:grid">
            {tiles.map((banner, i) => (
              <li key={banner.key} className="flex">
                <SideCard banner={banner} theme={SIDE_THEMES[i % SIDE_THEMES.length]!} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

/**
 * One card beside the hero. With a code: the code in a dashed tag and a copy button, wrapping so the
 * button never leaves the card. Without one: the whole card is the link to where the offer leads.
 */
function SideCard({ banner, theme }: { banner: BannerDTO; theme: PromoTheme }) {
  const href = offerHref(banner)
  const detail = banner.code ? (banner.terms ?? banner.subtitle) : banner.subtitle
  return (
    <PromoBanner theme={theme} className="flex min-h-38 w-full flex-col justify-between rounded-xl p-6">
      <div className="max-w-[62%] space-y-1">
        <p className={cn(eyebrow, "tracking-[0.08em]")}>{banner.code ? "Code" : "Offer"}</p>
        <h3 className="text-[22px] leading-[1.15] font-semibold tracking-[-0.02em]">{banner.title}</h3>
        {detail && <p className="text-sm opacity-90">{detail}</p>}
      </div>
      {banner.code ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex h-8 items-center rounded-md border border-dashed border-white/70 px-3 font-mono font-semibold">
            {banner.code}
          </span>
          <CopyCodeButton code={banner.code} className="border-transparent" />
        </div>
      ) : (
        href && (
          <Link
            href={href}
            aria-label={`Shop now: ${banner.title}`}
            className={btnClass("outline", "sm", "mt-4 self-start border-transparent after:absolute after:inset-0")}
          >
            Shop now
            <ArrowRight aria-hidden="true" />
          </Link>
        )
      )}
    </PromoBanner>
  )
}
