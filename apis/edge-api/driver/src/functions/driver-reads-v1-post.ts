import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem, withTransaction } from "@effy/edge-shared";
import { recordReads } from "@effy/edge-shared/labels";
import type { DriverReadsRequest, DriverReadsResponse } from "@effy/shared-types";

import { authenticate } from "../driver/guard";

/**
 * POST /driver/v1/reads (096, research R7) — reads made with no hand-over: a refused scan (the wrong
 * shop's bag, a label for nothing on the run), or a lookup. Until 096 these stopped the driver on screen
 * and were never heard of again — the most useful exception data there is.
 *
 * Idempotent per read (`clientReadId`), so the offline queue may replay it; each read keeps the time it
 * happened on the device. Nothing else changes, so nothing is announced.
 */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await authenticate(event, context);
  if (!guard.ok) return guard.response;

  let body: DriverReadsRequest;
  try {
    body = JSON.parse(event.body ?? "{}") as DriverReadsRequest;
  } catch {
    return problem(400, "invalid_request", "Malformed body", "The request body was not valid JSON.", guard.scope);
  }
  if (!Array.isArray(body?.reads) || body.reads.length === 0 || body.reads.length > 200) {
    return problem(422, "validation_failed", "Cannot record that", "Send between 1 and 200 reads.", guard.scope, [
      { field: "reads", message: "Between 1 and 200 reads." },
    ]);
  }

  const recorded = await withTransaction((tx) =>
    recordReads(tx, {
      actor: { kind: "driver", driverId: guard.driver.id },
      surface: "driver_app",
      // A read with no hand-over is a lookup; its own step is not known to the server.
      step: "lookup",
      reads: body.reads,
    }),
  );
  const response: DriverReadsResponse = { recorded: recorded.length };
  return json(200, response, guard.scope);
};
