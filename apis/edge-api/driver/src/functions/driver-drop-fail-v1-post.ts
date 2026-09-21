import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem } from "@effy/edge-shared";
import type { DropFailRequest, DropFailResponse } from "@effy/shared-types";

import { authenticate } from "../driver/guard";
import { DropNotFoundError, ProofValidationError, submitFailure } from "../proof/service";

/**
 * POST /driver/v1/delivery/drops/{dropId}/fail (064, US2).
 *
 * ⚠ THE ROUTE THAT LET A DRIVER TELL THE TRUTH. Until 064 a driver who could not complete a drop had
 * two options: mark it delivered when it was not, or leave it open for ever. The app has had these
 * screens since 060 and the platform has had nothing behind them.
 *
 * ⚠ THIS DOES NOT DELIVER, RELEASE OR REASSIGN ANYTHING. The package is still physically in the
 * driver's van (FR-011), and the order must never report delivered because of a failure (SC-011).
 * The only writes are the attempt row and the stop's own status.
 */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await authenticate(event, context);
  if (!guard.ok) return guard.response;

  const dropId = event.pathParameters?.dropId;
  if (!dropId) {
    return problem(400, "invalid_request", "Missing drop", "A dropId is required.", guard.scope);
  }

  let body: DropFailRequest;
  try {
    body = JSON.parse(event.body ?? "{}") as DropFailRequest;
  } catch {
    return problem(400, "invalid_request", "Malformed body", "The request body was not valid JSON.", guard.scope);
  }

  try {
    const result = await submitFailure(dropId, guard.driver.id, body);

    // ⚠ THE REASON IS LOGGED, THE NOTE IS NOT. The mix of reasons is what makes the exception list
    // reportable in aggregate; the note is free text a driver typed at a doorstep and may name a
    // person or a property (FR-028, and 050's no-PII rule). No address, no recipient, no location.
    guard.scope.log.info(
      { dropId, reason: body.reason, replayed: result.replayed },
      "driver.drop_failed",
    );

    const response: DropFailResponse = { status: "failed" };
    return json(200, response, guard.scope);
  } catch (err) {
    if (err instanceof ProofValidationError) {
      return problem(422, "validation_failed", "Cannot record that", err.detail, guard.scope, [
        { field: err.field, message: err.detail },
      ]);
    }
    if (err instanceof DropNotFoundError) {
      return problem(404, "not_found", "Not available", "That delivery is not available.", guard.scope);
    }
    throw err;
  }
};
