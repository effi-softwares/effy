import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * ⚠ 047 SC-008/SC-009: the SHOP service MUST expose NO delivery-configuration route — not same-day
 * eligibility or exceptions, and not any fee/factor/ring-price/slab/floor/cap. Fees and same-day are
 * back-office decisions ONLY (FR-045). This proves it by inspecting the shop's own deployment surface and
 * function handlers directly, not by trusting a UI to hide a control.
 *
 * ⚠ `weight_grams` on a product is NOT delivery config — a shop legitimately records what its own
 * products weigh (FR-054). The ban is on the fee/zone/same-day machinery, never on product weight.
 */

const here = dirname(fileURLToPath(import.meta.url))
const serviceRoot = resolve(here, "..")
const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8")

// Path fragments a delivery-config route would contain. `weight` is deliberately absent — see above.
const FORBIDDEN_PATH_FRAGMENTS = [
  "/delivery/",
  "/rings",
  "/fee-plan",
  "/collection-run",
  "/sameday-exception",
  "/zones",
]

describe("shop service delivery-config isolation (047 SC-008/SC-009)", () => {
  it("declares no route that touches delivery zones, fees, rings, or same-day", () => {
    const paths = [...yaml.matchAll(/path:\s*(\S+)/g)].map((m) => m[1] ?? "")
    for (const p of paths) {
      for (const bad of FORBIDDEN_PATH_FRAGMENTS) {
        expect(p.includes(bad), `shop route ${p} exposes delivery config (${bad}) — must be back-office only`).toBe(false)
      }
    }
  })

  it("has no function handler that mutates a fee plan, ring, zone, or same-day exception", () => {
    const fnDir = resolve(serviceRoot, "src/functions")
    const files = readdirSync(fnDir)
    const offenders = files.filter((f) => /(fee-plan|ring|delivery-zone|sameday|collection-run)/.test(f))
    expect(offenders, `shop functions expose delivery config: ${offenders.join(", ")}`).toEqual([])
  })
})
