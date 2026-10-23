import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import { announceMoves } from "@effy/edge-shared/live";
import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem, unavailable } from "@effy/edge-shared";
import type { RecordArrivalRequest } from "@effy/shared-types";

import { recordArrival } from "../arrival/repository";
import { requireWriter } from "../lib/guard";
import { arrivalRecorded } from "../lib/metrics";
import { refusalResponse, VALIDATION_FAILED } from "../lib/problems";

/** Admin/manager only: "arrived" is a person's assertion that completes an order and messages a customer. */
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
    // Metered only on a new arrival.
    if (result.created) arrivalRecorded("staff_recorded", result.orderFinished);
    if (result.created) await announceMoves([{ fulfillmentId, from: "collected" }]);
    // A replay returns the original arrival time.
    return json(result.created ? 201 : 200, result, guard.scope);
  } catch (err) {
    const refusal = refusalResponse(err, guard.scope);
    if (refusal) return refusal;
    guard.scope.log.error({ err, fulfillmentId }, "orders: arrival failed");
    return unavailable(guard.scope);
  }
};
