// How full is each gateway? (075 FR-016.)
//
// ⚠ WHY THIS EXISTS. An HTTP API holds at most 300 routes and 300 integrations, and the provider
// publishes no metric for how many are in use. On 2026-10-08 the shared gateway reached both limits
// and the first anyone knew was a deployment refused half-way through. Nothing had been counting.
import type { GatewayReader } from "./reader"

/**
 * Both limits, per HTTP API. The route limit can be raised by a quota request; the INTEGRATION limit
 * is not adjustable — so it is the one that binds, and the reason the ceiling is a constant here
 * rather than something read from the account's quotas.
 */
export const GATEWAY_CEILING = 300

export type GatewayName = "shared" | "staff"
export type GatewayLimit = "routes" | "integrations"

export interface GatewayReading {
  gateway: GatewayName
  limit: GatewayLimit
  used: number
  ceiling: number
  /** 0–100, rounded UP. */
  percent: number
}

/**
 * ⚠ ROUNDED UP, deliberately. Rounding to nearest reports 299 of 300 as 100 and 224 of 300 as 75 —
 * fine — but rounding DOWN would report 299 of 300 as 99, and the number is read by alarms with
 * thresholds: a gateway one route from refusing a deployment must never read as under its line.
 */
export function percentOf(used: number, ceiling: number = GATEWAY_CEILING): number {
  return Math.min(100, Math.ceil((used / ceiling) * 100))
}

/** Four readings: each gateway, each limit. Any failure rejects — a partial answer is not an answer. */
export async function measure(reader: GatewayReader, apis: Record<GatewayName, string>): Promise<GatewayReading[]> {
  const names: GatewayName[] = ["shared", "staff"]
  const perGateway = await Promise.all(
    names.map(async (gateway) => {
      const [routes, integrations] = await Promise.all([reader.countRoutes(apis[gateway]), reader.countIntegrations(apis[gateway])])
      const reading = (limit: GatewayLimit, used: number): GatewayReading => ({ gateway, limit, used, ceiling: GATEWAY_CEILING, percent: percentOf(used) })
      return [reading("routes", routes), reading("integrations", integrations)]
    }),
  )
  return perGateway.flat()
}
