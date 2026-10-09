// PUT /admin/v1/delivery/go-live/switch — set, change, cancel or turn back off the new delivery model (083).
//
// ⚠ ADMIN ONLY, decided from the staff record inside the service (a manager may edit delivery
// settings; only an admin may change what every customer is sold). ⚠ Refused while the go-live
// checklist has a required item not ready.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { setSwitch } from "../delivery/go-live.service";
import { guard, mapGoLiveError } from "../delivery/handler-support";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  // Any active staff reaches the service; the service refuses everyone but an admin, uniformly.
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;
  try {
    const body = JSON.parse(event.body || "{}");
    return json(200, await setSwitch(body, g.sub), scope);
  } catch (err) {
    return mapGoLiveError(err, scope);
  }
};
