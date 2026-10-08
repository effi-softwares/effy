import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * ⚠ THE DEPLOYMENT CONTRACT for the delivery console (047) — the 035/038 guard. Reads the ACTUAL
 * `serverless.yml` and asserts every delivery route is declared AND behind the back-office authorizer.
 * A route added to the code but forgotten here (or wired to the wrong pool) would pass every unit test
 * and only fail live; this catches it at build time.
 */

const here = dirname(fileURLToPath(import.meta.url))
const serviceRoot = resolve(here, "../..")
const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8")

// Every delivery function → its expected path, all under the back-office authorizer.
const DELIVERY_FUNCTIONS: Record<string, string> = {
  // 047 — kept. ⚠ The ring LIST stays read-only for the fee-plan dialog until the fee engine (E3).
  deliveryRingsListV1: "/admin/v1/delivery/rings",
  deliveryPlansListV1: "/admin/v1/delivery/plans",
  deliveryPlansCreateV1: "/admin/v1/delivery/plans",
  deliveryPlanActivateV1: "/admin/v1/delivery/plans/{planId}/activate",
  deliverySettingsGetV1: "/admin/v1/delivery/settings",
  deliverySettingsPutV1: "/admin/v1/delivery/settings",
  deliveryCollectionRunsListV1: "/admin/v1/delivery/collection-runs",
  deliveryCollectionRunsCreateV1: "/admin/v1/delivery/collection-runs",
  deliveryCollectionRunDeleteV1: "/admin/v1/delivery/collection-runs/{runId}",
  // 076 — coverage: the list, its groups, courier reach.
  deliveryCoverageListV1: "/admin/v1/delivery/coverage",
  deliveryCoveragePlacesV1: "/admin/v1/delivery/coverage/places",
  deliveryCoverageCheckV1: "/admin/v1/delivery/coverage/check",
  deliveryCoveragePostcodesAddV1: "/admin/v1/delivery/coverage/postcodes",
  deliveryCoveragePostcodesPatchV1: "/admin/v1/delivery/coverage/postcodes",
  deliveryCoveragePostcodeRemoveV1: "/admin/v1/delivery/coverage/postcodes/{postcode}",
  deliveryCoverageGroupCreateV1: "/admin/v1/delivery/coverage/groups",
  deliveryCoverageGroupPatchV1: "/admin/v1/delivery/coverage/groups/{groupId}",
  deliveryCoverageGroupRemoveV1: "/admin/v1/delivery/coverage/groups/{groupId}",
  deliveryCoverageCourierV1: "/admin/v1/delivery/coverage/courier",
  deliveryCoverageCourierExclusionAddV1: "/admin/v1/delivery/coverage/courier/exclusions",
  deliveryCoverageCourierExclusionRemoveV1: "/admin/v1/delivery/coverage/courier/exclusions/{postcode}",
}

/**
 * ⚠ 076 REMOVED THESE, AND THEY MUST STAY REMOVED. Tiers, same-day zones and per-shop same-day
 * exceptions left the console (FR-030): a route that came back would be a control nobody can see,
 * writing settings the spec says are frozen.
 */
const REMOVED_BY_076 = [
  "deliveryRingsCreateV1", "deliveryZonesListV1", "deliveryZonesCreateV1", "deliveryZonesPatchV1",
  "deliveryPostcodeCheckV1", "deliveryZonePostcodeAddV1", "deliveryZonePostcodeRemoveV1", "deliveryZoneSuggestRingV1",
  "deliveryExceptionsListV1", "deliveryExceptionPutV1", "deliveryExceptionDeleteV1",
]

describe("delivery console deployment contract", () => {
  it("declares every delivery route behind the back-office authorizer, at the expected path", () => {
    for (const [fn, path] of Object.entries(DELIVERY_FUNCTIONS)) {
      const start = yaml.indexOf(`  ${fn}:`)
      expect(start, `${fn} is not declared in serverless.yml`).toBeGreaterThan(-1)
      const rest = yaml.slice(start + fn.length)
      const end = rest.search(/\n {2}(?:[A-Za-z]|#)/)
      const block = end < 0 ? rest : rest.slice(0, end)
      expect(block, `${fn} must be behind the back-office authorizer`).toContain("authorizer/back-office_id")
      expect(block, `${fn} must declare path ${path}`).toContain(`path: ${path}`)
    }
  })

  it("has a handler file for every declared delivery function", () => {
    for (const fn of Object.keys(DELIVERY_FUNCTIONS)) {
      const m = new RegExp(`  ${fn}:\\n    handler: (src/functions/[a-z0-9-]+)\\.handler`).exec(yaml)
      expect(m?.[1], `${fn} has no handler mapping`).toBeTruthy()
      const file = resolve(serviceRoot, `${m![1]}.ts`)
      expect(() => readFileSync(file, "utf8"), `handler file missing for ${fn}: ${m![1]}.ts`).not.toThrow()
    }
  })

  it("076 — the zone, tier and same-day-exception routes are gone, and nothing serves their paths", () => {
    for (const fn of REMOVED_BY_076) expect(yaml, `${fn} is declared again`).not.toContain(`  ${fn}:`)
    expect(yaml).not.toContain("/admin/v1/delivery/zones")
    expect(yaml).not.toContain("sameday-exceptions")
    expect(yaml).not.toContain("/admin/v1/delivery/postcode-check")
    expect(yaml.match(/path: \/admin\/v1\/delivery\/rings/g)?.length).toBe(1)
  })
})
