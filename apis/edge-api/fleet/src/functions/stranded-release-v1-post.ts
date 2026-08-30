// POST /fleet/v1/stranded/release — return stranded work to the unassigned pool (056 US4, FR-021).
// Write = admin/manager.
//
// ⚠ THIS IS THE ONLY WAY WORK MOVES BY HUMAN HAND ON THIS PLATFORM, and it is deliberately a RELEASE
// and not an ASSIGNMENT. 049 settled "no dispatcher, no accept/decline"; releasing puts work back
// where the sweep can see it and lets the sweep decide. There is no route here that names a
// destination driver, and a test asserts that over the whole route table (FR-038).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";
import type { StrandedReleaseRequest } from "@effy/shared-types";

import { denied, guard, mapFleetError, parseBody } from "../shared/handler-support";
import { releaseStranded } from "../stranded/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if (denied(g)) return g.deny;
  try {
    const body = parseBody<StrandedReleaseRequest>(event.body);
    return json(
      200,
      await releaseStranded(
        body.collectionTaskIds ?? [],
        body.deliveryTaskIds ?? [],
        body.note ?? "",
        g.sub,
        scope,
      ),
      scope,
    );
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
