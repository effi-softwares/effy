import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Hero } from "./Hero"

/**
 * The hero (039 US1) — a full-bleed banner with the copy composed over the artwork's flat left zone.
 *
 * ⚠ These were rewritten when the composition was corrected. The first implementation was a
 * two-column grid (copy left, image in a rounded box right), which is neither the operator's reference
 * nor what research R2 specified. Tests that pinned the wrong composition passed perfectly.
 */
describe("Hero — the immediately-served banner (US1)", () => {
  it("renders a headline, a supporting line and BOTH actions with real destinations", () => {
    render(<Hero imageSrcs={[]} />)

    expect(screen.getByRole("heading", { name: /everything you need/i })).toBeTruthy()
    expect(screen.getByText(/fresh groceries and everyday essentials/i)).toBeTruthy()

    expect(screen.getByRole("link", { name: /shop now/i }).getAttribute("href")).toBe("/search")
    expect(screen.getByRole("link", { name: /on sale/i }).getAttribute("href")).toBe(
      "/search?saleOnly=true",
    )
  })

  it("emits NO <img> when the asset is absent — never a broken frame (FR-011)", () => {
    const { container } = render(<Hero imageSrcs={[]} />)

    expect(container.querySelector("img")).toBeNull()
  })

  it("renders the photograph when the asset is present", () => {
    const { container } = render(<Hero imageSrcs={["/hero/hero-1.webp"]} />)

    expect(container.querySelector("img")).not.toBeNull()
  })

  /**
   * The rotation (six artworks, one per minute, CSS-driven).
   *
   * ⚠ The partial-set case is the one worth pinning. The keyframes divide the cycle into six fixed
   * turns, so rotating four images would leave two dead minutes showing nothing — which reads as a
   * loading fault, not as a missing file. The component must fall back to a STILL first image, and
   * "still" means the animation class is absent, not merely that fewer slides rendered.
   */
  describe("the artwork rotation", () => {
    const SIX = Array.from({ length: 6 }, (_, i) => `/hero/hero-${i + 1}.webp`)

    it("stacks every artwork and drives them from the shared CSS cycle", () => {
      const { container } = render(<Hero imageSrcs={SIX} />)

      expect(container.querySelectorAll("img")).toHaveLength(6)
      expect(container.querySelector(".fx-hero")).not.toBeNull()
    })

    it("gives each slide its index, so one keyframe set can serve all six", () => {
      const { container } = render(<Hero imageSrcs={SIX} />)

      const indexes = Array.from(container.querySelectorAll("img")).map((img) =>
        (img as HTMLElement).style.getPropertyValue("--fx-hero-i"),
      )
      expect(indexes).toEqual(["0", "1", "2", "3", "4", "5"])
    })

    it("fetches ONLY the first artwork at high priority — it is the LCP element", () => {
      const { container } = render(<Hero imageSrcs={SIX} />)

      const priorities = Array.from(container.querySelectorAll("img")).map((img) =>
        img.getAttribute("fetchpriority"),
      )
      expect(priorities).toEqual(["high", "low", "low", "low", "low", "low"])
    })

    it("refuses to rotate a PARTIAL set — one still image, no dead frames", () => {
      const { container } = render(<Hero imageSrcs={SIX.slice(0, 4)} />)

      expect(container.querySelectorAll("img")).toHaveLength(1)
      expect(container.querySelector(".fx-hero")).toBeNull()
    })
  })

  /**
   * ⚠ NO SCRIM — operator decision. FR-007 is met by its **controlled zone** limb instead: the asset is
   * authored with a flat pale left half that carries the type.
   *
   * This asserts the decision rather than a quality, because the quality is not assertable here: with
   * no veil, legibility is a property of the ARTWORK, not of this component. A test cannot look at a
   * JPEG. What it can do is fail loudly if someone reintroduces a veil without revisiting the decision,
   * and point at where the real constraint now lives.
   *
   * The constraint: `public/hero/README.md` requires any replacement asset to keep a pale, flat,
   * left-hand text zone. Swap in dark or busy artwork and the headline becomes unreadable with nothing
   * failing anywhere.
   */
  it("renders NO veil over the artwork", () => {
    const { container } = render(<Hero imageSrcs={["/hero/hero-1.webp"]} />)

    expect(container.querySelector("[class*='bg-gradient']")).toBeNull()
    expect(container.innerHTML).not.toContain("from-white/")
    expect(container.innerHTML).not.toContain("from-black/")
  })

  /**
   * ⚠ THE DARK-MODE TRAP, and the reason this component branches on `hasArt` instead of just swapping
   * a `src`. Type over the photograph must be FIXED black, because the photograph does not invert
   * (029's defect). But with NO photograph the band falls back to the page's own surface — and fixed
   * black on that surface is invisible in dark mode. So the fixed colours may appear only when there
   * is artwork to fix them against.
   */
  it("uses NO fixed colour when there is no artwork — the fallback must invert with the appearance", () => {
    const { container } = render(<Hero imageSrcs={[]} />)
    const html = container.innerHTML

    expect(html).not.toContain("text-black")
    expect(html).not.toContain("bg-white/")
    expect(html).toContain("text-foreground")
  })

  it("uses fixed colours ONLY when there is artwork", () => {
    const { container } = render(<Hero imageSrcs={["/hero/hero-1.webp"]} />)

    expect(container.innerHTML).toContain("text-black")
  })

  /**
   * ⚠ REGRESSION: THE CTA HIERARCHY VANISHED IN DARK MODE. `primary` is near-black on light and
   * near-white on dark — the monochrome accent inverts by design (Principle V). Over a photograph that
   * does NOT invert, that made both pills pale in dark mode: two near-identical buttons with no
   * visible primary. Found on a dark-mode screenshot, with every test green.
   *
   * The rule generalises beyond this component: anything composed ON fixed artwork must itself be
   * fixed. The scrim, the type, and the buttons are all instances of it.
   */
  it("pins BOTH buttons to fixed colours over artwork, so the hierarchy survives dark mode", () => {
    const { container } = render(<Hero imageSrcs={["/hero/hero-1.webp"]} />)
    const links = Array.from(container.querySelectorAll("a"))

    const primary = links.find((a) => /shop now/i.test(a.textContent ?? ""))!
    const secondary = links.find((a) => /on sale/i.test(a.textContent ?? ""))!

    // Opposite ends of the ramp — and neither is a token that would flip with the appearance.
    expect(primary.className).toContain("bg-black")
    expect(primary.className).toContain("text-white")
    expect(secondary.className).toContain("bg-white")
    expect(secondary.className).toContain("text-black")
  })

  it("uses the ordinary inverting tokens for the buttons when there is NO artwork", () => {
    const { container } = render(<Hero imageSrcs={[]} />)
    const primary = Array.from(container.querySelectorAll("a")).find((a) =>
      /shop now/i.test(a.textContent ?? ""),
    )!

    expect(primary.className).toContain("bg-primary")
    expect(primary.className).not.toContain("bg-black")
  })

  /**
   * SC-001: the band is the same height in both states, so nothing reflows when the art lands.
   *
   * ⚠ This asserts that the two states AGREE, not what the height happens to be. It used to hard-code
   * `h-[26rem] sm:h-[30rem] lg:h-[34rem]`, and when the band moved to the spacing scale
   * (`h-104 sm:h-120 lg:h-136`) the test did not fail on the numbers — its element lookup returned
   * `undefined`, because it searched for a class containing `h-[`. A height test that breaks when the
   * height is *renamed* is testing the wrong thing; the invariant is equality between the states.
   */
  it("reserves the same band height with and without artwork", () => {
    const heightOf = (c: HTMLElement) => {
      const band = c.querySelector<HTMLElement>("[class*='h-']")!
      return band.className.split(/\s+/).filter((k) => /(^|:)h-/.test(k))
    }

    const { container: withArt } = render(<Hero imageSrcs={["/hero/hero-1.webp"]} />)
    const { container: without } = render(<Hero imageSrcs={[]} />)

    const heights = heightOf(withArt)
    // A band with no height classes at all would otherwise pass this by matching an empty list.
    expect(heights.length).toBeGreaterThanOrEqual(3)
    // Every breakpoint, both states — a height that matched at one width and not another would still
    // shift the page for the shoppers on the other width.
    expect(heightOf(without)).toEqual(heights)
  })

  /**
   * ⚠ The artwork is 2.21:1 and a phone crops it to roughly square. Centring the crop would put the
   * headline on top of a basket of broccoli, which is the whole reason the asset has a flat zone.
   * The crop must stay anchored left at narrow widths.
   */
  it("anchors the crop to the artwork's flat zone at narrow widths", () => {
    const { container } = render(<Hero imageSrcs={["/hero/hero-1.webp"]} />)
    const img = container.querySelector("img")!

    expect(img.className).toContain("object-[18%_center]")
    expect(img.className).toContain("lg:object-center")
  })

  /**
   * SC-009 — the page's single `h1` is the sr-only title in `page.tsx`. The hero's headline is
   * visually the largest type on the page, which is why it is tempting to mark up as `h1`.
   */
  it("heads itself at h2, leaving the page's single h1 to the page", () => {
    render(<Hero imageSrcs={[]} />)

    expect(screen.getByRole("heading", { level: 2, name: /everything you need/i })).toBeTruthy()
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull()
  })
})
