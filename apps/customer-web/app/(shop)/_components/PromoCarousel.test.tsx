import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { BannerDTO } from "@effy/shared-types"

import { PromoCarousel } from "./PromoCarousel"

function banner(over: Partial<BannerDTO> = {}): BannerDTO {
  return {
    key: "3f2a",
    title: "20% off your first order",
    subtitle: "Stock up",
    imageUrl: "https://example.test/a.png",
    href: "/promotions/3f2a",
    ...over,
  }
}

/**
 * ⚠ WHAT THIS EXISTS TO STOP COMING BACK.
 *
 * The banner is the most prominent link on the storefront, and for its whole life it pointed at
 * `/search` — the unfiltered store — for EVERY promotion. Tapping it opened a product list carrying
 * none of the promotion's facts: not the code, not the terms. The shopper lost the offer on the way
 * to it, and nothing in this app tested where the banner led.
 */
describe("PromoCarousel — where a banner leads (028 FR-034a)", () => {
  it("links a banner to its own promotion, not to a product list", () => {
    render(<PromoCarousel banners={[banner()]} />)

    const link = screen.getByRole("link", { name: "20% off your first order" })
    expect(link).toHaveAttribute("href", "/promotions/3f2a")
  })

  // ⚠ THE DESTINATION ITSELF IS NOT GUARDED HERE, and pretending otherwise would be the more
  // dangerous kind of green test. This component links to whatever `href` it is handed; the choice of
  // destination belongs to `core-api`'s `banners()`, and that is where it is pinned —
  // `banner_test.go` asserts `href == "/promotions/" + key` and that it agrees with the `target` the
  // native clients read. A component test rejecting `/search` would only prove this file's fixture.

  it("renders a banner with no href as plain, non-tappable content", () => {
    // A tap that goes nowhere is worse than no tap — the same rule the mobile renderer applies to a
    // target it does not understand.
    render(<PromoCarousel banners={[banner({ href: null })]} />)

    expect(screen.queryByRole("link")).not.toBeInTheDocument()
    expect(screen.getByText("20% off your first order")).toBeInTheDocument()
  })

  it("renders nothing when no promotion is advertised", () => {
    // FR-035, and the state that is NOT backward compatible: this list used to always hold a derived
    // "welcome" stub and is now empty whenever nothing is advertised.
    const { container } = render(<PromoCarousel banners={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("drops a promotion with no artwork rather than rendering a bare claim", () => {
    const { container } = render(<PromoCarousel banners={[banner({ imageUrl: null })]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
