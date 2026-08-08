import Image from "next/image"

import { ActionLink, Display, onLightScrim } from "@/components/storefront/kit"
import { heroImageUrl } from "@/lib/hero-asset"

import { ValueStrip } from "./ValueStrip"

/**
 * The storefront hero (039 US1) — a FULL-BLEED BANNER with the copy composed over the artwork.
 *
 * ── The composition, and the one I got wrong first ──────────────────────────────────────────────
 *
 * ⚠ The first implementation was a two-column grid: copy in a left column, photograph in a separate
 * rounded box on the right. **That is not the reference and not what research R2 specified** — R2 says
 * the hero "composes text over the image's flat open area (left) with a scrim". The operator's
 * reference is a single banner band whose artwork spans the full width, with the headline, both
 * actions and the supporting line sitting *on* the picture's empty left half. The supplied asset
 * (`banner-1.jpg`, 2.21:1) is built for exactly that: flat colour left, produce right.
 *
 * ⚠ R2 ALSO rejected "full-bleed the yellow band" as an alternative, on the grounds that it reads as a
 * brand colour. **The operator has since directed otherwise and supplied the artwork**, so that
 * rejection is superseded — recorded in research R2 rather than silently reversed. It does not breach
 * Principle V: the photograph is CONTENT (FR-007), and every piece of chrome here — type, buttons,
 * rules, the strip below — still resolves to the monochrome ramp.
 *
 * ── Why the type over the artwork is fixed black, not a token ───────────────────────────────────
 *
 * The same photograph is shown in light and dark, so anything guaranteeing contrast over it must not
 * invert (029's defect, documented at length on `Scrim`). The type, and both buttons, are therefore
 * pinned to the ends of the monochrome ramp rather than to tokens that flip with the appearance.
 *
 * ⚠ NO SCRIM — operator decision, 2026-08-07, and it changes what guarantees legibility here.
 *
 * A light veil was in place first, per FR-007's "a scrim or controlled zone… independent of the
 * artwork". It was removed because it visibly faded the artwork, and the reference has none either.
 * FR-007 is still met, but by the OTHER limb of the requirement: the **controlled zone**. This asset is
 * authored with a flat pale-yellow left half specifically to carry type, and black on it measures far
 * above AA.
 *
 * ⚠ THE COST, STATED PLAINLY: legibility now depends on a PROPERTY OF THE ASSET rather than on
 * something this component enforces. Swap in artwork that is dark, busy, or light-on-the-right and the
 * headline becomes unreadable with nothing failing — no test, no guard, no build error. The constraint
 * moved out of the code and into `public/hero/README.md`, where it is now written down.
 *
 * ── Absence ─────────────────────────────────────────────────────────────────────────────────────
 *
 * With no asset the band falls back to the page's own surface and TOKEN type — not black-on-white,
 * which would be unreadable in dark mode. The fixed colours are used only where there is a photograph
 * to fix them against. This is why the component branches on `hasArt` rather than just swapping a src.
 */
export function Hero({
  /** Test seam only. Production always uses the build-time resolved asset. */
  imageSrc = heroImageUrl(),
}: {
  imageSrc?: string | null
} = {}) {
  const hasArt = Boolean(imageSrc)

  return (
    <section>
      <div
        className={`relative h-[26rem] w-full overflow-hidden sm:h-[30rem] lg:h-[34rem] ${
          hasArt ? "" : "border-b bg-muted"
        }`}
      >
        {hasArt && (
          <>
            {/* ⚠ object-position walks left as the viewport narrows. The asset is 2.21:1; a phone
                crops it to roughly square, and centring would put the headline on top of a basket of
                broccoli. Anchoring left keeps the flat zone under the type at every width. */}
            <Image
              src={imageSrc!}
              alt=""
              fill
              unoptimized
              priority
              sizes="100vw"
              className="object-cover object-[18%_center] sm:object-[28%_center] lg:object-center"
            />
          </>
        )}

        <div className="absolute inset-0">
          <div className="container flex h-full items-center">
            <div className={`max-w-xl ${hasArt ? onLightScrim : "text-foreground"}`}>
              <Display as="h2" size="hero">
                Everything you need, delivered
              </Display>

              <p
                className={`mt-4 max-w-md text-sm sm:mt-5 sm:text-base ${
                  hasArt ? "text-black/75" : "text-muted-foreground"
                }`}
              >
                Fresh groceries and everyday essentials from one brand. Browse without an account — we
                only ask who you are when you place an order.
              </p>

              {/* ⚠ THE BUTTONS ON THE ARTWORK MUST NOT INVERT EITHER — the same rule as the scrim, and
                  it was caught the same way. `primary` is near-black on light and near-white on dark
                  (the monochrome accent inverts by design, Principle V). Over a FIXED photograph that
                  meant both pills became pale in dark mode and the primary/secondary hierarchy simply
                  disappeared: two identical-looking buttons, neither obviously the main action.

                  So on the artwork both are pinned to the ramp's ends — black pill / white pill — which
                  reads identically in both appearances because the ground it sits on does too. Off the
                  artwork (no asset yet) the ordinary inverting tokens are correct and are used. */}
              <div className="mt-7 flex flex-wrap items-center gap-3 sm:mt-8">
                <ActionLink
                  href="/browse"
                  size="lg"
                  className={hasArt ? "bg-black text-white hover:bg-black/85" : undefined}
                >
                  Shop now
                </ActionLink>
                <ActionLink
                  href="/search?saleOnly=true"
                  variant={hasArt ? "muted" : "outline"}
                  size="lg"
                  className={hasArt ? "bg-white text-black hover:bg-white/85" : undefined}
                >
                  See what&rsquo;s on sale
                </ActionLink>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* The reference closes its banner with a three-up value band. Ours sits on the page surface
          directly beneath, so it stays on tokens and inverts correctly with the appearance. */}
      <ValueStrip />
    </section>
  )
}
