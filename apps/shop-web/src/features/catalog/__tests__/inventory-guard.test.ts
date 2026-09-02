import { readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * 057 — the product screen must offer NO inventory control the platform cannot honour.
 *
 * ⚠ WHY A SOURCE GUARD AND NOT A RENDER ASSERTION. A render test proves today's fixture happens not
 * to show a variant table; it proves nothing about the one someone adds next month after reading the
 * mockup. And they WILL read the mockup: it is a generic e-commerce console whose product page ships
 * a by-variant stock breakdown with per-variant Adjust buttons, a "Reserved" row, a stock "Location"
 * select and a "days cover" bar — every one of which looks like an obvious omission from ours.
 *
 * None of them survives contact with this platform:
 *
 *   • VARIANTS — THERE ARE NONE. `public.product` is one row per sellable thing. No variant table, no
 *     variant column, no code path anywhere that groups products under a parent. A per-variant stock
 *     panel needs a data model invented for it, and the storefront, the cart, the picker and the
 *     driver app would all know nothing about the concept.
 *   • RESERVED UNITS — NOTHING RESERVES STOCK. 054's A6 recorded this as an ACCEPTED residual in
 *     writing: between creating a payment and it succeeding another shopper can take the last unit,
 *     and closing that window needs a reservation table plus an abandoned-checkout sweep the platform
 *     does not have. "Reserved: 2" would be worse than absent — an operator would subtract it before
 *     deciding whether to reorder.
 *   • STOCK LOCATION — A SHOP IS THE LOCATION. 049's model is one fulfilment node per shop and the
 *     schema has no bin, warehouse or storage area anywhere. A select offering three of them would be
 *     three options meaning the same shelf.
 *   • DAYS COVER — needs a sales velocity, and the platform stores no per-product sales history. It is
 *     the same fact that refuses the mockup's "Last 30 days" rail, and drawing a bar from an invented
 *     velocity is the defect this feature deleted from the dashboard.
 *   • UNIT COST / MARGIN — `public.product` has no cost column. `purchase_order_line.unit_cost` is what
 *     ONE order paid, not a standing cost, and 057's migration explicitly refused a price-list table.
 *     A margin computed from a cost nobody recorded is a number with no fact behind it.
 *   • VAT RATE — 052's R13 settled this: the ABN is unsupplied and per-item GST treatment is unmodelled,
 *     so an AU grocery basket is a MIXED SUPPLY and a single "25% — standard" rate is simply false.
 *     `canIssueTaxInvoice()` stays false until both land.
 *   • SALES CHANNELS — Effy is a single-brand storefront with hidden fulfilment. There is one channel.
 *     Checkboxes for "Point of sale" and "Wholesale" would be three switches with one wire behind them.
 *
 * ⚠ COMMENTS ARE STRIPPED BEFORE SCANNING, including this docblock's own. A guard that fires on its
 * own justification gets deleted by the next person and takes the requirement with it — the rule
 * `order-detail.test.ts` and `theme-tokens.test.ts` already follow.
 *
 * ⚠ AND THE PATTERNS ARE PHRASES, NEVER BARE WORDS. `variant` alone appears in every
 * `<Button variant="outline">` in the directory, so a guard on it would fire on correct code and be
 * deleted within the day. 056 records the mirror-image failure — a pattern so narrow the injected
 * break sailed through — so every pattern below was verified by breaking it.
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
    // ⚠ 054's `TestRailsCarryOnlyAvailableProducts` passed VACUOUSLY once its rails emptied. If this
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
