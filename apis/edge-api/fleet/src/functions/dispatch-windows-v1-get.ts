import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { denied, guard } from "../shared/handler-support";
import { mapDispatchError } from "../shared/dispatch-handler-support";
import { readWindows } from "../dispatch/windows";

/** Any active staff. Today or a later day with windows on sale; a later day has no rounds yet. */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  try {
    return json(200, await readWindows(event.queryStringParameters?.date), scope);
  } catch (err) {
    return mapDispatchError(err, scope);
  }
};
