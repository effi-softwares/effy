import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { exportCodes } from "../promotions/promotion-extras";
import { guard, mapPromoError } from "../promotions/handler-support";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if ("deny" in g) return g.deny;
  const id = event.pathParameters?.id ?? "";
  try {
    // The CSV travels inside JSON; the console saves the file itself.
    return json(200, { csv: await exportCodes(id) }, scope);
  } catch (err) {
    return mapPromoError(err, scope);
  }
};
