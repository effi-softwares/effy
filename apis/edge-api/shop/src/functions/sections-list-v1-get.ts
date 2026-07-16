// GET /shop/v1/sections — this shop's sections (US5).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { gate, mapProductError, toSectionDTO } from "../products/handler-support";
import { listSections } from "../sections/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;
  try {
    return json(200, (await listSections(g.shopId)).map(toSectionDTO), scope);
  } catch (err) {
    return mapProductError(err, scope);
  }
};
