import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { emitMetric, json, metricNamespace, preamble, problem, query } from "@effy/edge-shared";
import { ParcelReturnRoundNotFoundError } from "@effy/edge-shared/delivery";
import { announce } from "@effy/edge-shared/live";
import type { StaffParcelReturnRequest, StaffParcelReturnResponse } from "@effy/shared-types";

import { staffReturnParcels } from "../dispatch/return";
import { denied, guard } from "../shared/handler-support";

/** Admin/manager: staff record that a round's failed parcels were handed in at the hub, for the driver. */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if (denied(g)) return g.deny;

  const roundId = event.pathParameters?.roundId;
  if (!roundId) return problem(400, "invalid_request", "Missing round", "A roundId is required.", scope);

  let body: StaffParcelReturnRequest;
  try {
    body = JSON.parse(event.body ?? "{}") as StaffParcelReturnRequest;
  } catch {
    return problem(400, "invalid_request", "Malformed body", "The request body was not valid JSON.", scope);
  }
  if (!body?.changeId) return problem(400, "invalid_request", "Missing changeId", "A changeId is required.", scope);

  try {
    const r = await staffReturnParcels(roundId, g.sub, body.changeId);
    if (!r.replayed && r.returned > 0) {
      emitMetric(metricNamespace(), "ParcelsReturned", r.returned);
      await announceReturn(roundId, r.driverId);
    }
    const response: StaffParcelReturnResponse = { returned: r.returned, roundComplete: r.roundComplete };
    return json(200, response, scope);
  } catch (err) {
    if (err instanceof ParcelReturnRoundNotFoundError) {
      return problem(404, "not_found", "Not available", "That round is not available.", scope);
    }
    throw err;
  }
};

/** Tells dispatch and order screens, the shops whose parcels came back, and the driver. Never throws. */
async function announceReturn(roundId: string, driverId: string): Promise<void> {
  let shopIds: string[] = [];
  try {
    const { rows } = await query<{ shop_id: string }>(
      `SELECT DISTINCT sf.shop_id::text AS shop_id
         FROM public.round_package rp
         JOIN public.round_stop rs ON rs.id = rp.stop_id
         JOIN public.shop_fulfillment sf ON sf.id = rp.shop_fulfillment_id
        WHERE rs.round_id = $1 AND rp.state = 'returned'`,
      [roundId],
    );
    shopIds = rows.map((r) => r.shop_id);
  } catch {
    // The rest still hear; a shop console catches up on its next read.
  }
  await announce([
    { scope: "ops", kind: "dispatch" },
    { scope: "ops", kind: "orders" },
    { scope: "driver", driverId, kind: "work" },
    ...shopIds.map((shopId) => ({ scope: "shop" as const, shopId, kind: "orders" as const })),
  ]);
}
