// Back-office places a product in up to five extra leaves for browsing (101, US8). Admin/manager.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";
import { announce } from "@effy/edge-shared/live";

import { setPlacements } from "../placements/service";
import { denied, guard, mapTaxonomyError, parseTaxonomyBody } from "../taxonomy/handler-support";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "decide");
  if (denied(g)) return g.deny;
  try {
    const out = await setPlacements(event.pathParameters?.productId ?? "", parseTaxonomyBody<Record<string, unknown>>(event.body), g.sub);
    await announce([{ scope: "ops", kind: "review" }]);
    return json(200, out, scope);
  } catch (err) {
    return mapTaxonomyError(err, scope);
  }
};
