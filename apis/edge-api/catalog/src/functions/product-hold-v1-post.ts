// Effy holds a product off sale with a reason (102). Admin/manager.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { denied, guard, mapProductAdminError, parseBody } from "../products/handler-support";
import { hold } from "../products/holds";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "decide");
  if (denied(g)) return g.deny;
  try {
    const body = parseBody<{ version?: unknown; reason?: unknown }>(event.body);
    return json(200, await hold(event.pathParameters?.productId, body, g.sub), scope);
  } catch (err) {
    return mapProductAdminError(err, scope);
  }
};
