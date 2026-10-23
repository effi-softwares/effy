// Readable by any member; every mutating route checks `requireManager`.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { gate, mapProductError } from "../products/handler-support";
import { listTeam } from "../team/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;
  try {
    return json(200, await listTeam(g.shopId, g.sub), scope);
  } catch (err) {
    return mapProductError(err, scope);
  }
};
