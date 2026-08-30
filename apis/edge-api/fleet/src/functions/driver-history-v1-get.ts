// GET /fleet/v1/drivers/{driverId}/history — the work record (056 US5, FR-039/FR-043).
// Read = any active back-office staff.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { denied, guard, mapFleetError } from "../shared/handler-support";
import { readHistory } from "../history/service";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;

  const qs = event.queryStringParameters ?? {};
  const limitRaw = Number(qs.limit);
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), MAX_LIMIT) : DEFAULT_LIMIT;

  try {
    return json(
      200,
      await readHistory({
        driverId: event.pathParameters?.driverId ?? "",
        from: qs.from?.trim() || undefined,
        to: qs.to?.trim() || undefined,
        cursor: qs.cursor?.trim() || undefined,
        limit,
      }),
      scope,
    );
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
