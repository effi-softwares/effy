import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { OffersBento, type OfferTile } from "./OffersBento"

const tile = (id: string, over: Partial<OfferTile> = {}): OfferTile => ({
  id,
  size: "small",
  headline: `Offer ${id}`,
  ctaLabel: "Shop now",
  ctaHref: "/search",
  imageUrl: `https://example.test/${id}.jpg`,
  alt: `Artwork for offer ${id}`,
  ...over,
})

const tiles = (n: number, sizes: string[] = []) =>
  Array.from({ length: n }, (_, i) => tile(String(i), sizes[i] ? { size: sizes[i]! } : {}))

describe("the degradation ladder (FR-018/FR-029)", () => {
  /**
   * ⚠ THE DEGRADATION IS THE GRID'S, NOT A SET OF LAYOUTS. There is no "3-tile layout" to fall out of
   * step with the 5-tile one: tiles declare their own span and the grid fills the gaps. So what these
   * tests pin is that every count renders EVERY tile it was given and never invents one — which is
   * the property a per-count branch would eventually break.
   */
  for (const n of [5, 3, 2, 1]) {
    it(`renders all ${n} tiles, with nothing added and nothing dropped`, () => {
      render(<OffersBento tiles={tiles(n)} />)
      expect(screen.getAllByRole("listitem")).toHaveLength(n)
      expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(n)
    })
  }

  /**
   * ⚠ NOTHING, NOT AN EMPTY FRAME. A promotional block with a placeholder in it is indistinguishable
   * from one whose images failed to load — and the second is what a shopper will assume, because it
   * is what they have seen elsewhere. The section heading must go too: a heading over blank space is
   * the empty frame by another name.
   */
  it("renders NOTHING at all when there are no tiles", () => {
    const { container } = render(<OffersBento tiles={[]} title="Offers" />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe("no placeholder is ever emitted (T050)", () => {
  it("omits the artwork frame entirely when a tile has no image", () => {
    // ⚠ Not a grey box, not an initial, not a "no image" label. A tile whose photograph is missing is
    // a tile that renders as copy — which reads as a design choice rather than as a broken load.
    render(<OffersBento tiles={[tile("a", { imageUrl: null })]} />)
    expect(screen.queryByRole("img")).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Offer a")
    expect(screen.getByRole("link")).toBeInTheDocument()
  })

  it("never renders a tile with no headline of its own", () => {
    render(<OffersBento tiles={tiles(3)} />)
    for (const h of screen.getAllByRole("heading", { level: 3 })) {
      expect(h.textContent?.trim()).not.toBe("")
    }
  })
})

describe("the tile is a panel with one control, not a link around a button (FR-027)", () => {
  /**
   * ⚠ A STRETCHED LINK WRAPPING A CALL TO ACTION NESTS INTERACTIVE CONTENT. That is invalid HTML, it
   * gives a screen reader two overlapping targets for one destination, and it makes the inner control
   * unreachable by pointer. 029 shipped exactly this shape on the promo hero and had to unpick it.
   */
  it("gives each tile exactly one link", () => {
    render(<OffersBento tiles={tiles(4)} />)
    expect(screen.getAllByRole("link")).toHaveLength(4)
  })

  it("never nests a link inside a link", () => {
    const { container } = render(<OffersBento tiles={tiles(3)} />)
    for (const a of container.querySelectorAll("a")) {
      expect(a.querySelector("a")).toBeNull()
      expect(a.closest("a")).toBe(a)
    }
  })

  /**
   * ⚠ SIX TILES WHOSE CONTROLS ALL READ "SHOP NOW" give a screen-reader user navigating by link a
   * list of six identical entries and no way to tell which offer each belongs to. 028 found exactly
   * this with five identical "See all" controls.
   */
  it("identifies each tile's offer in the control's accessible name", () => {
    render(<OffersBento tiles={[tile("a"), tile("b")]} />)
    expect(screen.getByRole("link", { name: /Shop now[\s\S]*Offer a/ })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Shop now[\s\S]*Offer b/ })).toBeInTheDocument()
  })

  it("sends the control to the tile's authored destination", () => {
    render(<OffersBento tiles={[tile("a", { ctaHref: "/browse/bakery" })]} />)
    expect(screen.getByRole("link")).toHaveAttribute("href", "/browse/bakery")
  })
})

describe("copy never sits on artwork (T057 — the mechanical form of FR-034/SC-009)", () => {
  /**
   * ⚠ THIS IS WHY NO PIXEL DECODER IS NEEDED ANYWHERE ON THE PLATFORM.
   *
   * Text over an operator-supplied photograph has no contrast guarantee — the artwork check verifies
   * DIMENSIONS, not brightness. 029 shipped a scrim that bleached the photo in light mode, because
   * the artwork is the same picture in both appearances while everything around it inverts.
   *
   * Rather than measure luminance, the tile is built so the case cannot arise: the copy is a SIBLING
   * of the artwork, never a descendant, and it sits on a design-system token whose contrast is
   * already machine-checked at AA in both appearances. jsdom computes no layout, so this asserts the
   * containment relationship — which is what actually determines whether one can overlap the other.
   */
  it("puts the copy outside the artwork's element, not inside it", () => {
    const { container } = render(<OffersBento tiles={[tile("a")]} />)
    const heading = screen.getByRole("heading", { level: 3 })
    const image = container.querySelector("img")

    expect(image).not.toBeNull()
    // The heading is not inside the artwork's subtree...
    expect(image!.closest("div")?.contains(heading)).toBe(false)
    // ...and the artwork is not inside the copy panel's.
    expect(heading.parentElement?.contains(image!)).toBe(false)
  })

  it("offers no positioning that could place copy over the image", () => {
    // ⚠ `absolute` on the copy panel is the one edit that would reintroduce the overlay, and it
    // compiles, renders, and looks intentional. There is no `variant` field to reach it through
    // either — the catalogue test in shared-types asserts that separately.
    const { container } = render(<OffersBento tiles={[tile("a")]} />)
    const heading = screen.getByRole("heading", { level: 3 })
    let node: HTMLElement | null = heading
    while (node && node !== container) {
      expect(node.className).not.toMatch(/\babsolute\b/)
      node = node.parentElement
    }
  })
})

describe("the phone layout", () => {
  /**
   * ⚠ EVERY SPAN IS `sm:`-PREFIXED. An unprefixed `col-span-2` applies at every breakpoint — which is
   * exactly the backwards-layout defect 039 shipped with `order-first`, where the desktop looked
   * right and the phone was wrong for weeks. In a one-column grid a stray span would make one tile
   * silently vanish.
   */
  it("applies no column or row span below the sm breakpoint", () => {
    render(<OffersBento tiles={tiles(4, ["large", "wide", "tall", "small"])} />)
    for (const li of screen.getAllByRole("listitem")) {
      for (const cls of li.className.split(/\s+/)) {
        if (/^(col-span|row-span)-/.test(cls)) {
          throw new Error(`"${cls}" is unprefixed — it would apply on a phone too`)
        }
      }
    }
  })

  it("gives each authored size its own desktop span", () => {
    render(<OffersBento tiles={tiles(4, ["large", "wide", "tall", "small"])} />)
    const [large, wide, tall, small] = screen.getAllByRole("listitem")
    expect(large!.className).toContain("sm:col-span-2")
    expect(large!.className).toContain("sm:row-span-2")
    expect(wide!.className).toContain("sm:col-span-2")
    expect(tall!.className).toContain("sm:row-span-2")
    expect(small!.className).not.toContain("sm:col-span-2")
  })
})

describe("artwork description (FR-026)", () => {
  it("carries the operator's description through to the image", () => {
    render(<OffersBento tiles={[tile("a", { alt: "A basket of vegetables" })]} />)
    expect(screen.getByRole("img", { name: "A basket of vegetables" })).toBeInTheDocument()
  })

  it("treats an empty description as a decorative declaration", () => {
    // ⚠ Empty alt is CORRECT markup for decorative artwork and WRONG for everything else. It reaches
    // here only when an operator ticked "decorative" — the publish validator refuses silence.
    const { container } = render(<OffersBento tiles={[tile("a", { alt: "" })]} />)
    expect(container.querySelector("img")).toHaveAttribute("alt", "")
  })
})
