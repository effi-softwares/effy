import type { Banner } from "../promotion-groups"
import Link from "next/link"

import { ArrowRight } from "lucide-react"

import { btnClass } from "@/components/storefront/actions"
import { HERO_THEME, PromoBanner, PromoBubbles, SIDE_THEMES, type PromoTheme } from "@/components/storefront/PromoBanner"
import { cn } from "@/lib/utils"

import type { PlacedBanner } from "../promotion-groups"

import { CopyCodeButton } from "./CopyCodeButton"
import { isDesigned } from "./skin-designed"
import { SkinnedPromotion } from "./SkinnedPromotion"
import { PromoCarousel } from "./PromoCarousel"
import { offerHref } from "./OffersPanels"

/**
 * The promotions hero: a carousel of the `home-hero` group with up to two `home-side` cards. Not in the
 * static shell (held a minute at most, since availability can change), so it streams. The words sit on
 * a drawn promo-colour band (`PromoBanner`), never on uploaded artwork, so white type has one known
 * contrast. The behaviour is the `PromoCarousel` island; every slide is rendered here.
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
 * Slides share one grid cell rather than being pinned to the band, so the band is as tall as its
 * longest slide and a long title is never clipped. The decoration and the bubbles are drawn once,
 * behind every slide.
 *
 * The side cards: one promotion without a code (the whole card is its link) above promotions with
 * one (the code and a copy button), two at most. The first slide is not repeated beside itself.
 */
export function PromoHero({ slides, side }: { slides: PlacedBanner[]; side: PlacedBanner[] }) {
  if (slides.length === 0) return null

  // The cards beside the band are their own display group (`home-side`), two at most.
  const tiles = side.filter((b) => b.key !== slides[0]?.key).slice(0, 2)
  const sideList =
    tiles.length > 0 ? (
      // Stacked, equal rows, and absent below `md` — a phone gets the hero and then the store.
      <ul className="hidden auto-rows-fr gap-4 md:grid">
        {tiles.map((banner, i) => (
          <li key={banner.key} className="flex">
            {isDesigned(banner) ? (
              <SkinnedPromotion banner={banner} groupKey="home-side" imageSizes="(min-width: 1024px) 33vw, 50vw" />
            ) : (
              <SideCard banner={banner} theme={SIDE_THEMES[i % SIDE_THEMES.length]!} />
            )}
          </li>
        ))}
      </ul>
    ) : null

  // When staff have put any hero promotion in a skin, every slide draws itself: a designed one in
  // its skin, a Classic one on the band it always had. All Classic: the hero exactly as before.
  if (slides.some(isDesigned)) {
    return (
      <section aria-roledescription="carousel" aria-label="Promotions" className="container pt-6">
        <div className={tiles.length > 0 ? "grid gap-4 lg:grid-cols-3" : undefined}>
          <div className={cn("relative isolate overflow-hidden rounded-xl", tiles.length > 0 && "lg:col-span-2")}>
            <PromoCarousel backdrop={null}>
              {slides.map((banner) =>
                isDesigned(banner) ? (
                  <SkinnedPromotion key={banner.key} banner={banner} groupKey="home-hero" size="large" imageSizes="(min-width: 1024px) 66vw, 100vw" />
                ) : (
                  <PromoBanner key={banner.key} theme={HERO_THEME} className={cn("grid rounded-xl", BAND_HEIGHT)}>
                    <ClassicSlide banner={banner} controls={slides.length > 1} />
                  </PromoBanner>
                ),
              )}
            </PromoCarousel>
          </div>
          {sideList}
        </div>
      </section>
    )
  }

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
              <ClassicSlide key={banner.key} banner={banner} controls={slides.length > 1} />
            ))}
          </PromoCarousel>
        </PromoBanner>

        {sideList}
      </div>
    </section>
  )
}

/** One slide of the hero band, as before 095. */
function ClassicSlide({ banner, controls }: { banner: PlacedBanner; controls: boolean }) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col items-start justify-center p-8 md:w-1/2",
        // Room for the controls, which sit over the band's bottom edge.
        controls && "pb-14",
      )}
    >
      <p className={cn(eyebrow, "tracking-[0.06em]")}>{banner.label ?? "This week\u2019s offer"}</p>
      <h2 className="mt-3 line-clamp-3 text-3xl leading-tight font-bold tracking-tight sm:text-4xl">{banner.title}</h2>
      {banner.subtitle && <p className="mt-3 max-w-md text-sm opacity-95 sm:text-base">{banner.subtitle}</p>}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Link href={offerHref(banner) ?? "/search"} className={btnClass("outline", "lg", "border-transparent")}>
          Shop now
        </Link>
        <Link href="/search?saleOnly=true" className={btnClass("ghost", "lg", "border-white/60 text-white hover:bg-white/15")}>
          See what&rsquo;s on sale
        </Link>
      </div>
      {banner.terms && <p className="mt-3 text-xs opacity-80">{banner.terms}</p>}
    </div>
  )
}

/**
 * One card beside the hero. With a code: the code in a dashed tag and a copy button, wrapping so the
 * button never leaves the card. Without one: the whole card is the link to where the offer leads.
 */
function SideCard({ banner, theme }: { banner: Banner; theme: PromoTheme }) {
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
