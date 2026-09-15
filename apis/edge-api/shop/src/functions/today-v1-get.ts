// GET /shop/v1/today — the shop console's live operational snapshot (058, US1).
//
// Scoped to the caller's own shop by gate(); there is no shop parameter to supply. Everything here
// is COUNTED from live rows on each read — the pick backlog, what is out of stock, the refunds the
// platform is proposing — so it is correct the moment an order is picked rather than correct as of
// the last rollup. The analytics half lives at /shop/v1/insights and must not be folded in here
// (FR-025/FR-026): one payload cannot honestly claim two freshnesses.
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
    // ⚠ The refund rows are filtered SERVER-SIDE by the same record-authoritative manager gate the
    // refund itself uses (057 FR-014). Sending them and letting the client hide them would put an
    // order number and an amount in the hands of an operator the platform will refuse — and a
    // proposal is the platform saying it may owe a customer money.
    const snapshot = await readToday(g.actor, { canRefund: authorizeShopManager });
    return todayResponse(toTodayDTO(snapshot, buildAttention(snapshot)), event, scope);
  } catch (err) {
    return mapTodayError(err, scope);
  }
};
