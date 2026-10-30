import { readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"

import { describe, expect, it } from "vitest"

const FULFILLMENT_DIR = resolve(__dirname, "..")

const FORBIDDEN: { label: string; pattern: RegExp }[] = [
  { label: "payment capture", pattern: /\bcapture\s+(payment|funds)\b|\bpayment\s+capture\b/i },
  { label: "carrier selection", pattern: /\b(select|choose|book|assign)\s+(a\s+)?carrier\b/i },
  { label: "tracking number", pattern: /\b(tracking\s+(number|code|id)|add\s+tracking)\b/i },
  { label: "shipment creation", pattern: /\b(create|new)\s+shipment\b|\bmark\s+as\s+shipped\b/i },
  { label: "order-line editing", pattern: /\bedit\s+(lines|items)\b|\b(add|remove)\s+(a\s+)?line\b/i },
  { label: "order duplication", pattern: /\b(duplicate|copy)\s+order\b|\breorder\s+this\b/i },
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

describe("the shop console offers no action the platform cannot perform", () => {
  const files = sourceFiles(FULFILLMENT_DIR)

  it("finds the fulfillment sources to scan (a guard over nothing proves nothing)", () => {
    expect(files.length).toBeGreaterThan(5)
  })

  for (const { label, pattern } of FORBIDDEN) {
    it(`offers no ${label} control`, () => {
      const offenders = files.filter((f) => pattern.test(code(f)))
      expect(offenders, `${label} is not something Effy's model supports - see this file's docblock`).toEqual([])
    })
  }

  it("keeps the pick contract free of money and shop identity (shop-mobile reads it)", () => {
    const contract = code(resolve(FULFILLMENT_DIR, "../../../../../packages/shared-types/src/shop-order.ts"))
    for (const banned of [
      /\bamount\b/i,
      /\b(grand|order)_?[tT]otal\b/,
      /\bpayment(_|\s*)?(status|intent|method)\b/i,
      /\bshop_?[iI]d\b/,
    ]) {
      expect(contract, `shop-order.ts must not mention ${banned}`).not.toMatch(banned)
    }
  })

  it("draws no tax line", () => {
    const offenders = files.filter((f) => /\b(VAT|GST)\b/.test(code(f)))
    expect(offenders).toEqual([])
  })
})
