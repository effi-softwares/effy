// Every shop's products, searched and filtered on the server (102). Read = any active staff, csa included.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { denied, guard, mapProductAdminError } from "../products/handler-support";
import { list } from "../products/service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  try {
    return json(200, await list(event.queryStringParameters ?? {}), scope);
  } catch (err) {
    return mapProductAdminError(err, scope);
  }
};
