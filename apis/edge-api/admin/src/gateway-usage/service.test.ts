import { afterEach, describe, expect, it, vi } from "vitest"

import { gatewayUsageHandler } from "../functions/gateway-usage-scheduled"
import type { GatewayReader } from "./reader"
import { GATEWAY_CEILING, measure, percentOf } from "./service"

const reader = (counts: Record<string, { routes: number; integrations: number }>): GatewayReader => ({
  countRoutes: async (id) => counts[id]!.routes,
  countIntegrations: async (id) => counts[id]!.integrations,
})

describe("gateway usage — how full each gateway is", () => {
  it("gives four readings: each gateway, each limit", async () => {
    const readings = await measure(reader({ a: { routes: 158, integrations: 150 }, b: { routes: 144, integrations: 144 } }), { shared: "a", staff: "b" })
    expect(readings).toEqual([
      { gateway: "shared", limit: "routes", used: 158, ceiling: 300, percent: 53 },
      { gateway: "shared", limit: "integrations", used: 150, ceiling: 300, percent: 50 },
      { gateway: "staff", limit: "routes", used: 144, ceiling: 300, percent: 48 },
      { gateway: "staff", limit: "integrations", used: 144, ceiling: 300, percent: 48 },
    ])
  })

  it("⚠ rounds UP — one route from full never reads as under a threshold", () => {
    expect(percentOf(299)).toBe(100)
    expect(percentOf(300)).toBe(100)
    expect(percentOf(269)).toBe(90) // 89.67 → 90: the critical alarm fires
    expect(percentOf(223)).toBe(75) // 74.33 → 75: the warning fires
    expect(percentOf(0)).toBe(0)
    expect(percentOf(GATEWAY_CEILING + 5)).toBe(100)
  })

  it("a reader that fails makes the whole measurement fail — never a partial answer", async () => {
    const broken: GatewayReader = { countRoutes: async () => 10, countIntegrations: async () => Promise.reject(new Error("AccessDenied")) }
    await expect(measure(broken, { shared: "a", staff: "b" })).rejects.toThrow("AccessDenied")
  })
})

describe("gatewayUsage — the scheduled function", () => {
  const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true)
  afterEach(() => {
    write.mockClear()
    delete process.env.SHARED_HTTP_API_ID
    delete process.env.STAFF_HTTP_API_ID
  })

  const emitted = () =>
    write.mock.calls
      .map(([line]) => {
        try {
          return JSON.parse(String(line)) as Record<string, unknown>
        } catch {
          return null
        }
      })
      .filter((r): r is Record<string, unknown> => r !== null && "_aws" in r)

  it("emits one GatewayUsagePercent per gateway per limit, 0–100, in Effy/Platform", async () => {
    process.env.SHARED_HTTP_API_ID = "a"
    process.env.STAFF_HTTP_API_ID = "b"
    await gatewayUsageHandler(reader({ a: { routes: 300, integrations: 300 }, b: { routes: 7, integrations: 7 } }))({})

    const records = emitted()
    expect(records.map((r) => `${String(r.gateway)}/${String(r.limit)}=${String(r.GatewayUsagePercent)}`).sort()).toEqual([
      "shared/integrations=100",
      "shared/routes=100",
      "staff/integrations=3",
      "staff/routes=3",
    ])
    for (const r of records) {
      const aws = r._aws as { CloudWatchMetrics: { Namespace: string; Dimensions: string[][] }[] }
      expect(aws.CloudWatchMetrics[0]!.Namespace).toBe("Effy/Platform")
      expect(aws.CloudWatchMetrics[0]!.Dimensions).toEqual([["gateway", "limit"]])
    }
  })

  it("⚠ throws when it cannot read — silence would read as a healthy gateway", async () => {
    process.env.SHARED_HTTP_API_ID = "a"
    process.env.STAFF_HTTP_API_ID = "b"
    const broken: GatewayReader = { countRoutes: async () => Promise.reject(new Error("AccessDenied")), countIntegrations: async () => 1 }
    await expect(gatewayUsageHandler(broken)({})).rejects.toThrow("AccessDenied")
    expect(emitted()).toEqual([])
  })

  it("throws when a gateway id is not configured", async () => {
    process.env.SHARED_HTTP_API_ID = "a"
    await expect(gatewayUsageHandler(reader({}))({})).rejects.toThrow(/STAFF_HTTP_API_ID/)
  })
})
