// Create an import's ready products; the worker does it (102). Admin/manager.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { create } from "../imports/service";
import { denied, guard, mapProductAdminError, parseBody } from "../products/handler-support";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "decide");
  if (denied(g)) return g.deny;
  try {
    return json(202, await create(event.pathParameters?.importId, parseBody<{ version?: unknown }>(event.body), g.sub), scope);
  } catch (err) {
    return mapProductAdminError(err, scope);
  }
};
