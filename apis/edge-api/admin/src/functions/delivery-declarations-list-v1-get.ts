// GET /admin/v1/delivery-declarations?status= — the approval queue (032 FR-022/FR-027).
// Read access: any active back-office staff. Defaults to what is awaiting a decision.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { listDeclarations } from "../delivery/approvals";
import { guard, mapDeliveryError, toDeclarationReviewListDTO } from "../delivery/handler-support";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;

  try {
    const rows = await listDeclarations(event.queryStringParameters?.status ?? undefined);
    return json(200, toDeclarationReviewListDTO(rows), scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
