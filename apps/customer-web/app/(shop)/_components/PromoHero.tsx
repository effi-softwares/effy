import Link from "next/link"

import type { BannerDTO } from "@effy/shared-types"

import { btnClass } from "@/components/storefront/kit"

import { CopyCodeButton } from "./CopyCodeButton"
import { offerHref } from "./OffersPanels"

/**
 * THE PROMOTIONS HERO — a full-bleed carousel of every advertised promotion.
 *
 * ⚠ AN ALTERNATIVE TO `Hero`, NOT A REPLACEMENT (operator direction, 2026-08-09). Both render on the
 * home page while they are being compared. `Hero` is untouched.
 *
 * ⚠ IT CANNOT LIVE IN THE STATIC SHELL. `Hero` fetches nothing, so it prerenders into the cached
 * shell and is in the raw HTML a crawler receives (FR-012/FR-040). This one is built from
 * `home.banners`, which comes from an `uncached()` read — deliberately uncached, because "this offer
 * is still available" is a live claim another shopper can falsify (029). So the page's largest
 * element arrives by stream. That is a real LCP difference between the two heroes, and part of what
 * is being compared.
 *
 * ⚠ NO SCRIM, NO TEXT-SHADOW. Several were built and all were removed (operator direction): a
 * full-band gradient, a shortened one, an ellipse, a spread text-shadow, and a blurred shape behind
 * the copy. Each either dimmed the photograph the promotion is selling with, or read as an object
 * sitting on top of it. White type now sits directly on the artwork.
 *
 * ⚠⚠ THE CONSEQUENCE, STATED SO IT IS NOT REDISCOVERED: legibility is now a property of the ARTWORK.
 * Banner images are operator-uploaded and the conformance check verifies DIMENSIONS, not brightness,
 * so a pale banner will render white-on-white with nothing failing — no test, no guard, no build
 * error. `Hero` has the same exposure and answers it with a written rule plus per-image contrast
 * measurements in `public/hero/README.md`; this surface has no equivalent. Whoever advertises a
 * promotion owns that check.
 *
 * ── Zero JavaScript, and why the keyframes are generated ────────────────────────────────────────
 *
 * shadcn's Carousel is embla + radix and GSAP is a library — both are out: `radix-ui`/`vaul`/`sonner`
 * are banned from `app/(shop)/` by `contracts/customer-ui.contract.md §1`, and `/` has ~0.1 KB of its
 * 174 KB guest budget left. `Hero` hand-writes its keyframes in `globals.css` because it always has
 * six slides; this one cannot, because the number of advertised promotions is whatever the operator
 * has running and a keyframe percentage cannot be derived from a custom property. So the rule set is
 * composed on the server and emitted as a `<style precedence>`, which React 19 hoists and dedupes.
 */

/** Seconds each promotion holds the band. */
const DWELL = 10
/** Seconds of crossfade between promotions. */
const FADE = 1

/**
 * The keyframes for exactly `count` slides.
 *
 * ⚠ THE HANDOVER IS THE HARD PART. A naive crossfade — outgoing 1→0 while incoming 0→1 — leaves both
 * layers near 0.5 mid-fade, so the page background shows through and the band dips on every change.
 * Slides stack in DOM order, so the fix is to never have two partial layers over nothing: each fades
 * IN while the one below is still opaque, and fades OUT only after its successor covers it. The WRAP
 * is why that second fade exists — the last slide has no successor above it, so slide 1 (already
 * faded in underneath) is revealed by the last one fading out. One rule set, no special case.
 *
 * ⚠ `visibility` IS ANIMATED ALONGSIDE OPACITY. An `opacity: 0` element is still hit-tested, still
 * focusable and still in the accessibility tree — so the last slide would swallow every click, and a
 * keyboard user would tab through N sets of buttons of which N-1 are invisible.
 */
export function keyframesFor(count: number): string {
  const cycle = count * DWELL
  const pct = (seconds: number) => (seconds / cycle) * 100

  // A shade EARLY, so slide 1 — which carries a negative delay — is fully opaque on the first painted
  // frame. It is the LCP element, and Chrome does not record LCP for a transparent one.
  const fadeIn = pct(FADE) * 0.95
  // A shade LATE, so a slide starts hiding only once its successor has covered it. Early by a frame
  // and the background flickers through.
  const holdEnd = pct(DWELL + FADE) + 0.07
  const hidden = pct(DWELL + 2 * FADE)

  const r = (n: number) => Number(n.toFixed(3))

  return [
    `.fx-promo-${count}>*{opacity:0;visibility:hidden;animation:fx-promo-${count} ${cycle}s linear infinite;animation-delay:calc(var(--fx-promo-i) * ${DWELL}s - ${FADE}s)}`,
    // WCAG 2.2.2 — auto-updating content running past five seconds needs a way to stop it.
    // `:focus-within` is the half that matters; hover alone leaves keyboard users with no mechanism.
    `.fx-promo-${count}:hover>*,.fx-promo-${count}:focus-within>*{animation-play-state:paused}`,
    `@keyframes fx-promo-${count}{`,
    `0%{opacity:0;visibility:visible}`,
    `${r(fadeIn)}%,${r(holdEnd)}%{opacity:1;visibility:visible}`,
    `${r(hidden)}%{opacity:0;visibility:visible}`,
    `${r(hidden + 0.01)}%,100%{opacity:0;visibility:hidden}`,
    `}`,
    // FR-025 — motion is decoration, never information.
    `@media(prefers-reduced-motion:reduce){`,
    `.fx-promo-${count}>*{animation:none}`,
    `.fx-promo-${count}>:first-child{opacity:1;visibility:visible}`,
    `}`,
  ].join("")
}

/** The band's height, in one place — the skeleton below reserves exactly this. */
const BAND_HEIGHT = "min-h-[21rem] lg:min-h-[22rem]"

export function PromoHeroSkeleton() {
  return (
    <div className="container pt-6" aria-hidden="true">
      <div className={`w-full animate-pulse rounded-xl bg-muted ${BAND_HEIGHT}`} />
    </div>
  )
}

/**
 * The home banner (reference: Home · hero): a green `rounded-xl` panel inside the content column —
 * the offer's words on the left, its artwork in a well on the right — with up to two code tiles
 * beside it on wide screens.
 *
 * ⚠ FLAT GREEN, NO SCRIM. The words sit on the brand colour, not on the photograph, so they read at
 * the same contrast whatever artwork back-office uploads. That is why the artwork is in its own well.
 *
 * ⚠ The rotation is still CSS-only (`keyframesFor`), paused on hover and on focus, stopped under
 * reduced motion. The reference draws previous / next / pause buttons; they are NOT built — they need
 * script on the largest element of the guest path, and hover-or-focus already pauses it.
 *
 * ⚠ The side tiles are promotions that carry a CODE, and only those. A banner without one has nothing
 * to hand over in a 13rem tile.
 */
export function PromoHero({ banners }: { banners: BannerDTO[] }) {
  const slides = banners.filter((b) => Boolean(b.imageUrl))
  if (slides.length === 0) return null

  const rotates = slides.length > 1
  const tiles = banners.filter((b) => Boolean(b.code)).slice(0, 2)

  return (
    <section aria-label="Promotions" className="container pt-6">
      <div className={tiles.length > 0 ? "grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]" : undefined}>
        <div className={`relative overflow-hidden rounded-xl bg-brand text-brand-foreground ${BAND_HEIGHT}`}>
          {rotates && (
            <style href={`fx-promo-${slides.length}`} precedence="default">
              {keyframesFor(slides.length)}
            </style>
          )}
          <div className={rotates ? `fx-promo-${slides.length}` : undefined}>
            {slides.map((banner, i) => (
              <div
                key={banner.key}
                style={{ "--fx-promo-i": i } as React.CSSProperties}
                className="absolute inset-0 grid items-center gap-6 p-6 sm:p-8 lg:grid-cols-2"
              >
                <div className="flex min-w-0 flex-col items-start">
                  <p className="text-xs font-semibold tracking-widest uppercase opacity-90">This week&rsquo;s offer</p>
                  <h2 className="mt-3 line-clamp-3 text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
                    {banner.title}
                  </h2>
                  {banner.subtitle && <p className="mt-3 max-w-md text-sm opacity-95 sm:text-base">{banner.subtitle}</p>}
                  <div className="mt-6 flex flex-wrap items-center gap-2">
                    <Link
                      href={offerHref(banner) ?? "/search"}
                      className={btnClass("outline", "lg", "border-transparent")}
                    >
                      Shop now
                    </Link>
                    <Link
                      href="/search?saleOnly=true"
                      className={btnClass("ghost", "lg", "border-white/60 text-brand-foreground hover:bg-white/15")}
                    >
                      See what&rsquo;s on sale
                    </Link>
                  </div>
                  {banner.terms && <p className="mt-4 text-xs opacity-85">{banner.terms}</p>}
                </div>
                <div className="relative hidden h-full min-h-56 overflow-hidden rounded-lg bg-white/10 lg:block">
                  {/* Decorative: the offer is said in the words beside it. */}
                  <img
                    src={banner.imageUrl!}
                    alt=""
                    fetchPriority={i === 0 ? "high" : "low"}
                    decoding={i === 0 ? "sync" : "async"}
                    className="absolute inset-0 size-full object-cover"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {tiles.length > 0 && (
          <ul className="grid grid-cols-2 gap-4 lg:w-[27rem]">
            {tiles.map((banner) => (
              <li key={banner.key} className="flex flex-col rounded-lg border bg-card p-4 shadow-xs">
                <span className="self-start rounded-md bg-primary-muted px-2 py-0.5 text-xs font-semibold text-primary">
                  Code
                </span>
                <h3 className="mt-3 text-sm font-semibold">{banner.title}</h3>
                {banner.terms && <p className="mt-1 text-xs text-muted-foreground">{banner.terms}</p>}
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                  <span className="rounded-md border px-2 py-1 font-mono text-xs font-medium">{banner.code}</span>
                  <CopyCodeButton code={banner.code!} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
