// Hourly: how full is each API gateway (Effy/Platform GatewayUsagePercent)? The provider has no metric,
// and a full gateway refuses the next deploy. Counts what is deployed; `gateway-capacity.contract.test.ts`
// counts the tree. A failure throws: these alarms treat missing data as not breaching, so the
// failed-invocation alarm is what reports a stopped check.
import type { Context } from "aws-lambda"

import { emitMetric, logger } from "@effy/edge-shared"

import { apiGatewayReader, type GatewayReader } from "../gateway-usage/reader"
import { measure } from "../gateway-usage/service"

const NAMESPACE = "Effy/Platform"

export function gatewayUsageHandler(reader: GatewayReader) {
  return async (_event: unknown, context?: Context): Promise<void> => {
    if (context) context.callbackWaitsForEmptyEventLoop = false

    const shared = process.env.SHARED_HTTP_API_ID
    const staff = process.env.STAFF_HTTP_API_ID
    if (!shared || !staff) throw new Error("SHARED_HTTP_API_ID and STAFF_HTTP_API_ID must both be configured - the gateway usage check cannot run")

    const readings = await measure(reader, { shared, staff })
    for (const r of readings) {
      emitMetric(NAMESPACE, "GatewayUsagePercent", r.percent, { gateway: r.gateway, limit: r.limit })
    }
    logger.info({ readings }, "gateway usage")
  }
}

export const handler = gatewayUsageHandler(apiGatewayReader)
