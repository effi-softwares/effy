import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import { announce } from "@effy/edge-shared/live";
import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem, unavailable } from "@effy/edge-shared";
import type { RecordHandoffRequest } from "@effy/shared-types";

import { requireWriter } from "../lib/guard";
import { carrierHandoffRecorded } from "../lib/metrics";
import { refusalResponse, VALIDATION_FAILED } from "../lib/problems";
import { recordHandoff } from "../handoff/repository";

/** Admin/manager only. A missing `reference` is a complete record (most handovers have none). */
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

  let body: RecordHandoffRequest;
  try {
    body = JSON.parse(event.body ?? "{}") as RecordHandoffRequest;
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

  try {
    const result = await recordHandoff({
      fulfillmentId,
      actorSub: guard.sub,
      reference: body.reference,
      carrierName: body.carrierName,
      note: body.note,
      changeId: body.changeId,
    });
    // Metered only on a new record, not on a replay.
    if (result.created) carrierHandoffRecorded(result.reference !== null);
    // A handover changes no status, so the customer is not told.
    if (result.created) await announce([{ scope: "ops", kind: "orders" }, { scope: "ops", kind: "dispatch" }]);
    // For a new record, 200 for the replay.
    return json(result.created ? 201 : 200, result, guard.scope);
  } catch (err) {
    const refusal = refusalResponse(err, guard.scope);
    if (refusal) return refusal;
    guard.scope.log.error({ err, fulfillmentId }, "orders: handoff failed");
    return unavailable(guard.scope);
  }
};
