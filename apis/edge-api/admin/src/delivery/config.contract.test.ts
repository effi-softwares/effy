import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { describe, expect, it } from "vitest"

/** Every delivery route is declared in the real serverless.yml behind the back-office authorizer. */

const here = dirname(fileURLToPath(import.meta.url))
const serviceRoot = resolve(here, "../..")
const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8")

const DELIVERY_FUNCTIONS: Record<string, string> = {
  deliveryPlansListV1: "/admin/v1/delivery/plans",
  deliveryPlansCreateV1: "/admin/v1/delivery/plans",
  deliveryPlanUpdateV1: "/admin/v1/delivery/plans/{planId}",
  deliveryPlanActivateV1: "/admin/v1/delivery/plans/{planId}/activate",
  deliveryPlansSimulateV1: "/admin/v1/delivery/plans/simulate",
  deliverySettingsGetV1: "/admin/v1/delivery/settings",
  deliverySettingsPutV1: "/admin/v1/delivery/settings",
  deliveryCollectionRunsListV1: "/admin/v1/delivery/collection-runs",
  deliveryCollectionRunsCreateV1: "/admin/v1/delivery/collection-runs",
  deliveryCollectionRunDeleteV1: "/admin/v1/delivery/collection-runs/{runId}",
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

/** Removed routes must stay removed. */
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
  })

  it("077 — the last tier route is gone: nothing in the console speaks of distance tiers", () => {
    expect(yaml).not.toContain("  deliveryRingsListV1:")
    expect(yaml).not.toContain("/admin/v1/delivery/rings")
  })
})
