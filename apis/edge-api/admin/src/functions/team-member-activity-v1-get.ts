import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { activityResponse, preamble } from "@effy/edge-shared";

import { teamMemberActivitySource } from "../team/activity";
import { guardAdmin, mapTeamError, staffIdOf } from "../team/handler-support";

/** GET /admin/v1/staff/{staffId}/activity - every change to a person's access, in the one drawer (119 FR-026; 104). */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guardAdmin(event, scope);
  if ("deny" in g) return g.deny;
  try {
    return await activityResponse(event.queryStringParameters, scope, "bo-team-member", async () =>
      teamMemberActivitySource(staffIdOf(event)),
    );
  } catch (err) {
    return mapTeamError(err, scope);
  }
};
