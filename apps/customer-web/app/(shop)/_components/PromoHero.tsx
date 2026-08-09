import Link from "next/link"

import type { BannerDTO } from "@effy/shared-types"

import { ActionLink, Display } from "@/components/storefront/kit"

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
const BAND_HEIGHT = "h-104 sm:h-120 lg:h-136"

/**
 * The streaming fallback.
 *
 * ⚠ Shares the height constant with the band. 028 shipped a skeleton built from different primitives
 * than the thing it stood in for, so it could not match at any width and the swap-in jumped. This is
 * the first thing on the page and the largest element on it.
 */
export function PromoHeroSkeleton() {
  return <div aria-hidden="true" className={`w-full animate-pulse bg-muted ${BAND_HEIGHT}`} />
}

export function PromoHero({ banners }: { banners: BannerDTO[] }) {
  // A promotional slot with no promotional ARTWORK is not a promotion — it is a coloured rectangle.
  const slides = banners.filter((b) => Boolean(b.imageUrl))
  if (slides.length === 0) return null

  const rotates = slides.length > 1

  return (
    <section aria-label="Promotions" className={`relative w-full overflow-hidden ${BAND_HEIGHT}`}>
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
            className="absolute inset-0"
          >
            {/* ⚠ A plain <img>, not next/image. Banner artwork is a PRESIGNED, EXPIRING S3 URL, so it
                is `unoptimized` regardless — leaving next/image contributing only positioning while
                making `fetchpriority` awkward to set per slide, which is the one thing that matters
                when N images share one band. */}
            <img
              src={banner.imageUrl!}
              alt=""
              fetchPriority={i === 0 ? "high" : "low"}
              decoding={i === 0 ? "sync" : "async"}
              className="absolute inset-0 size-full object-cover"
            />

            {/* The band leads to the promotion in full — `/promotions/<id>`.
                ⚠ A STRETCHED SIBLING, not a wrapper: wrapping would make it an ancestor of the two
                buttons, and nested interactive elements are invalid HTML. It works because the copy
                overlay above it is `pointer-events-none` and the buttons re-enable pointer events for
                themselves. ⚠ Never give it a negative z-index — that puts it behind the artwork,
                where nothing can click it. */}
            {banner.href && (
              <Link href={banner.href} aria-label={banner.title} className="absolute inset-0" />
            )}

            <div className="pointer-events-none absolute inset-0">
              {/* ⚠ CENTRED, NOT BOTTOM-ANCHORED. Bottom-anchoring left dead space above the headline
                  AND made the headline's position depend on what was below it — a slide with a
                  subtitle pushed the title up, one without let it drop, so the title jumped on every
                  change. Centring plus the reserved heights below keeps the copy block a constant
                  height, so the title lands in the same place on every slide. */}
              <div className="container flex h-full flex-col justify-center">
                <div className="max-w-3xl text-white">
                  {/* ⚠ H2, not H1 — the page's only top-level heading is the screen-reader-only one in
                      `page.tsx` (SC-009).

                      ⚠ `min-h` is what PINS the title: two rows at each breakpoint (font size ×
                      the 0.9 leading, doubled). `line-clamp-2` caps a long title at two rows but does
                      not make a short one occupy two, so without it a one-line headline sits a row
                      lower and the type jumps mid-crossfade. The clamp itself is a hard cap —
                      promotion titles are operator-typed and an unclamped long one pushes the buttons
                      off a fixed-height band. */}
                  <Display
                    as="h2"
                    size="hero"
                    className="line-clamp-2 min-h-18 leading-[0.9] sm:min-h-[5.85rem] lg:min-h-[7.2rem]"
                  >
                    {banner.title}
                  </Display>

                  {/* ⚠ RESERVED WHETHER OR NOT THERE IS ANYTHING TO PUT IN IT. Subtitle and terms are
                      optional and independent, so without a floor the buttons would sit at three
                      different heights across the rotation.

                      ⚠ 029 recorded that customer-web renders a banner face WITHOUT its terms, so a
                      promotion with a minimum spend was advertised with its condition omitted —
                      FR-037d: a shopper learns of a condition from the banner or from where it leads,
                      never first at payment. */}
                  <div className="mt-4 min-h-12 sm:mt-5 sm:min-h-14">
                    {banner.subtitle && (
                      <p className="max-w-md text-sm text-white/90 sm:text-base">{banner.subtitle}</p>
                    )}
                    {banner.terms && (
                      <p className="mt-2 text-xs text-white/75 sm:text-sm">{banner.terms}</p>
                    )}
                  </div>

                  {/* ⚠ The same two buttons as `Hero`, so the comparison is about the band and not the
                      actions. Fixed black/white rather than tokens: the artwork does not invert with
                      the appearance, so neither may they. */}
                  <div className="pointer-events-auto mt-7 flex flex-wrap items-center gap-3 sm:mt-8">
                    <ActionLink href="/browse" size="lg" className="bg-black text-white hover:bg-black/85">
                      Shop now
                    </ActionLink>
                    <ActionLink
                      href="/search?saleOnly=true"
                      variant="muted"
                      size="lg"
                      className="bg-white text-black hover:bg-white/85"
                    >
                      See what&rsquo;s on sale
                    </ActionLink>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
