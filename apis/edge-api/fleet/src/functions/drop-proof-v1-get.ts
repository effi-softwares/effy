// GET /fleet/v1/drops/{deliveryTaskId}/proof — the evidence for a completed delivery (056 US5).
//
// Read = any active back-office staff. ⚠ Reading proof is a READ, but it is not a free one: the
// media may be a photograph of somebody's home, so the URL is time-limited and issuing it is
// AUDITED (FR-042). The audit records the minting, not the fetching — presigning cannot report a
// fetch, and the audit trail says what it can actually observe.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { denied, guard, mapFleetError } from "../shared/handler-support";
import { readProof } from "../history/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  try {
    return json(
      200,
      await readProof(event.pathParameters?.deliveryTaskId ?? "", g.sub),
      scope,
    );
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
