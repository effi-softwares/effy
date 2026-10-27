// A presigned picture upload for a product Effy is finishing (102). Admin/manager.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { presignForEffyOwned } from "../products/effy";
import { denied, guard, mapProductAdminError, parseBody } from "../products/handler-support";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "decide");
  if (denied(g)) return g.deny;
  try {
    const body = parseBody<Record<string, unknown>>(event.body);
    return json(200, await presignForEffyOwned(event.pathParameters?.productId, body), scope);
  } catch (err) {
    return mapProductAdminError(err, scope);
  }
};
