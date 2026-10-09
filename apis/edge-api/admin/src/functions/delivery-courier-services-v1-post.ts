// POST /admin/v1/delivery/courier-services — add a courier service (080). Mutate.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { create } from "../delivery/courier-services.service";
import { guard, mapCoverageError } from "../delivery/handler-support";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;
  try {
    return json(201, await create(JSON.parse(event.body || "{}"), g.sub), scope);
  } catch (err) {
    return mapCoverageError(err, scope);
  }
};
