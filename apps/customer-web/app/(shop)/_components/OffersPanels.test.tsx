import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { BannerDTO } from "@effy/shared-types"

import { OffersPanels } from "./OffersPanels"

function banner(over: Partial<BannerDTO> = {}): BannerDTO {
  return {
    key: "b1",
    title: "20% off your first grocery order",
    subtitle: "Applied at checkout",
    imageUrl: "https://example.test/promo.jpg",
    href: "/promotions/b1",
    placement: "inline",
    ...over,
  }
}

function many(n: number): BannerDTO[] {
  return Array.from({ length: n }, (_, i) =>
    banner({ key: `b${i}`, title: `Offer ${i}`, href: `/promotions/b${i}` }),
  )
}

describe("OffersPanels — the composition degrades, it never pads (FR-018)", () => {
  it("renders one large panel and two stacked for three offers", () => {
    render(<OffersPanels banners={many(3)} />)

    expect(screen.getAllByRole("link")).toHaveLength(3)
  })

  it("renders only what it has data for with two offers", () => {
    render(<OffersPanels banners={many(2)} />)

    expect(screen.getAllByRole("link")).toHaveLength(2)
  })

  it("renders a single panel for one offer", () => {
    render(<OffersPanels banners={many(1)} />)

    expect(screen.getAllByRole("link")).toHaveLength(1)
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

    expect(screen.getAllByRole("link")).toHaveLength(3)
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

    expect(screen.getByRole("link").getAttribute("href")).toBe("/promotions/x")
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

    expect(screen.getByRole("link").getAttribute("href")).toBe("/promotions/abc")
  })

  it("never sends a promotion to the unfiltered store", () => {
    render(<OffersPanels banners={many(3)} />)

    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).not.toBe("/search")
    }
  })

  /**
   * ⚠ A tap that does nothing is worse than no tap (the rule `BannerTarget` states for mobile). A
   * promotion with no destination renders as a panel, not as a dead link.
   */
  it("renders a non-tappable panel when there is no destination at all", () => {
    render(<OffersPanels banners={[banner({ href: null, target: null })]} />)

    expect(screen.queryByRole("link")).toBeNull()
    expect(screen.getByText(/20% off/)).toBeTruthy()
  })
})

describe("OffersPanels — the message survives the artwork", () => {
  it("puts a scrim over every panel, whatever the image is", () => {
    const { container } = render(<OffersPanels banners={many(3)} />)

    expect(container.querySelectorAll("[class*='bg-linear']")).toHaveLength(3)
  })

  it("renders a neutral tile instead of a broken frame when a promotion has no artwork", () => {
    const { container } = render(
      <OffersPanels banners={[banner({ imageUrl: null, title: "Winter shop" })]} />,
    )

    expect(container.querySelector("img")).toBeNull()
    expect(screen.getByText("W")).toBeTruthy()
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

    expect(screen.getByRole("link", { name: "Winter shop" })).toBeTruthy()
  })
})
