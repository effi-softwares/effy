import type { GatewayReader } from "./reader"

/** Per HTTP API. The integration limit cannot be raised, so it binds. */
export const GATEWAY_CEILING = 300

export type GatewayName = "shared" | "staff"
export type GatewayLimit = "routes" | "integrations"

export interface GatewayReading {
  gateway: GatewayName
  limit: GatewayLimit
  used: number
  ceiling: number
  percent: number
}

/** Rounded up, so a gateway one route from full never reads as under an alarm line. */
export function percentOf(used: number, ceiling: number = GATEWAY_CEILING): number {
  return Math.min(100, Math.ceil((used / ceiling) * 100))
}

/** Any failure rejects: a partial answer is not an answer. */
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
