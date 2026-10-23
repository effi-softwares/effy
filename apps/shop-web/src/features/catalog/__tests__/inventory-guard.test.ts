import { readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * The product screen offers no inventory control the platform cannot honour. A source guard, because the
 * design reference (a generic e-commerce console) makes each of these look like an omission:
 *  • Variant management on the stock screen: sizes are edited in Sizes and prices, through Effy's review.
 *  • Reserved units: nothing reserves stock, so the number would be invented.
 *  • Stock location: a shop is the location.
 *  • Days cover: there is no per-product sales history.
 *  • Unit cost / margin: there is no cost column.
 *  • A VAT rate: per-item GST treatment is not modelled.
 *  • Sales channels: there is one channel.
 *
 * Comments are stripped before scanning, and patterns are phrases, never bare words (`variant` is in
 * every `<Button variant=…>`). Every pattern was verified by breaking it.
 */

const CATALOG_DIR = resolve(__dirname, "..")

const FORBIDDEN: { label: string; pattern: RegExp }[] = [
  {
    label: "product variants",
    pattern: /\b(manage|by|per|add|edit)\s+variants?\b|\bvariant\s+(name|sku|stock|rows?|list|breakdown|inventory)\b/i,
  },
  { label: "reserved stock", pattern: /\breserved\s+(units?|stock|quantity)\b|\bunits?\s+reserved\b/i },
  {
    label: "a stock location",
    pattern: /\b(stock|inventory|warehouse|storage|bin|pick)\s+location\b|\blocation\s+(select|picker)\b/i,
  },
  { label: "days-of-cover", pattern: /\bdays?\s+(of\s+)?cover\b|\bcover\s+remaining\b/i },
  { label: "a unit cost or margin", pattern: /\bunit\s+cost\b|\b(gross\s+)?margin\b/i },
  { label: "a VAT rate", pattern: /\bvat\b/i },
  { label: "sales channels", pattern: /\bsales\s+channels?\b|\bchannel\s+(toggle|checkbox)\b/i },
  {
    label: "an automatic reorder point",
    pattern: /\breorder\s+(point|level|quantity)\b|\bauto(-|\s)?reorder\b/i,
  },
]

/** Strip block and line comments so prose can explain the ban without tripping it. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue
      out.push(...sourceFiles(path))
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(path)
    }
  }
  return out
}

describe("the product screen offers no inventory control the platform cannot honour", () => {
  const files = sourceFiles(CATALOG_DIR)

  it("finds the catalog sources to scan (a guard over nothing proves nothing)", () => {
    // 054's `TestRailsCarryOnlyAvailableProducts` passed vacuously once its rails emptied. If this
    // directory moves, the loop below would silently assert nothing — so assert the corpus first.
    expect(files.length).toBeGreaterThan(15)
  })

  for (const { label, pattern } of FORBIDDEN) {
    it(`offers no ${label}`, () => {
      const offenders = files.filter((f) => pattern.test(code(f)))
      expect(
        offenders,
        `${label} is not something this platform can answer — see this file's docblock`,
      ).toEqual([])
    })
  }
})
