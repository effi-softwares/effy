// POST /admin/v1/delivery/coverage/postcodes — list postcodes (076 FR-002). Mutate.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { addPostcodes } from "../delivery/coverage.service";
import { guard, mapCoverageError } from "../delivery/handler-support";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;
  try {
    const body = JSON.parse(event.body || "{}");
    return json(201, await addPostcodes(body, g.sub), scope);
  } catch (err) {
    return mapCoverageError(err, scope);
  }
};
