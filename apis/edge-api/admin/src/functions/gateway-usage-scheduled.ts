// Hourly: how full is each API gateway? → Effy/Platform GatewayUsagePercent (075 FR-016/FR-017).
//
// ⚠ THE PROVIDER HAS NO METRIC FOR THIS. A gateway that is full refuses the next deployment and
// says so only then. Alarms at 75% and 90% (infra/envs/<env>/gateway-usage.tf) turn that into weeks
// of notice. What is counted here is what is DEPLOYED; what the tree is about to deploy is counted
// by `gateway-capacity.contract.test.ts`, and the two differ while a stack waits to be deployed.
//
// ⚠ A FAILURE THROWS, deliberately — unlike the MAIL FROM probe beside it, which stays silent and
// lets a "missing data is breaching" alarm speak. These alarms treat missing data as NOT breaching
// (an hour without a reading is not a full gateway), so silence would read as healthy. Throwing
// fails the invocation, and the function's own failed-invocation alarm
// (background-functions.tf) is what says "the fullness check has stopped" (FR-019).
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
    if (!shared || !staff) throw new Error("SHARED_HTTP_API_ID and STAFF_HTTP_API_ID must both be configured — the gateway usage check cannot run")

    const readings = await measure(reader, { shared, staff })
    for (const r of readings) {
      // Two bounded dimensions, four series in all (Principle VII).
      emitMetric(NAMESPACE, "GatewayUsagePercent", r.percent, { gateway: r.gateway, limit: r.limit })
    }
    logger.info({ readings }, "gateway usage")
  }
}

export const handler = gatewayUsageHandler(apiGatewayReader)
