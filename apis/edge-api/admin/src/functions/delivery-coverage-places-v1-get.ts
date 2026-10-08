// GET /admin/v1/delivery/coverage/places?q= — place search for the add dialog, one result per postcode (076). Read.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { searchPlaces } from "../delivery/coverage.service";
import { guard, mapCoverageError } from "../delivery/handler-support";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;
  try {
    return json(200, await searchPlaces(event.queryStringParameters?.q ?? ""), scope);
  } catch (err) {
    return mapCoverageError(err, scope);
  }
};
