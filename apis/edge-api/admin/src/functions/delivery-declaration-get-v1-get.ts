// GET /admin/v1/delivery-declarations/{id} — one declaration WITH the distance to every requested
// area (032 FR-023).
//
// ⚠ The distances are the point. 031's guard asked "is any shop in this area's zone?", which
// permitted same-day to Ballarat from a shop in Bendigo — 98 km, as far as Melbourne. An admin
// approving without seeing the number is making that same mistake by hand.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { getDeclaration } from "../delivery/approvals";
import { guard, mapDeliveryError, toDeclarationReviewDTO } from "../delivery/handler-support";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;

  try {
    return json(200, toDeclarationReviewDTO(await getDeclaration(event.pathParameters?.id ?? "")), scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
