// GET /fleet/v1/hub/expected — the collection runs on their way in, with every bag and where it goes
// (096 US5). Admin/manager: the hub station is for the people who run the hub.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { denied, guard, mapFleetError } from "../shared/handler-support";
import { expected } from "../hub/service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if (denied(g)) return g.deny;
  try {
    return json(200, await expected(), scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
