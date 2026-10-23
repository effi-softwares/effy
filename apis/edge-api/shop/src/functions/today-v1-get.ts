// Counted from live rows on each read. The analytics half is /shop/v1/insights: one payload cannot
// claim two freshnesses.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { preamble } from "@effy/edge-shared";

import { authorizeShopManager } from "../staff/repository";
import { gate, mapTodayError, todayResponse, toTodayDTO } from "../today/handler-support";
import { buildAttention, readToday } from "../today/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;

  try {
    // Refund rows are filtered server-side by the refund's own manager gate.
    const snapshot = await readToday(g.actor, { canRefund: authorizeShopManager });
    return todayResponse(toTodayDTO(snapshot, buildAttention(snapshot)), event, scope);
  } catch (err) {
    return mapTodayError(err, scope);
  }
};
