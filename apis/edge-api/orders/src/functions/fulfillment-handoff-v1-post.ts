import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem, unavailable } from "@effy/edge-shared";
import type { RecordHandoffRequest } from "@effy/shared-types";

import { requireWriter } from "../lib/guard";
import { carrierHandoffRecorded } from "../lib/metrics";
import { refusalResponse, VALIDATION_FAILED } from "../lib/problems";
import { recordHandoff } from "../handoff/repository";

/**
 * POST /orders/v1/fulfillments/{fulfillmentId}/handoff — record a carrier handover (053 US2).
 *
 * ⚠ WRITE GATE: admin|manager only (FR-015). A `csa` can read every order and this one action is
 * refused — see `lib/guard.ts` for why the platform splits it there.
 *
 * ⚠ A MISSING `reference` IS NOT A VALIDATION ERROR (FR-003). Effy has no carrier contract, so most
 * handovers have no consignment number to record, and refusing without one would make the ordinary
 * case impossible. 201 with a null reference is a COMPLETE record.
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
    // ⚠ Metered only on a NEW record. Counting the idempotent replay too would make the metric a
    // measure of how often someone double-clicked, not of how many packages left the hub.
    if (result.created) carrierHandoffRecorded(result.reference !== null);
    // 201 for a new record, 200 for the idempotent replay — the client can tell them apart without
    // either being an error.
    return json(result.created ? 201 : 200, result, guard.scope);
  } catch (err) {
    const refusal = refusalResponse(err, guard.scope);
    if (refusal) return refusal;
    guard.scope.log.error({ err, fulfillmentId }, "orders: handoff failed");
    return unavailable(guard.scope);
  }
};
