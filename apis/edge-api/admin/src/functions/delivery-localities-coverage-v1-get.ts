// GET /admin/v1/delivery-localities/coverage?postcode= — ⚠ THE DATA BEHIND FR-006 (031 US1).
//
// Serviceability is decided by POSTCODE, so choosing one place makes every place sharing its postcode
// serviceable: 3350 covers twenty Ballarat localities, 3550 covers twelve in Bendigo. This endpoint is
// what lets the console say so BEFORE an admin confirms — without it, they believe they made a narrow
// decision and made a broad one, and the only evidence otherwise is an order from a suburb they never
// meant to serve.
//
// ⚠ An EMPTY result is a valid answer, not an error: it means no locality names this postcode (the
// 3001 case). The caller warns and asks for confirmation; it does not refuse (FR-005).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapDeliveryError } from "../delivery/handler-support";
import { postcodeCoverage } from "../delivery/localities";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;

  try {
    const coverage = await postcodeCoverage(event.queryStringParameters?.postcode);
    return json(200, coverage, scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
