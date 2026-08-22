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
  deliveryRingsListV1: "/admin/v1/delivery/rings",
  deliveryRingsCreateV1: "/admin/v1/delivery/rings",
  deliveryPlansListV1: "/admin/v1/delivery/plans",
  deliveryPlansCreateV1: "/admin/v1/delivery/plans",
  deliveryPlanActivateV1: "/admin/v1/delivery/plans/{planId}/activate",
  deliveryZonesListV1: "/admin/v1/delivery/zones",
  deliveryZonesCreateV1: "/admin/v1/delivery/zones",
  deliveryZonesPatchV1: "/admin/v1/delivery/zones/{zoneId}",
  deliveryPostcodeCheckV1: "/admin/v1/delivery/postcode-check",
  deliveryZonePostcodeAddV1: "/admin/v1/delivery/zones/{zoneId}/postcodes",
  deliveryZonePostcodeRemoveV1: "/admin/v1/delivery/zones/{zoneId}/postcodes/{postcode}",
  deliveryZoneSuggestRingV1: "/admin/v1/delivery/zones/{zoneId}/suggest-ring",
  deliverySettingsGetV1: "/admin/v1/delivery/settings",
  deliverySettingsPutV1: "/admin/v1/delivery/settings",
  deliveryCollectionRunsListV1: "/admin/v1/delivery/collection-runs",
  deliveryCollectionRunsCreateV1: "/admin/v1/delivery/collection-runs",
  deliveryCollectionRunDeleteV1: "/admin/v1/delivery/collection-runs/{runId}",
  deliveryExceptionsListV1: "/admin/v1/delivery/zones/{zoneId}/sameday-exceptions",
  deliveryExceptionPutV1: "/admin/v1/delivery/zones/{zoneId}/sameday-exceptions",
  deliveryExceptionDeleteV1: "/admin/v1/delivery/zones/{zoneId}/sameday-exceptions/{shopId}",
}

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
})
