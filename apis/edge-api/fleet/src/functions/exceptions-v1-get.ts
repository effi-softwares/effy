import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { listExceptions } from "../exceptions/service";
import { mapDispatchError } from "../shared/dispatch-handler-support";
import { denied, guard } from "../shared/handler-support";

/**
 * GET /fleet/v1/exceptions — deliveries that could not be completed (064, FR-019).
 *
 * ⚠ READ = ANY ACTIVE STAFF, INCLUDING csa (FR-021). Triage is CSA work, and the whole reason this
 * capability exists is that nobody could see these at all: a driver marked a drop undeliverable, the
 * package stayed put, and the shopper kept seeing "on the way" indefinitely with nobody at Effy told.
 * Gating the READ behind a manager would recreate the gap in a smaller form.
 */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  try {
    const includeResolved = event.queryStringParameters?.includeResolved === "true";
    return json(200, await listExceptions(includeResolved), scope);
  } catch (err) {
    return mapDispatchError(err, scope);
  }
};
