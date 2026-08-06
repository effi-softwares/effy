// GET /admin/v1/deliverability — addresses the platform currently cannot reach (037 FR-033).
// Read access: any active back-office staff including csa — a CSA is exactly who is on the phone to
// the person who cannot sign in.
//
// ⚠ Defaults to PROBLEMS ONLY. A list of every address ever delivered to answers no question anyone
// has, and it would bury the handful that matter.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda"

import type { AuthedEvent } from "@effy/edge-shared"
import { json, preamble } from "@effy/edge-shared"

import { guard, mapDeliverabilityError } from "../deliverability/handler-support"
import { list } from "../deliverability/service"
import type { DeliveryListParams } from "../deliverability/types"

const STATES = ["reachable", "soft_failing", "undeliverable", "complained", "all"] as const
const MAX_LIMIT = 100

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context)
  const g = await guard(event, scope, "read")
  if ("deny" in g) return g.deny

  const qp = event.queryStringParameters ?? {}
  const requested = qp.state ?? ""

  const params: DeliveryListParams = {
    state: (STATES as readonly string[]).includes(requested)
      ? (requested as DeliveryListParams["state"])
      : "problems",
    q: qp.q?.trim() || null,
    limit: Math.min(Number(qp.limit) || 25, MAX_LIMIT),
    offset: Math.max(Number(qp.offset) || 0, 0),
  }

  try {
    return json(200, await list(params), scope)
  } catch (err) {
    return mapDeliverabilityError(err, scope)
  }
}
