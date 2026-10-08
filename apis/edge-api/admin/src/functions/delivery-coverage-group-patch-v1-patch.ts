// PATCH /admin/v1/delivery/coverage/groups/{groupId} — rename a group (076 FR-015). Mutate.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { noContent, preamble } from "@effy/edge-shared";

import { renameGroup } from "../delivery/coverage.service";
import { guard, mapCoverageError } from "../delivery/handler-support";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;
  try {
    const body = JSON.parse(event.body || "{}");
    await renameGroup(event.pathParameters?.groupId ?? "", body, g.sub);
    return noContent(scope);
  } catch (err) {
    return mapCoverageError(err, scope);
  }
};
