import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * The shop service exposes no delivery-configuration route (coverage, today's delivery, any fee or band):
 * those are back-office decisions. Proven on the shop's own deployment surface and handlers. A product's
 * `weight_grams` is not delivery config.
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

  // A shop now hands parcels to couriers. It may say "handed over"; it may not configure
  // courier services, change how an order reaches the courier, or record the courier's progress.
  it("080 — the one courier route a shop has is the handover; no courier service, mode or progress route", () => {
    const paths = [...yaml.matchAll(/path:\s*(\S+)/g)].map((m) => m[1] ?? "")
    expect(paths.filter((p) => /courier|consignment/.test(p))).toEqual(["/shop/v1/fulfillments/{id}/courier-handover"])
  })

  it("080 — the courier pickup a shop is sent selects no fee, estimate or tracking link", () => {
    const src = readFileSync(resolve(serviceRoot, "src/lib/courier-pickup.ts"), "utf8")
    const select = src.slice(src.indexOf("const SELECT_PICKUPS"), src.indexOf("interface PickupRow"))
    expect(select).not.toMatch(/tracking_url|estimate|fee|courier_estimate|max_business_days/)
  })
})

