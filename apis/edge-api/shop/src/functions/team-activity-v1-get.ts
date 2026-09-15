// GET /shop/v1/team-activity — what the people at this shop have done (058, US5).
//
// A UNION over the audit trails the platform already keeps; this screen writes nothing and records
// nothing of its own. Open to both shop roles: the actions are theirs, and 020 made fulfilment
// unrestricted between them precisely because the people at the shelves are the ones doing the work.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { readActivity } from "../team-activity/service";
import { gate, mapTodayError } from "../today/handler-support";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;

  try {
    return json(200, await readActivity(g.actor.shopId), scope);
  } catch (err) {
    return mapTodayError(err, scope);
  }
};
