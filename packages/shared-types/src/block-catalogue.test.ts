import { describe, expect, it } from "vitest"

import {
  BLOCK_CATALOGUE,
  BLOCK_TYPES,
  DESTINATION_KINDS,
  FIELD_KINDS,
  type BlockField,
  blockDefinition,
} from "./block-catalogue"

/**
 * ⚠ THE FIRST TEST IN THIS FILE IS THE IMPORTANT ONE, and it guards a NEGATIVE requirement.
 *
 * FR-007 says the composer offers no control over colour, typography, spacing or alignment. That is
 * true today only because no field kind is capable of carrying one — and the constitution's monochrome
 * guarantee leans on it: `check-tokens` fails the build on a stray hex in SOURCE, but a colour stored
 * in a database row is invisible to it. So a ninth field kind would silently open a hole in the design
 * system that nothing else on the platform would notice.
 *
 * A test asserting a list's contents looks like tautology. It is not: it is the only thing standing
 * between "the guard is complete" and "the guard has a database-shaped hole".
 */
describe("the field-kind vocabulary is closed", () => {
  it("is EXACTLY these eight kinds — adding one is a constitutional question, not a typing exercise", () => {
    expect([...FIELD_KINDS]).toEqual([
      "text",
      "longText",
      "enum",
      "boolean",
      "reference",
      "destination",
      "artwork",
      "list",
    ])
  })

  it("has no kind capable of carrying a colour, size, spacing value or markup", () => {
    const forbidden = ["colour", "color", "size", "spacing", "font", "typography", "align", "html", "richText", "markdown"]
    for (const f of forbidden) {
      expect(FIELD_KINDS as readonly string[]).not.toContain(f)
    }
  })

  /** No field anywhere in the catalogue may use a kind outside the vocabulary. */
  it("is respected by every field of every block type", () => {
    const walk = (fields: readonly BlockField[]): void => {
      for (const f of fields) {
        expect(FIELD_KINDS as readonly string[]).toContain(f.kind)
        if (f.kind === "list") walk(f.of)
      }
    }
    for (const type of BLOCK_TYPES) walk(BLOCK_CATALOGUE[type].fields)
  })
})

describe("the block catalogue is closed and complete", () => {
  it("defines every declared type, and nothing beyond them", () => {
    expect(Object.keys(BLOCK_CATALOGUE).sort()).toEqual([...BLOCK_TYPES].sort())
  })

  /**
   * ⚠ `recently_viewed` is here because the page inventory (T008a) found it rendering on the home
   * page and absent from every earlier draft of the catalogue. Without it an operator reorders the
   * page and one section refuses to move, with no explanation available to them.
   */
  it("includes recently_viewed, which the plan originally missed", () => {
    expect(BLOCK_TYPES).toContain("recently_viewed")
    expect(BLOCK_CATALOGUE.recently_viewed.resolution).toBe("client-island")
    // Its content is the shopper's own device-local history — there is nothing to author but position.
    expect(BLOCK_CATALOGUE.recently_viewed.fields).toHaveLength(0)
  })

  /**
   * ⚠ RESOLVED 2026-08-09 (T008c). The promotions-driven carousel won and both static heroes were
   * deleted from the storefront — so `hero` is a block, and it is FIRST in the catalogue because it
   * is first on the page.
   */
  it("defines hero, and puts it first", () => {
    expect(BLOCK_TYPES[0]).toBe("hero")
    expect(blockDefinition("hero")).not.toBeNull()
  })

  /**
   * ⚠ THE ASSERTION THAT MATTERS ABOUT THE HERO, and it is about where its CONTENT comes from.
   *
   * The carousel that won is built from advertised promotions today — and this feature DELETES the
   * advertising facet on discount codes. Carried over unchanged, the largest element on the
   * storefront would be fed by a column that no longer exists. So the hero authors its own slides,
   * and a promotion is optional: it lends the slide a live window, it is not the slide's content.
   */
  it("authors its own slides rather than depending on a promotion existing", () => {
    const slides = BLOCK_CATALOGUE.hero.fields.find((f) => f.key === "slides")
    if (slides?.kind !== "list") throw new Error("hero slides must be a list field")
    expect(slides.required).toBe(true)

    const byKey = new Map(slides.of.map((f) => [f.key, f]))
    // The words and the artwork are the operator's, and required.
    for (const key of ["headline", "ctaLabel", "ctaDestination", "artwork"]) {
      expect(byKey.get(key)?.required, `${key} must be required on a hero slide`).toBe(true)
    }
    // The promotion is a schedule the slide may borrow — never a prerequisite for having a hero.
    expect(byKey.get("promoCodeId")?.required).toBe(false)
  })

  it("accepts a single-slide hero, because a store with one thing to say still has a hero", () => {
    const slides = BLOCK_CATALOGUE.hero.fields.find((f) => f.key === "slides")
    if (slides?.kind !== "list") throw new Error("hero slides must be a list field")
    expect(slides.min).toBe(1)
    expect(slides.max).toBe(6)
  })

  /**
   * ⚠ THE HERO IS THE ONE DELIBERATE EXCEPTION to FR-007's copy-off-artwork rule, and the exception is
   * bounded by the ASSET rather than by a control. A hero slide has no `variant` or `overlay` field
   * either — the operator cannot choose a text treatment here any more than they can on an offer
   * tile. What differs is only that the hero's layout places copy over the image by design.
   */
  it("still offers no control over how copy is treated", () => {
    const slides = BLOCK_CATALOGUE.hero.fields.find((f) => f.key === "slides")
    if (slides?.kind !== "list") throw new Error("hero slides must be a list field")
    const keys = slides.of.map((f) => f.key)
    expect(keys).not.toContain("variant")
    expect(keys).not.toContain("textTreatment")
    expect(keys).not.toContain("overlay")
    expect(keys).not.toContain("align")
  })

  it("returns null for a type this build does not know, rather than throwing", () => {
    // FR-042: an unknown block is data to be omitted, never a parse error that fails the page.
    expect(blockDefinition("not_a_block")).toBeNull()
  })

  it("gives every type at least one preset — never a blank shell (FR-003)", () => {
    for (const type of BLOCK_TYPES) {
      expect(BLOCK_CATALOGUE[type].presets.length).toBeGreaterThanOrEqual(1)
    }
  })

  it("gives every text field an enforceable maximum length", () => {
    const walk = (fields: readonly BlockField[]): void => {
      for (const f of fields) {
        if (f.kind === "text" || f.kind === "longText") {
          // ⚠ Enforced server-side by `layout_field_too_long`. A limit that exists only in the
          // composer's input is not a limit — the operator can reach the API directly (FR-032).
          expect(f.maxLength).toBeGreaterThan(0)
        }
        if (f.kind === "list") walk(f.of)
      }
    }
    for (const type of BLOCK_TYPES) walk(BLOCK_CATALOGUE[type].fields)
  })
})

describe("destinations", () => {
  /**
   * ⚠ NARROWED FROM FIVE KINDS TO FOUR. 042 retires the promotion-detail page, so keeping a
   * `promotion` destination would let an operator author a tile pointing at a route that no longer
   * exists — precisely the defect 029 fixed, where every banner pointed at the unfiltered store for
   * its entire life because nothing asserted where a link led.
   */
  it("cannot point at a promotion, because this feature deletes the page it pointed at", () => {
    expect([...DESTINATION_KINDS]).toEqual(["search", "sale", "category", "product"])
    expect(DESTINATION_KINDS as readonly string[]).not.toContain("promotion")
  })
})

describe("the offers block", () => {
  it("bounds its tiles, so a layout cannot grow without limit", () => {
    const tiles = BLOCK_CATALOGUE.offers.fields.find((f) => f.key === "tiles")
    expect(tiles?.kind).toBe("list")
    if (tiles?.kind !== "list") throw new Error("tiles must be a list field")
    expect(tiles.min).toBe(1)
    expect(tiles.max).toBe(6)
  })

  /**
   * ⚠ The whole legibility strategy, asserted at the contract rather than left to the renderer.
   * A tile has no way to express "put the copy on the photograph", so contrast is a property of the
   * design system rather than of an operator's artwork — and no pixel decoder is needed to prove it.
   */
  it("offers no way to place copy over artwork", () => {
    const tiles = BLOCK_CATALOGUE.offers.fields.find((f) => f.key === "tiles")
    if (tiles?.kind !== "list") throw new Error("tiles must be a list field")
    const keys = tiles.of.map((f) => f.key)
    expect(keys).not.toContain("variant")
    expect(keys).not.toContain("textTreatment")
    expect(keys).not.toContain("overlay")
  })

  it("requires a headline, a call to action and artwork on every tile", () => {
    const tiles = BLOCK_CATALOGUE.offers.fields.find((f) => f.key === "tiles")
    if (tiles?.kind !== "list") throw new Error("tiles must be a list field")
    const required = tiles.of.filter((f) => f.required).map((f) => f.key)
    expect(required).toEqual(
      expect.arrayContaining(["size", "headline", "ctaLabel", "ctaDestination", "artwork"]),
    )
  })
})
