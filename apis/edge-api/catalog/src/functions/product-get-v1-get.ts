// One product, everything about it, with its history (102). Read = any active staff, csa included.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { denied, guard, mapProductAdminError } from "../products/handler-support";
import { detail } from "../products/service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  try {
    return json(200, await detail(event.pathParameters?.productId), scope);
  } catch (err) {
    return mapProductAdminError(err, scope);
  }
};
