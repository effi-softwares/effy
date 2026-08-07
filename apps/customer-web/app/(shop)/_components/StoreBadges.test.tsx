import { readFileSync } from "node:fs"
import { join } from "node:path"

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { AppPromo } from "./AppPromo"
import { StoreBadges } from "./StoreBadges"

describe("StoreBadges — present, but they go nowhere (FR-021)", () => {
  it("renders both store marks", () => {
    render(<StoreBadges />)

    expect(screen.getByLabelText(/google play/i)).toBeTruthy()
    expect(screen.getByLabelText(/app store/i)).toBeTruthy()
  })

  /**
   * ⚠ NOT LINKS AND NOT BUTTONS. A disabled `<a>` is still focusable and still announced as a link,
   * promising a destination that does not exist; a `<button disabled>` promises an action. The apps are
   * unpublished, so the honest control is no control at all.
   */
  it("emits no link and no button", () => {
    const { container } = render(<StoreBadges />)

    expect(container.querySelectorAll("a")).toHaveLength(0)
    expect(container.querySelectorAll("button")).toHaveLength(0)
    expect(screen.queryAllByRole("link")).toHaveLength(0)
    expect(screen.queryAllByRole("button")).toHaveLength(0)
  })

  /**
   * ⚠ SC-009 — meaning never rests on colour or opacity alone. A dimmed badge with no words is
   * indistinguishable from a broken image, and a screen reader announces nothing at all about it.
   */
  it("says 'coming soon' in words, in each badge's accessible name", () => {
    render(<StoreBadges />)

    expect(screen.getByLabelText("Google Play — coming soon")).toBeTruthy()
    expect(screen.getByLabelText("App Store — coming soon")).toBeTruthy()
  })

  it("hides the decorative marks from assistive technology", () => {
    const { container } = render(<StoreBadges />)

    for (const svg of Array.from(container.querySelectorAll("svg"))) {
      expect(svg.getAttribute("aria-hidden")).toBe("true")
    }
  })
})

/**
 * ⚠ THE SOURCE-LEVEL GUARD. This is the constitution's real-world-identifier rule made mechanical: an
 * app-store URL for an unpublished app would have to be INVENTED, and a wrong outward-facing value that
 * silently works reaches real people before anyone notices.
 *
 * It greps the modules' own text rather than the render output, because a URL could be introduced in a
 * constant, a comment that later gets uncommented, or a branch this test does not exercise.
 */
describe("no invented store URL exists anywhere in the section (FR-021)", () => {
  const SOURCES = ["StoreBadges.tsx", "AppPromo.tsx"] as const

  for (const file of SOURCES) {
    it(`${file} contains no store URL or app id`, () => {
      const source = readFileSync(join(__dirname, file), "utf8")

      expect(source).not.toMatch(/apps\.apple\.com/i)
      expect(source).not.toMatch(/play\.google\.com/i)
      expect(source).not.toMatch(/itunes\.apple\.com/i)
      expect(source).not.toMatch(/\bid\d{9,}\b/) // an App Store numeric id
      expect(source).not.toMatch(/com\.effyshopping\.[a-z]+\.mobile/) // an Android package id
      expect(source).not.toMatch(/https?:\/\//)
    })
  }
})

describe("AppPromo — honest about availability (FR-022)", () => {
  it("makes no claim that the apps can be downloaded today", () => {
    const { container } = render(<AppPromo />)
    const text = (container.textContent ?? "").toLowerCase()

    expect(text).not.toMatch(/download (it |the |our )?(now|today)/)
    expect(text).not.toMatch(/available (on|now|today)/)
    expect(text).not.toMatch(/get it on/)
    expect(text).toMatch(/on its way|coming soon|isn|when it is/)
  })

  it("makes no invented rating or install-count claim", () => {
    const { container } = render(<AppPromo />)
    const text = container.textContent ?? ""

    expect(text).not.toMatch(/\d[\d,.]*\s*(\+|stars?|reviews?|downloads?|installs?)/i)
    expect(text).not.toMatch(/\brated\b/i)
  })

  it("renders the neutral placeholder rather than a mockup of a screen that does not exist", () => {
    const { container } = render(<AppPromo />)

    expect(container.querySelector("img")).toBeNull()
  })

  /** SC-009 — the page's single h1 belongs to the page; every section heads at h2. */
  it("heads itself at h2", () => {
    render(<AppPromo />)

    expect(screen.getByRole("heading", { level: 2, name: /effy app/i })).toBeTruthy()
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull()
  })
})
