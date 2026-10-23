import type { Banner } from "../promotion-groups"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"



import { OFFER_THEMES } from "@/components/storefront/PromoBanner"

import { OfferBannerCard, OffersPanels } from "./OffersPanels"

function banner(over: Partial<Banner> = {}): Banner {
  return {
    key: "b1",
    title: "20% off your first grocery order",
    subtitle: "Applied at checkout",
    imageUrl: "https://example.test/promo.jpg",
    href: "/promotions/b1",
    ...over,
  }
}

function many(n: number): Banner[] {
  return Array.from({ length: n }, (_, i) =>
    banner({ key: `b${i}`, title: `Offer ${i}`, href: `/promotions/b${i}` }),
  )
}

/** The offer cards' own links — the section header also carries one ("All offers"). */
const offerLinks = () => screen.queryAllByRole("link", { name: /^view offer/i })

describe("OffersPanels — the composition degrades, it never pads (FR-018)", () => {
  it("renders three cards for three offers", () => {
    render(<OffersPanels banners={many(3)} />)

    expect(offerLinks()).toHaveLength(3)
  })

  it("renders only what it has data for with two offers", () => {
    render(<OffersPanels banners={many(2)} />)

    expect(offerLinks()).toHaveLength(2)
  })

  it("renders a single panel for one offer", () => {
    render(<OffersPanels banners={many(1)} />)

    expect(offerLinks()).toHaveLength(1)
  })

  /**
   * ⚠ NEVER A PLACEHOLDER TILE. An empty frame in a promotional block reads as a broken advert, and a
   * shopper cannot tell it from a promotion that failed to load.
   */
  it("renders NOTHING at all when there are no offers", () => {
    const { container } = render(<OffersPanels banners={[]} />)

    expect(container.innerHTML).toBe("")
  })

  it("shows at most three panels even when handed more", () => {
    render(<OffersPanels banners={many(7)} />)

    expect(offerLinks()).toHaveLength(3)
  })
})

/**
 * ⚠ THE DEFECT THIS BLOCK EXISTS NOT TO REPEAT. 029 shipped a banner that pointed EVERY promotion at
 * `/search` — the unfiltered store — for its entire life, carrying none of the promotion's facts. The
 * test that should have caught it asserted `kind === "search"`, encoding the same misreading as the
 * code. So these pin the destination against the banner's own data, not against a shape I chose.
 */
describe("OffersPanels — where a panel leads (029's post-mortem)", () => {
  it("uses the server-composed href", () => {
    render(<OffersPanels banners={[banner({ key: "x", href: "/promotions/x" })]} />)

    expect(offerLinks()[0]!.getAttribute("href")).toBe("/promotions/x")
  })

  /** Mobile routes on `target`; web on `href`. When href is absent they must not disagree. */
  it("falls back to the promotion target when the server sent no href", () => {
    render(
      <OffersPanels
        banners={[
          banner({ key: "y", href: null, target: { kind: "promotion", promotionId: "abc" } }),
        ]}
      />,
    )

    expect(offerLinks()[0]!.getAttribute("href")).toBe("/promotions/abc")
  })

  it("never sends a promotion to the unfiltered store", () => {
    render(<OffersPanels banners={many(3)} />)

    for (const link of offerLinks()) {
      expect(link.getAttribute("href")).not.toBe("/search")
    }
  })

  /**
   * ⚠ A tap that does nothing is worse than no tap (the rule `BannerTarget` states for mobile). A
   * promotion with no destination renders as a panel, not as a dead link.
   */
  it("renders a non-tappable panel when there is no destination at all", () => {
    render(<OffersPanels banners={[banner({ href: null, target: null })]} />)

    expect(offerLinks()).toHaveLength(0)
    expect(screen.getByText(/20% off/)).toBeTruthy()
  })
})

describe("OffersPanels — the message survives the artwork", () => {
  /**
   * The words sit on a DRAWN banner — a flat promo colour and a decoration — so they read the same
   * whatever a promotion uploads. No artwork under them, and no gradient.
   */
  it("draws no artwork and no gradient under the words", () => {
    const { container } = render(<OffersPanels banners={many(3)} />)

    expect(container.querySelectorAll("[class*='bg-linear']")).toHaveLength(0)
    expect(container.querySelector("img")).toBeNull()
  })

  it("gives each offer its own promo colour, through the variables and never a hex", () => {
    const { container } = render(<OffersPanels banners={many(3)} />)

    const grounds = Array.from(container.querySelectorAll<HTMLElement>("li [style*='--promo-']")).map(
      (el) => el.style.background,
    )
    expect(grounds).toEqual(["var(--promo-orange)", "var(--promo-rose)", "var(--promo-red)"])
  })

  it("hides the decoration and the icon bubbles from assistive technology", () => {
    const { container } = render(<OffersPanels banners={many(1)} />)

    expect(container.querySelectorAll("svg").length).toBeGreaterThan(1)
    for (const svg of container.querySelectorAll("li [style*='--promo-'] svg")) {
      expect(svg.closest("[aria-hidden='true']")).not.toBeNull()
    }
  })

  it("keeps the offer's name as a real heading on the banner", () => {
    render(<OffersPanels banners={[banner({ title: "Winter shop" })]} />)

    expect(screen.getByRole("heading", { level: 3, name: "Winter shop" })).toBeTruthy()
  })

  /** A real 16:9 promo image replaces the drawn banner; the name then sits below it, still as text. */
  it("swaps the drawn banner for a promo image when given one", () => {
    const { container } = render(
      <OfferBannerCard banner={banner({ title: "Winter shop" })} theme={OFFER_THEMES[0]!} imageUrl="https://example.test/p.jpg" />,
    )

    const img = container.querySelector("img")!
    expect(img.className).toContain("object-cover")
    expect(container.querySelector("[style*='--promo-'] svg")).toBeNull()
    expect(screen.getByRole("heading", { level: 3, name: "Winter shop" }).closest("[style*='--promo-']")).toBeNull()
  })

  it("badges an offer that carries a code, and only that one", () => {
    render(<OffersPanels banners={[banner({ code: "FRESH10" }), banner({ key: "n", code: null })]} />)

    expect(screen.getAllByText("Code")).toHaveLength(1)
  })

  /**
   * ⚠ 029's open carry-forward: `customer-web` advertised a promotion WITHOUT its terms, so a shopper
   * with a minimum-spend offer learned of the condition first at payment. FR-037d forbids that.
   */
  it("shows the promotion's terms when it has any", () => {
    render(<OffersPanels banners={[banner({ terms: "On orders over $30" })]} />)

    expect(screen.getByText("On orders over $30")).toBeTruthy()
  })

  it("omits the terms line entirely when a promotion has no conditions", () => {
    const { container } = render(<OffersPanels banners={[banner({ terms: null })]} />)

    expect(container.textContent).not.toMatch(/on orders over/i)
  })

  it("names each panel for assistive technology", () => {
    render(<OffersPanels banners={[banner({ title: "Winter shop" })]} />)

    expect(screen.getByRole("link", { name: "View offer: Winter shop" })).toBeTruthy()
  })
})
