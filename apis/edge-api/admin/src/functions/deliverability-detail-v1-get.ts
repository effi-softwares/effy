// GET /admin/v1/deliverability/{address} — one address's history and current state (037 FR-033).
// Read access: any active back-office staff.
//
// The path parameter is matched case-INSENSITIVELY (the column is citext), so an operator need not
// reproduce the exact case. ⚠ Which is precisely why the REPAIR uses the stored raw_address instead
// of this parameter — see the repair handler.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda"

import type { AuthedEvent } from "@effy/edge-shared"
import { json, preamble } from "@effy/edge-shared"

import { guard, mapDeliverabilityError } from "../deliverability/handler-support"
import { detail } from "../deliverability/service"

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context)
  const g = await guard(event, scope, "read")
  if ("deny" in g) return g.deny

  const address = decodeURIComponent(event.pathParameters?.address ?? "")

  try {
    return json(200, await detail(address), scope)
  } catch (err) {
    return mapDeliverabilityError(err, scope)
  }
}
