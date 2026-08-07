import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { VALUE_CLAIMS, ValueStrip } from "./ValueStrip"

/** WCAG relative luminance / contrast, so the panel colours are checked rather than asserted. */
function luminance(hex: string): number {
  const h = hex.replace("#", "")
  const channel = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * ⚠ WHAT THIS EXISTS TO STOP. The reference template this page adapts prints "200+ International
 * Brands / 2,000+ High-Quality Products / 30,000+ Happy Customers" across the hero. Effy has none of
 * those things. A claim like that is not a design detail — it is a false statement about the business,
 * shown to the public, in the largest type on the page.
 *
 * FR-010 says every claim must be true of the platform **as built**. That is not mechanically checkable
 * in general, so this checks the SHAPES such lies take: a boast-count (`200+`), a rating, a review
 * count, a guarantee. Anything matching those has to be justified by someone editing this test.
 */
describe("ValueStrip — every claim is true of the platform as built (FR-010)", () => {
  const allText = VALUE_CLAIMS.flatMap((c) => [c.value, c.label]).join(" ")

  it("makes no boast-count claim (`200+`, `2,000+`, `30,000+`)", () => {
    expect(allText).not.toMatch(/\d[\d,]*\s*\+/)
  })

  it("claims no rating, no reviews and no guarantee", () => {
    expect(allText.toLowerCase()).not.toMatch(/\brated\b|\breviews?\b|\bguarantee[ds]?\b|\bstars?\b/)
  })

  it("states no bare numeric quantity at all", () => {
    expect(allText).not.toMatch(/\d/)
  })

  it("renders every claim it declares", () => {
    render(<ValueStrip />)

    for (const claim of VALUE_CLAIMS) {
      expect(screen.getByText(claim.value)).toBeTruthy()
      expect(screen.getByText(claim.label)).toBeTruthy()
    }
  })
})

/**
 * ⚠ THE COLOURED PANELS ARE A RECORDED EXCEPTION to Principle V's monochrome rule, taken on operator
 * direction. These tests hold the exception to its stated scope — an exception nobody polices becomes a
 * palette.
 */
describe("ValueStrip — the colour exception stays scoped", () => {
  it("applies the fills inline, NOT as design tokens or utility classes", () => {
    const { container } = render(<ValueStrip />)
    const panels = Array.from(container.querySelectorAll("div[style]"))

    expect(panels).toHaveLength(3)

    // ⚠ If these ever become `bg-*` utilities or CSS variables, they have entered the design system.
    // Inline styles keep them provably local to this component.
    for (const p of panels) {
      expect(p.getAttribute("style")).toMatch(/background-color/)
      expect(p.className).not.toMatch(/\bbg-/)
    }
  })

  it("uses exactly the three operator-specified fills and no others", () => {
    const { container } = render(<ValueStrip />)
    const fills = Array.from(container.querySelectorAll("div[style]")).map((p) =>
      (p as HTMLElement).style.backgroundColor,
    )

    expect(fills).toEqual(["rgb(249, 95, 9)", "rgb(55, 65, 40)", "rgb(107, 178, 82)"])
  })
})

/**
 * ⚠ THE REFERENCE'S OWN PANELS FAIL WCAG AA with white text — orange 3.15:1, green 2.59:1. Copying it
 * faithfully would ship body copy nobody with low vision could read. The fills are kept exactly as
 * specified and the FOREGROUND is chosen per panel instead.
 *
 * This computes the ratios rather than trusting the comment beside them, so that changing a fill
 * without rechecking its text colour fails here instead of in front of a shopper.
 */
describe("ValueStrip — every panel meets WCAG AA (SC-009)", () => {
  const FOREGROUND = { "rgb(249, 95, 9)": "#0A0A0A", "rgb(55, 65, 40)": "#FFFFFF", "rgb(107, 178, 82)": "#0A0A0A" } as const

  it("pairs each fill with a foreground at or above 4.5:1", () => {
    const { container } = render(<ValueStrip />)

    for (const panel of Array.from(container.querySelectorAll("div[style]"))) {
      const bg = (panel as HTMLElement).style.backgroundColor as keyof typeof FOREGROUND
      const fg = FOREGROUND[bg]
      expect(fg, `no declared foreground for ${bg}`).toBeDefined()

      const hex =
        "#" +
        (bg.match(/\d+/g) ?? [])
          .map((n) => Number(n).toString(16).padStart(2, "0"))
          .join("")
      expect(contrast(hex, fg)).toBeGreaterThanOrEqual(4.5)
    }
  })

  /** The measurement that forced the decision — kept so nobody "restores" white text everywhere. */
  it("records that white text would FAIL on two of the three fills", () => {
    expect(contrast("#F95F09", "#FFFFFF")).toBeLessThan(4.5)
    expect(contrast("#6BB252", "#FFFFFF")).toBeLessThan(4.5)
    expect(contrast("#374128", "#FFFFFF")).toBeGreaterThanOrEqual(4.5)
  })
})

describe("ValueStrip — accessibility", () => {
  it("hides the decorative icons from assistive technology", () => {
    const { container } = render(<ValueStrip />)
    const icons = container.querySelectorAll("svg")

    expect(icons).toHaveLength(3)
    for (const icon of Array.from(icons)) {
      expect(icon.getAttribute("aria-hidden")).toBe("true")
    }
  })

  /** SC-009: meaning never rests on colour alone — each panel's words carry it without the fill. */
  it("states each claim in words, so the colour carries no meaning", () => {
    render(<ValueStrip />)

    for (const claim of VALUE_CLAIMS) {
      expect(screen.getByText(claim.value).textContent).toBeTruthy()
    }
  })
})
