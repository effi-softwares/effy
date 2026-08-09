import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { BannerDTO } from "@effy/shared-types"

import { PromoHero, keyframesFor } from "./PromoHero"

/**
 * The promotions hero — a CSS-only carousel whose keyframes are GENERATED, because the number of
 * advertised promotions is whatever the operator has running and a keyframe percentage cannot be
 * derived from a custom property.
 *
 * ⚠ These assertions exist because every failure mode here is SILENT. A wrong percentage does not
 * throw; it produces a flicker of page background once per rotation, or a slide that swallows clicks
 * meant for the one you can see. The browser-level proof (coverage at every instant, hit-testing,
 * focusability) was run separately at 20ms resolution across every handover; what is pinned here is
 * the arithmetic that proof depended on, so it cannot drift out from under it.
 */

function banner(i: number, over: Partial<BannerDTO> = {}): BannerDTO {
  return {
    key: `promo-${i}`,
    title: `Promotion ${i}`,
    subtitle: `Subtitle ${i}`,
    imageUrl: `https://example.test/banner-${i}.jpg`,
    href: `/promotions/promo-${i}`,
    ...over,
  }
}

describe("keyframesFor — the generated rotation", () => {
  it("gives every promotion a ten-second turn", () => {
    expect(keyframesFor(2)).toContain("fx-promo-2 20s linear infinite")
    expect(keyframesFor(4)).toContain("fx-promo-4 40s linear infinite")
    expect(keyframesFor(7)).toContain("fx-promo-7 70s linear infinite")
  })

  it("offsets each slide by its index, minus one fade so slide 1 is opaque at t=0", () => {
    // ⚠ The negative term is the LCP guarantee: slide 1's animation is already past its fade-in on
    // the first painted frame. Chrome does not record LCP for a transparent element, so without it
    // the metric moves by the length of the fade.
    expect(keyframesFor(4)).toContain("animation-delay:calc(var(--fx-promo-i) * 10s - 1s)")
  })

  /**
   * ⚠ THE ONE THAT MATTERS. A slide must start hiding only AFTER its successor is fully opaque on
   * top of it. Early by even a fraction and two partial layers sit over nothing, so the page
   * background shows through and the band dips on every change.
   *
   * Successor reaches full opacity at (dwell + fade) into this slide's own timeline.
   */
  it("holds each slide until its successor has covered it", () => {
    for (const n of [2, 3, 4, 6, 8]) {
      const css = keyframesFor(n)
      const [, fadeIn, holdEnd] = css.match(/\{0%\{[^}]*\}([\d.]+)%,([\d.]+)%\{opacity:1/)!
      const successorOpaqueAt = ((10 + 1) / (n * 10)) * 100

      expect(Number(holdEnd)).toBeGreaterThan(successorOpaqueAt)
      // ...but only just. Holding far too long would keep a stale promotion on screen.
      expect(Number(holdEnd)).toBeLessThan(successorOpaqueAt + 0.5)
      // And the fade-in must complete before the slide's turn begins.
      expect(Number(fadeIn)).toBeLessThan((1 / (n * 10)) * 100)
    }
  })

  /**
   * ⚠ `visibility`, not just `opacity`. An `opacity: 0` element is still hit-tested, still focusable
   * and still in the accessibility tree. With N slides stacked on one box the LAST in DOM order would
   * swallow every click — so the buttons a shopper can see would do nothing — while a keyboard user
   * tabbed through N sets of buttons of which N-1 are invisible.
   */
  it("hides inactive slides from hit-testing and the tab order, not merely from view", () => {
    const css = keyframesFor(4)
    expect(css).toContain("visibility:hidden")
    expect(css).toMatch(/[\d.]+%,100%\{opacity:0;visibility:hidden\}/)
  })

  /** WCAG 2.2.2 — auto-updating content running past five seconds needs a way to stop it. */
  it("pauses on hover AND on focus-within", () => {
    const css = keyframesFor(4)
    expect(css).toContain(".fx-promo-4:hover>*")
    // ⚠ `:focus-within` is the half that matters. Hover alone leaves keyboard and screen-reader
    // users with no mechanism at all.
    expect(css).toContain(".fx-promo-4:focus-within>*")
    expect(css).toContain("animation-play-state:paused")
  })

  it("stops entirely under prefers-reduced-motion, on the first promotion", () => {
    const css = keyframesFor(4)
    expect(css).toContain("@media(prefers-reduced-motion:reduce)")
    expect(css).toContain(".fx-promo-4>:first-child{opacity:1;visibility:visible}")
  })
})

describe("PromoHero", () => {
  it("renders nothing when there are no promotions", () => {
    const { container } = render(<PromoHero banners={[]} />)
    expect(container.firstChild).toBeNull()
  })

  /** A promotional slot with no promotional ARTWORK is not a promotion — it is a coloured rectangle. */
  it("drops promotions with no artwork, and renders nothing if that leaves none", () => {
    const { container } = render(
      <PromoHero banners={[banner(1, { imageUrl: null }), banner(2)]} />,
    )
    expect(container.querySelectorAll("img")).toHaveLength(1)

    const { container: empty } = render(<PromoHero banners={[banner(1, { imageUrl: null })]} />)
    expect(empty.firstChild).toBeNull()
  })

  it("emits NO animation for a single promotion — one slide is not a carousel", () => {
    const { container } = render(<PromoHero banners={[banner(1)]} />)
    expect(container.querySelector("style")).toBeNull()
    expect(container.querySelector('[class*="fx-promo"]')).toBeNull()
  })

  it("generates the rule set for exactly the number of promotions in hand", () => {
    const { container } = render(<PromoHero banners={[banner(1), banner(2), banner(3)]} />)
    expect(container.querySelector(".fx-promo-3")).not.toBeNull()
  })

  it("fetches only the first artwork at high priority — it is the LCP element", () => {
    const { container } = render(<PromoHero banners={[banner(1), banner(2), banner(3)]} />)
    const priorities = Array.from(container.querySelectorAll("img")).map((i) =>
      i.getAttribute("fetchpriority"),
    )
    expect(priorities).toEqual(["high", "low", "low"])
  })

  /** FR-037d — a shopper learns of a condition from the banner or from where it leads. */
  it("shows a promotion's terms on the face when it has them", () => {
    const { getByText } = render(<PromoHero banners={[banner(1, { terms: "On orders over $30" })]} />)
    expect(getByText("On orders over $30")).toBeTruthy()
  })

  /**
   * ⚠ The stretched link must be a SIBLING of the copy, never an ancestor of the buttons — nested
   * interactive elements are invalid HTML and unusable with a screen reader.
   */
  it("links the band to the promotion without nesting the buttons inside that link", () => {
    const { container } = render(<PromoHero banners={[banner(1)]} />)
    const bandLink = container.querySelector('a[href="/promotions/promo-1"]')
    expect(bandLink).not.toBeNull()
    expect(bandLink!.querySelector("a")).toBeNull()
  })
})
