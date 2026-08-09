import { ActionLink, Display, onLightScrim } from "@/components/storefront/kit"
import { HERO_ROTATION_COUNT, heroImageUrls } from "@/lib/hero-asset"

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
 * ⚠ THAT COST GREW WITH THE ROTATION: the promise now has to hold for SIX artworks, not one, and each
 * has a different coloured ground (olive, orange-red, peach, amber, mint, lilac). All six were measured
 * before they were adopted — black type clears AA on every one, worst 5.82:1 — and the supporting line
 * was moved from `text-black/75` to `/80` because at 75% it measured **4.47:1 on hero-2**, three
 * hundredths under the 4.5:1 body-text minimum. Nothing would have reported that.
 *
 * ── The rotation ────────────────────────────────────────────────────────────────────────────────
 *
 * One artwork every ten seconds, one-minute loop, crossfaded — and NO JavaScript, because `/` has ~0.1 KB of
 * guest budget left and a timer in a client component would fail the gate. All six images ship in the
 * HTML and CSS decides which is on top; see `.fx-hero` in `app/globals.css` for why the handover is
 * built the way it is (a naive crossfade dips to the page background every minute).
 *
 * ⚠ ONLY THE FIRST IMAGE IS FETCHED AT HIGH PRIORITY. It is the LCP element; the other five are
 * marked `fetchpriority="low"` so they queue behind everything that affects first paint. They are
 * still downloaded — 334 KB for the set, against 311 KB for the single JPEG this replaces — so the
 * rotation is close to byte-neutral, but five of those images are speculative for a visitor who
 * leaves inside a minute.
 *
 * ⚠ IT REFUSES TO ROTATE ON A PARTIAL SET. With fewer than `HERO_ROTATION_COUNT` artworks resolved,
 * the first is rendered STILL rather than animated, because the keyframes divide the cycle into six
 * fixed turns — a short set would rotate with dead frames where the missing images should be, which
 * looks like a loading fault rather than like a missing file.
 *
 * ── Absence ─────────────────────────────────────────────────────────────────────────────────────
 *
 * With no asset the band falls back to the page's own surface and TOKEN type — not black-on-white,
 * which would be unreadable in dark mode. The fixed colours are used only where there is a photograph
 * to fix them against. This is why the component branches on `hasArt` rather than just swapping a src.
 */
export function Hero({
  /** Test seam only. Production always uses the build-time resolved assets. */
  imageSrcs = heroImageUrls(),
}: {
  imageSrcs?: readonly string[]
} = {}) {
  const hasArt = imageSrcs.length > 0
  // A partial set is rendered still rather than rotated — see the note above.
  const rotates = imageSrcs.length === HERO_ROTATION_COUNT
  const slides = rotates ? imageSrcs : imageSrcs.slice(0, 1)

  return (
    <section>
      <div
        className={`relative h-[26rem] w-full overflow-hidden sm:h-[30rem] lg:h-[34rem] ${
          hasArt ? "" : "border-b bg-muted"
        }`}
      >
        {hasArt && (
          // ⚠ `fx-hero` styles ITS OWN CHILDREN, so this wrapper must contain nothing but slides.
          <div className={rotates ? "fx-hero" : undefined}>
            {slides.map((src, i) => (
              /* ⚠ A plain <img>, not next/image. The images are already `unoptimized` (they are
                 pre-encoded WebP committed to `public/`), so next/image contributed only positioning
                 — while making `fetchpriority` awkward to set per slide, which is the one thing that
                 actually matters when six images share one banner.

                 ⚠ object-position walks left as the viewport narrows. The assets are 2:1; a phone
                 crops to roughly square, and centring would put the headline on top of the produce.
                 Anchoring left keeps the flat zone under the type at every width. */
              <img
                key={src}
                src={src}
                alt=""
                style={{ "--fx-hero-i": i } as React.CSSProperties}
                // The first is the LCP element and is fetched eagerly at high priority; the rest
                // must not compete with it for bandwidth before first paint.
                fetchPriority={i === 0 ? "high" : "low"}
                decoding={i === 0 ? "sync" : "async"}
                className="absolute inset-0 size-full object-cover object-[18%_center] sm:object-[28%_center] lg:object-center"
              />
            ))}
          </div>
        )}

        <div className="absolute inset-0">
          <div className="container flex h-full items-center">
            <div className={`max-w-xl ${hasArt ? onLightScrim : "text-foreground"}`}>
              <Display as="h2" size="hero">
                Everything you need, delivered
              </Display>

              <p
                className={`mt-4 max-w-md text-sm sm:mt-5 sm:text-base ${
                  // ⚠ /80, NOT /75. Measured against the text zone of all six artworks: at 75% this
                  // line is 4.47:1 on hero-2 — under the 4.5:1 body-text minimum by three
                  // hundredths, on one ground out of six, with nothing to report it. /80 clears
                  // every one (worst 4.82:1).
                  hasArt ? "text-black/80" : "text-muted-foreground"
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
