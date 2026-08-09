// POST /admin/v1/home-layout/preview — mint a short-lived grant to view the DRAFT home page (042 US3).
//
// ⚠ MUTATE GATE, even though it writes nothing. This hands out the ability to read UNPUBLISHED
// merchandising — prices that were never agreed, offers that may never run. Whoever can see the draft
// is whoever can compose it.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { guard, mapLayoutError } from "../homelayout/handler-support";
import { mintPreviewToken } from "../homelayout/preview";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;

  try {
    return json(200, await mintPreviewToken(), scope);
  } catch (err) {
    return mapLayoutError(err, scope);
  }
};
