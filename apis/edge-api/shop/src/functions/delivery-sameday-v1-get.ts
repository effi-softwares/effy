// GET /shop/v1/delivery-sameday — this shop's same-day declaration: in force, pending, and the last
// decision (032 FR-019). Read access: any active member of an active shop.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { getDeclarations } from "../delivery/declarations";
import { guard, mapDeclarationError, toDeclarationViewDTO } from "../delivery/handler-support";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;

  try {
    return json(200, toDeclarationViewDTO(await getDeclarations(g.shopId)), scope);
  } catch (err) {
    return mapDeclarationError(err, scope);
  }
};
