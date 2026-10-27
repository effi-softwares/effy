// Hold, release or set the margin of up to 200 products, each on its own (102). Admin/manager.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { bulk } from "../products/controls";
import { denied, guard, mapProductAdminError, parseBody } from "../products/handler-support";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "decide");
  if (denied(g)) return g.deny;
  try {
    const body = parseBody<{ action?: unknown; items?: unknown; reason?: unknown; margin?: unknown }>(event.body);
    return json(200, await bulk(body, g.sub), scope);
  } catch (err) {
    return mapProductAdminError(err, scope);
  }
};
