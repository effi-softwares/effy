// Settings › Team and access: everyone with a back-office record. Admin only, from the staff record (status and role),
// never the token - the list carries every staff email.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { subject } from "@effy/edge-shared";
import { forbidden, json, preamble, problem, ProblemType, unavailable } from "@effy/edge-shared";
import { isActiveAdmin, teamList } from "../staff/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);

  const sub = subject(event);
  if (!sub) {
    return problem(401, ProblemType.Unauthenticated, "Authentication required",
      "a valid access token for this audience is required", scope);
  }

  try {
    if (!(await isActiveAdmin(sub))) {
      scope.log.warn({ sub }, "staff list: not an active administrator (platform record)");
      return forbidden(scope);
    }
    return json(200, { items: await teamList() }, scope);
  } catch (err) {
    scope.log.error({ err: err instanceof Error ? err.message : String(err), sub }, "staff list: read failed");
    return unavailable(scope);
  }
};
