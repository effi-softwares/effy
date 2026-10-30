import { describe, expect, it } from "vitest"

import { canDecideReview } from "./access"
import {
  attentionLines,
  bigPriceRises,
  marginLabel,
  previewCustomerPrice,
  priceMove,
  priceRange,
  reviewChecks,
  sectionOfChange,
  toMargin,
  waitingLabel,
  wordDiff,
} from "./model"

describe("previewCustomerPrice", () => {
  it("adds a fixed amount", () => {
    expect(previewCustomerPrice("4.00", "amount", "0.60")).toBe("4.60")
  })
  it("adds a percentage, rounded half-up to the cent like the server's rule", () => {
    expect(previewCustomerPrice("4.00", "percent", "15")).toBe("4.60")
    expect(previewCustomerPrice("3.33", "percent", "15")).toBe("3.83") // 49.95c → 50c
    expect(previewCustomerPrice("0.99", "percent", "12.5")).toBe("1.11") // 12.375c → 12c
  })
  it("treats zero as a margin: the customer pays the shop's price", () => {
    expect(previewCustomerPrice("4.00", "percent", "0")).toBe("4.00")
  })
  it("shows nothing rather than a guess while what is typed is not a number", () => {
    for (const v of ["", " ", "abc", "-5", "1e3", "5%"]) {
      expect(previewCustomerPrice("4.00", "percent", v)).toBeNull()
    }
  })
})

describe("toMargin", () => {
  it("sends zero, refuses blank", () => {
    expect(toMargin({ kind: "percent", value: "0" })).toEqual({ kind: "percent", value: "0" })
    expect(toMargin({ kind: "percent", value: "" })).toBeNull()
    expect(toMargin({ kind: "amount", value: "-1" })).toBeNull()
  })
})

describe("labels", () => {
  it("says how long an item has waited in the reviewer's units", () => {
    expect(waitingLabel(0)).toBe("Under an hour")
    expect(waitingLabel(5)).toBe("5 h")
    expect(waitingLabel(24)).toBe("1 day")
    expect(waitingLabel(73)).toBe("3 days")
  })
  it("names a missing margin instead of showing zero", () => {
    expect(marginLabel(null)).toBe("Not set")
    expect(marginLabel({ kind: "percent", value: "15" })).toBe("15%")
  })
})

describe("canDecideReview", () => {
  it("is admin and manager - a csa reads the queue and decides nothing", () => {
    expect(canDecideReview(["admin"])).toBe(true)
    expect(canDecideReview(["manager"])).toBe(true)
    expect(canDecideReview(["csa"])).toBe(false)
    expect(canDecideReview([])).toBe(false)
  })
})

describe("priceRange (098)", () => {
  it("says one figure for one size or equal prices, and the span when sizes differ", () => {
    expect(priceRange(["4.00"])).toBe("4.00")
    expect(priceRange(["4.00", "4.0"])).toBe("4.00")
    expect(priceRange(["5.50", "3.00", "4.25"])).toBe("3.00–5.50")
    expect(priceRange([])).toBe("-")
  })
})

describe("attention lines (101)", () => {
  const base = {
    facts: { storage: "chilled" as const, gstStatus: "taxable" as const, ageRestricted: false },
    factOverrides: [] as ("storage" | "gstStatus" | "ageRestricted")[],
    missingRequired: [] as string[],
    missingRecommended: [] as string[],
  }

  it("nothing to say for a product that follows its category", () => {
    expect(attentionLines(base)).toEqual({ blocking: [], notes: [] })
  })

  it("names overridden facts and empty details; only required ones block", () => {
    const out = attentionLines({
      ...base,
      factOverrides: ["storage", "ageRestricted"],
      missingRequired: ["Allergens"],
      missingRecommended: ["Brand", "Organic"],
    })
    expect(out.blocking).toEqual(["Required details are empty: Allergens."])
    expect(out.notes).toEqual([
      "Storage is chilled, not its category's default.",
      "Not marked 18+, though its category is.",
      "Recommended details left empty: Brand, Organic.",
    ])
  })
})

describe("the review page's reading of a change", () => {
  it("marks the words removed and added, the shared ones plain", () => {
    const d = wordDiff("Cold-pressed olive oil.", "Early-harvest, cold-pressed olive oil - peppery.")
    expect(d.was.filter((p) => p.changed).map((p) => p.text.trim())).toEqual(["Cold-pressed", "oil."])
    expect(d.now.filter((p) => p.changed).map((p) => p.text.trim())).toEqual([
      "Early-harvest, cold-pressed",
      "oil - peppery.",
    ])
    expect(d.was.map((p) => p.text).join("")).toBe("Cold-pressed olive oil.")
    expect(d.now.map((p) => p.text).join("")).toBe("Early-harvest, cold-pressed olive oil - peppery.")
  })

  it("says how far a price moved, and nothing for what is not one", () => {
    expect(priceMove("16.00", "18.00")).toBeCloseTo(12.5)
    expect(priceMove("16.00", null)).toBeNull()
    expect(priceMove("0", "1")).toBeNull()
  })

  it("files each changed field under the section that shows it", () => {
    expect(sectionOfChange("variant:v1:shopPriceAmount")).toBe("sizes")
    expect(sectionOfChange("shortDescription")).toBe("about")
    expect(sectionOfChange("detail:allergens")).toBe("details")
    expect(sectionOfChange("storage")).toBe("details")
    expect(sectionOfChange("primaryCategoryId")).toBe("aisles")
  })

  it("finds the shop prices raised past the guide, by size", () => {
    const changes = [
      { field: "variant:v2:shopPriceAmount", label: "750 mL - Shop price", before: "16.00", after: "18.00" },
      { field: "variant:v1:shopPriceAmount", label: "375 mL - Shop price", before: "9.50", after: "9.90" },
    ]
    expect(bigPriceRises({ changes })).toEqual([{ label: "750 mL", move: 12.5 }])
  })

  it("blocks approval on a required check, never on one worth a look", () => {
    const base = {
      images: { current: [{ url: "u", isPrimary: true, altText: null, isNew: false }], proposed: null },
      missingRequired: [] as string[],
      missingRecommended: ["Awards"],
      factOverrides: [] as ("storage" | "gstStatus" | "ageRestricted")[],
      changes: [],
      marginRequired: true,
    }
    const failing = (c: ReturnType<typeof reviewChecks>) => c.filter((x) => !x.ok && x.required).map((x) => x.key)
    expect(failing(reviewChecks(base, true))).toEqual([])
    expect(failing(reviewChecks(base, false))).toEqual(["margin"])
    expect(failing(reviewChecks({ ...base, missingRequired: ["Allergens"] }, true))).toEqual(["required"])
    expect(reviewChecks(base, true).find((x) => x.key === "recommended")).toMatchObject({ ok: false, attention: true })
  })
})
