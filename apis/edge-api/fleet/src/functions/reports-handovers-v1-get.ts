// GET /fleet/v1/reports/handovers?from=yyyy-mm-dd&to=yyyy-mm-dd — how bags were handed over and what
// went wrong in a period (096 US6, FR-063). Read = any active staff: it is how dispatch finds the
// shops and steps to fix.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { denied, guard, mapFleetError } from "../shared/handler-support";
import { handoverReport } from "../reports/handovers";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  try {
    const q = event.queryStringParameters ?? {};
    return json(200, await handoverReport(q.from ?? "", q.to ?? ""), scope);
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
