import type { Banner } from "../promotion-groups"
import { fireEvent, render } from "@testing-library/react"
import { act } from "react"
import { describe, expect, it, vi } from "vitest"



import { PromoHero } from "./PromoHero"

/**
 * The promotions hero - a carousel of every advertised promotion on a drawn promo banner, with up to
 * two promo cards beside it. The slides are rendered on the server; `PromoCarousel` only decides
 * which one is showing.
 */

function banner(i: number, over: Partial<Banner> = {}): Banner {
  return {
    key: `promo-${i}`,
    title: `Promotion ${i}`,
    subtitle: `Subtitle ${i}`,
    imageUrl: `https://example.test/banner-${i}.jpg`,
    href: `/promotions/promo-${i}`,
    ...over,
  }
}

describe("PromoHero", () => {
  it("renders nothing when there are no promotions", () => {
    const { container } = render(<PromoHero slides={[]} side={[]} />)
    expect(container.firstChild).toBeNull()
  })

  /**
   * The band is drawn - a promo colour, a decoration, icon bubbles - so a promotion needs no artwork
   * to be shown, and its artwork is not put under the words.
   */
  it("shows a promotion with no artwork, and draws no image", () => {
    const { container } = render(<PromoHero slides={[banner(1, { imageUrl: null }), banner(2)]} side={[banner(1, { imageUrl: null }), banner(2)]} />)
    expect(Array.from(container.querySelectorAll("h2")).map((h) => h.textContent)).toEqual([
      "Promotion 1",
      "Promotion 2",
    ])
    expect(container.querySelector("img")).toBeNull()
  })

  it("draws the band in promo green, with its decoration hidden from assistive technology", () => {
    const { container } = render(<PromoHero slides={[banner(1)]} side={[banner(1)]} />)
    const band = container.querySelector<HTMLElement>("[style*='--promo-']")!
    expect(band.style.background).toBe("var(--promo-green)")
    expect(band.querySelectorAll("svg").length).toBeGreaterThan(4)
    for (const svg of band.querySelectorAll("svg")) {
      expect(svg.closest("[aria-hidden='true']")).not.toBeNull()
    }
  })

  it("shows no controls for a single promotion - one slide is not a carousel", () => {
    const { queryByRole } = render(<PromoHero slides={[banner(1)]} side={[banner(1)]} />)
    expect(queryByRole("button", { name: "Next slide" })).toBeNull()
  })

  /**
   * Out of sight is not enough. Every slide is in the document, stacked on one box: one that is
   * not showing must be out of the tab order and the accessibility tree too, or a keyboard user tabs
   * through N sets of buttons of which N-1 cannot be seen.
   */
  it("keeps every slide in the document, and only the showing one reachable", () => {
    const { container } = render(<PromoHero slides={[banner(1), banner(2), banner(3)]} side={[banner(1), banner(2), banner(3)]} />)
    const slides = Array.from(container.querySelectorAll<HTMLElement>("[aria-roledescription='slide']"))
    expect(slides.map((s) => s.getAttribute("aria-label"))).toEqual(["1 of 3", "2 of 3", "3 of 3"])
    expect(slides.map((s) => s.hasAttribute("inert"))).toEqual([false, true, true])
    expect(slides.map((s) => s.className.includes("invisible"))).toEqual([false, true, true])
  })

  it("moves with previous and next, and wraps at both ends", () => {
    const { container, getByRole } = render(<PromoHero slides={[banner(1), banner(2), banner(3)]} side={[banner(1), banner(2), banner(3)]} />)
    const showing = () =>
      Array.from(container.querySelectorAll("[aria-roledescription='slide']")).findIndex((s) => !s.hasAttribute("inert"))

    fireEvent.click(getByRole("button", { name: "Next slide" }))
    expect(showing()).toBe(1)
    fireEvent.click(getByRole("button", { name: "Previous slide" }))
    fireEvent.click(getByRole("button", { name: "Previous slide" }))
    expect(showing()).toBe(2)
    fireEvent.click(getByRole("button", { name: "Next slide" }))
    expect(showing()).toBe(0)
  })

  it("advances by itself, and keeps advancing after a control is clicked", () => {
    vi.useFakeTimers()
    try {
      const { container, getByRole, queryByRole } = render(<PromoHero slides={[banner(1), banner(2), banner(3)]} side={[banner(1), banner(2), banner(3)]} />)
      const showing = () =>
        Array.from(container.querySelectorAll("[aria-roledescription='slide']")).findIndex((s) => !s.hasAttribute("inert"))

      act(() => void vi.advanceTimersByTime(6000))
      expect(showing()).toBe(1)

      // In a browser a click leaves focus on the button, and that must not hold the carousel. This
      // DOM cannot tell a mouse's focus from a keyboard's (`:focus-visible`), so that half was checked
      // in a real browser; what is pinned here is that a click does not stop the timer.
      fireEvent.click(getByRole("button", { name: "Next slide" }))
      expect(showing()).toBe(2)
      act(() => void vi.advanceTimersByTime(6000))
      expect(showing()).toBe(0)

      expect(queryByRole("button", { name: /pause|play/i })).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  /** WCAG 2.2.2 - it waits while the pointer is over it. */
  it("waits while the pointer is over it, and carries on when it leaves", () => {
    vi.useFakeTimers()
    try {
      const { container } = render(<PromoHero slides={[banner(1), banner(2)]} side={[banner(1), banner(2)]} />)
      const showing = () =>
        Array.from(container.querySelectorAll("[aria-roledescription='slide']")).findIndex((s) => !s.hasAttribute("inert"))
      const band = container.querySelector("[aria-roledescription='slide']")!.parentElement!

      fireEvent.pointerEnter(band)
      act(() => void vi.advanceTimersByTime(30_000))
      expect(showing()).toBe(0)
      fireEvent.pointerLeave(band)
      act(() => void vi.advanceTimersByTime(6000))
      expect(showing()).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it("does not advance for someone who asked for reduced motion", () => {
    vi.useFakeTimers()
    const original = window.matchMedia
    window.matchMedia = ((q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() { }, removeEventListener() { } })) as never
    try {
      const { container } = render(<PromoHero slides={[banner(1), banner(2)]} side={[banner(1), banner(2)]} />)
      act(() => void vi.advanceTimersByTime(30_000))
      expect(container.querySelector("[aria-roledescription='slide']")!.hasAttribute("inert")).toBe(false)
    } finally {
      window.matchMedia = original
      vi.useRealTimers()
    }
  })

  /** A shopper learns of a condition from the banner or from where it leads. */
  it("shows a promotion's terms on the face when it has them", () => {
    const { getByText } = render(<PromoHero slides={[banner(1, { terms: "On orders over $30" })]} side={[banner(1, { terms: "On orders over $30" })]} />)
    expect(getByText("On orders over $30")).toBeTruthy()
  })

  /**
   * The stretched link must be a sibling of the copy, never an ancestor of the buttons - nested
   * interactive elements are invalid HTML and unusable with a screen reader.
   */
  it("links the band to the promotion without nesting the buttons inside that link", () => {
    const { container } = render(<PromoHero slides={[banner(1)]} side={[banner(1)]} />)
    const bandLink = container.querySelector('a[href="/promotions/promo-1"]')
    expect(bandLink).not.toBeNull()
    expect(bandLink!.querySelector("a")).toBeNull()
  })
})

describe("PromoHero - the cards beside the band", () => {
  const grounds = (c: HTMLElement) =>
    Array.from(c.querySelectorAll<HTMLElement>("ul [style*='--promo-']")).map((el) => el.style.background)

  it("stacks a linked offer above a code, blue then purple", () => {
    const { container } = render(
      <PromoHero slides={[banner(1), banner(2), banner(3, { code: "HELLO10", terms: "On orders over $30" })]} side={[banner(1), banner(2), banner(3, { code: "HELLO10", terms: "On orders over $30" })]} />,
    )
    expect(grounds(container)).toEqual(["var(--promo-blue)", "var(--promo-purple)"])
    // One column at every width: the side-by-side layout is what overflowed.
    expect(container.querySelector("ul")!.className).not.toMatch(/grid-cols/)
  })

  it("does not repeat the first slide beside itself", () => {
    const { container } = render(<PromoHero slides={[banner(1)]} side={[banner(1)]} />)
    expect(container.querySelector("ul")).toBeNull()
  })

  it("makes the whole offer card one link, without nesting anything interactive in it", () => {
    const { getByRole } = render(<PromoHero slides={[banner(1), banner(2)]} side={[banner(1), banner(2)]} />)
    const link = getByRole("link", { name: "Shop now: Promotion 2" })
    expect(link.getAttribute("href")).toBe("/promotions/promo-2")
    expect(link.className).toContain("after:absolute")
    expect(link.querySelector("a,button")).toBeNull()
  })

  it("hands over a code as selectable text beside a real copy button, in a row that wraps", () => {
    const { getByText, getByRole } = render(
      <PromoHero slides={[banner(1)]} side={[banner(2, { code: "HELLO10", terms: "On orders over $30" })]} />,
    )
    const row = getByText("HELLO10").parentElement!
    expect(row.className).toContain("flex-wrap")
    expect(row.contains(getByRole("button", { name: /copy code/i }))).toBe(true)
  })
})
