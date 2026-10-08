// DELETE /admin/v1/delivery/coverage/groups/{groupId} — remove a group; its postcodes stay listed (076 FR-015). Mutate.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { removeGroup } from "../delivery/coverage.service";
import { guard, mapCoverageError } from "../delivery/handler-support";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;
  try {
    const confirm = event.queryStringParameters?.confirmNoDrivers === "true";
    return json(200, await removeGroup(event.pathParameters?.groupId ?? "", confirm, g.sub), scope);
  } catch (err) {
    return mapCoverageError(err, scope);
  }
};
