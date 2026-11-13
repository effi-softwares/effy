import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble, refused } from "@effy/edge-shared";
import { TEAM_REFUSAL_WORDS } from "@effy/shared-types";

import { bodyOf, guardSignedIn, mapTeamError } from "../team/handler-support";
import { team } from "../team/service";

/** PATCH /admin/v1/me - any ACTIVE person corrects their own name (119 FR-003). No record or not active: 403. */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = guardSignedIn(event, scope);
  if ("deny" in g) return g.deny;
  try {
    const changed = await team.renameSelf(g, bodyOf(event));
    if (!changed) return refused(scope, 403, "staff_disabled", TEAM_REFUSAL_WORDS.accessEnded);
    return json(200, changed, scope);
  } catch (err) {
    return mapTeamError(err, scope);
  }
};
