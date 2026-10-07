import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble, problem } from "@effy/edge-shared";

import { isStage, mapAssignmentError } from "../assignments/handler-support";
import { driversFor } from "../assignments/service";
import { denied, guard } from "../shared/handler-support";

/**
 * GET /fleet/v1/dispatch/packages/{packageId}/drivers?stage= (073) — who can take this package:
 * fine first, then those with a concern, then those who cannot, each with a few plain words.
 * Read = any back-office role, like the rest of dispatch.
 */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  const packageId = event.pathParameters?.packageId;
  const stage = event.queryStringParameters?.stage;
  if (!packageId || !isStage(stage)) {
    return problem(400, "invalid_request", "Missing fields", "A package and a stage (collection or delivery) are required.", scope);
  }
  try {
    return json(200, { drivers: await driversFor(packageId, stage) }, scope);
  } catch (err) {
    return mapAssignmentError(err, scope);
  }
};
