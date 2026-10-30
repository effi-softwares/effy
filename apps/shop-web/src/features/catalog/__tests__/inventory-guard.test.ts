import { readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"

import { describe, expect, it } from "vitest"

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
    expect(files.length).toBeGreaterThan(15)
  })

  for (const { label, pattern } of FORBIDDEN) {
    it(`offers no ${label}`, () => {
      const offenders = files.filter((f) => pattern.test(code(f)))
      expect(offenders, `${label} is not something this platform can answer - see this file's docblock`).toEqual([])
    })
  }
})
