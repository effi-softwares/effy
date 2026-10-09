// GET /admin/v1/delivery/go-live — the go-live checklist, the switch's state and the old orders still open (083). Read.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { readGoLive } from "../delivery/go-live.service";
import { guard, mapGoLiveError } from "../delivery/handler-support";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;
  try {
    return json(200, await readGoLive(), scope);
  } catch (err) {
    return mapGoLiveError(err, scope);
  }
};
