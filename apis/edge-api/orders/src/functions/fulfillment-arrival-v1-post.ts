import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem, unavailable } from "@effy/edge-shared";
import type { RecordArrivalRequest } from "@effy/shared-types";

import { recordArrival } from "../arrival/repository";
import { requireWriter } from "../lib/guard";
import { arrivalRecorded } from "../lib/metrics";
import { refusalResponse, VALIDATION_FAILED } from "../lib/problems";

/**
 * POST /orders/v1/fulfillments/{fulfillmentId}/arrival — record that a package arrived (053 US2).
 *
 * ⚠ THE ROUTE THIS WHOLE FEATURE EXISTS FOR. Before it, a standard package could never leave
 * `collected`, so most orders never finished, the customer was told "on the way" indefinitely, and
 * the delivered notification could not fire on the majority path.
 *
 * ⚠ WRITE GATE: admin|manager only (FR-015). With no carrier signal, "arrived" is an ASSERTION a
 * person is making about a package they never saw, and it finishes a financial record and messages
 * a customer.
 */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireWriter(event, context);
  if (!guard.ok) return guard.response;

  const fulfillmentId = event.pathParameters?.fulfillmentId;
  if (!fulfillmentId) {
    return problem(400, VALIDATION_FAILED, "Missing package", "a package id is required", guard.scope);
  }

  let body: RecordArrivalRequest;
  try {
    body = JSON.parse(event.body ?? "{}") as RecordArrivalRequest;
  } catch {
    return problem(400, VALIDATION_FAILED, "Malformed body", "the request body is not valid JSON", guard.scope);
  }
  if (!body.changeId) {
    return problem(
      400,
      VALIDATION_FAILED,
      "Missing changeId",
      "a changeId identifies this action so a retry is recognised as a retry",
      guard.scope,
    );
  }
  if (body.arrivedAt && Number.isNaN(Date.parse(body.arrivedAt))) {
    return problem(400, VALIDATION_FAILED, "Bad arrival time", "arrivedAt must be an ISO-8601 timestamp", guard.scope);
  }

  try {
    const result = await recordArrival({
      fulfillmentId,
      actorSub: guard.sub,
      arrivedAt: body.arrivedAt,
      note: body.note,
      changeId: body.changeId,
    });
    // ⚠ Metered only on a NEW arrival — a replay must not inflate OrderCompleted.
    if (result.created) arrivalRecorded("staff_recorded", result.orderFinished);
    // ⚠ The replay returns 200 with the ORIGINAL arrival time, never a refreshed one (FR-005).
    return json(result.created ? 201 : 200, result, guard.scope);
  } catch (err) {
    const refusal = refusalResponse(err, guard.scope);
    if (refusal) return refusal;
    guard.scope.log.error({ err, fulfillmentId }, "orders: arrival failed");
    return unavailable(guard.scope);
  }
};
