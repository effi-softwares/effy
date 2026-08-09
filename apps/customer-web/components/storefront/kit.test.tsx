import { render, screen } from "@testing-library/react"
import { ARTWORK_CANVASES } from "@effy/shared-types"
import { describe, expect, it } from "vitest"

import { MediaFrame, Scrim, SectionShell, onScrim } from "./kit"

/**
 * The three primitives the 039 merchandised landing is built on.
 *
 * ⚠ WHAT THESE EXIST TO STOP COMING BACK. Each one encodes a defect this platform has already
 * shipped once:
 *
 *  • `MediaFrame`  — 028 shipped a placeholder that only ran when the URL was null, so an image that
 *                    was merely *loading* had no loading state at all.
 *  • `Scrim`       — 029 shipped a scrim that used a design token, so it INVERTED with the appearance
 *                    while the photograph underneath did not; light mode bleached the artwork and put
 *                    dark type on a white film over a busy image.
 *  • `SectionShell`— FR-004's self-hiding rule, repeated per section, is a rule one section eventually
 *                    forgets. The empty-array case is the one a caller actually hits.
 */

describe("MediaFrame — absence is a supported state (FR-011/FR-014)", () => {
  it("renders the neutral placeholder and NO <img> when src is null", () => {
    const { container } = render(<MediaFrame src={null} alt="" fallbackLabel="P" />)

    expect(container.querySelector("img")).toBeNull()
    expect(screen.getByText("P")).toBeTruthy()
  })

  it("renders the placeholder for undefined too — a missing field is the same as an absent one", () => {
    const { container } = render(<MediaFrame src={undefined} alt="" fallbackLabel="Q" />)

    expect(container.querySelector("img")).toBeNull()
  })

  it("renders an image when given one", () => {
    const { container } = render(
      <MediaFrame src="https://example.test/a.png" alt="A tomato" ratio="wide" />,
    )

    expect(container.querySelector("img")).not.toBeNull()
  })

  /**
   * ⚠ SC-001's "no layout shift when the hero art loads" lives here, not in a visual check. The box is
   * sized by the CONTAINER's aspect ratio, so the placeholder and the photograph occupy the same
   * space. If the ratio class ever moved onto the <img>, this fails — and the page would start
   * jumping when artwork arrives.
   */
  it("reserves the box on the container in BOTH states, so nothing resizes when art arrives", () => {
    const { container: withArt } = render(
      <MediaFrame src="https://example.test/a.png" alt="" ratio="portrait" />,
    )
    const { container: without } = render(<MediaFrame src={null} alt="" ratio="portrait" />)

    expect(withArt.firstElementChild?.className).toContain("aspect-[4/5]")
    expect(without.firstElementChild?.className).toContain("aspect-[4/5]")
  })

  /**
   * ⚠ THIS TEST REPLACES ONE THAT PINNED A DEFECT (042 T065). It used to assert `ratio="banner"`
   * produced `aspect-[2/1]` — a number hardcoded here while the platform's canvas definition lived in
   * `shared-types`. Two numbers for one shape, with nothing keeping them equal, on a design whose
   * stated promise is that artwork is NEVER CROPPED. That promise holds only when the accepted shape
   * and the rendered box share a ratio, which cannot be true by coincidence.
   *
   * The `banner` option is deleted rather than deprecated: leaving it would leave the second number
   * reachable. The box is now driven from the canvas itself.
   */
  it("takes its box from the canvas the platform actually accepts", () => {
    const { container } = render(
      <MediaFrame src="https://example.test/a.png" alt="" canvas="tile-wide" />,
    )
    const box = container.firstElementChild as HTMLElement
    const c = ARTWORK_CANVASES["tile-wide"]
    expect(box.style.aspectRatio).toBe(`${c.width} / ${c.height}`)
    // ⚠ An inline style, NOT a class — Tailwind scans source text, so an interpolated
    // `aspect-[${w}/${h}]` produces no CSS at all and the box silently collapses to nothing.
    expect(box.className).not.toMatch(/aspect-/)
  })

  it("reserves that box in the empty state too, so nothing jumps when the artwork arrives", () => {
    const { container } = render(<MediaFrame src={null} alt="" canvas="tile-tall" />)
    const c = ARTWORK_CANVASES["tile-tall"]
    expect((container.firstElementChild as HTMLElement).style.aspectRatio).toBe(
      `${c.width} / ${c.height}`,
    )
  })

  it("keeps the placeholder out of the accessibility tree — the surrounding text names the thing", () => {
    const { container } = render(<MediaFrame src={null} alt="" fallbackLabel="P" />)

    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })
})

describe("Scrim — the one colour that must NOT invert (FR-007, 029's defect)", () => {
  it("is a fixed dark veil, never an appearance-dependent token", () => {
    const { container } = render(<Scrim />)
    const cls = container.firstElementChild?.className ?? ""

    // The failure mode: `bg-card`, `bg-background`, `bg-muted` and friends all flip with the
    // appearance. The photograph underneath does not.
    expect(cls).not.toMatch(/bg-(card|background|muted|popover|secondary|accent)\b/)
    expect(cls).toContain("from-black/")
  })

  it("runs vertically, so it is strongest where bottom-anchored text sits", () => {
    const { container } = render(<Scrim />)

    // 029's ran bottom-left→top-right (`bg-gradient-to-tr`), weakest exactly under the title.
    expect(container.firstElementChild?.className).toContain("bg-gradient-to-t")
    expect(container.firstElementChild?.className).not.toContain("bg-gradient-to-tr")
  })

  it("introduces no hue — every colour is an end of the neutral ramp", () => {
    const { container } = render(<Scrim strength="strong" />)
    const cls = container.firstElementChild?.className ?? ""

    expect(cls).not.toMatch(/#[0-9a-fA-F]{3,8}/)
    expect(cls).not.toMatch(
      /\b(?:from|via|to|bg|text)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-/,
    )
  })

  it("pairs with a fixed LIGHT type colour, for the same reason", () => {
    expect(onScrim).toBe("text-white")
  })

  it("is hidden from assistive technology — it carries no meaning", () => {
    const { container } = render(<Scrim />)

    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true")
  })
})

describe("SectionShell — self-hiding is structural, not per-section (FR-004)", () => {
  it("renders nothing when handed no children", () => {
    const { container } = render(<SectionShell title="On sale">{null}</SectionShell>)

    expect(container.innerHTML).toBe("")
  })

  /**
   * ⚠ THE CASE A CALLER ACTUALLY HITS. `items.map(...)` over an empty list yields `[]`, which is
   * TRUTHY — so a naive `!children` guard renders the heading above a blank space. That is the empty
   * frame FR-004 forbids, and it is the single most likely way to produce one.
   */
  it("renders nothing for an EMPTY ARRAY, which is truthy", () => {
    const { container } = render(<SectionShell title="On sale">{[]}</SectionShell>)

    expect(container.innerHTML).toBe("")
  })

  it("renders nothing for an array of all-falsy children", () => {
    const { container } = render(
      <SectionShell title="On sale">{[null, false, undefined]}</SectionShell>,
    )

    expect(container.innerHTML).toBe("")
  })

  it("renders the section when it has real content", () => {
    render(
      <SectionShell title="On sale" href="/search?saleOnly=true">
        <p>a product</p>
      </SectionShell>,
    )

    expect(screen.getByText("a product")).toBeTruthy()
    expect(screen.getByRole("link", { name: "View all" }).getAttribute("href")).toBe(
      "/search?saleOnly=true",
    )
  })

  /** SC-009: the page has exactly one h1 (the sr-only page title). A section never picks its own level. */
  it("always heads the section at h2, never h1", () => {
    render(<SectionShell title="On sale">content</SectionShell>)

    expect(screen.getByRole("heading", { level: 2, name: "On sale" })).toBeTruthy()
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull()
  })
})
