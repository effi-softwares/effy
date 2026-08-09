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
   * ⚠ `hero` is deliberately ABSENT. Two heroes exist — a static one (commented out) and a
   * promotions-driven one (live) — and their comparison was never concluded. The field schema depends
   * entirely on which wins, so specifying it now would be inventing a requirement (T008c).
   */
  it("does NOT yet define hero — its schema is blocked on an unresolved operator decision", () => {
    expect(BLOCK_TYPES as readonly string[]).not.toContain("hero")
    expect(blockDefinition("hero")).toBeNull()
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
