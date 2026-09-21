import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem } from "@effy/edge-shared";
import type { ProofRequest, ProofResponse } from "@effy/shared-types";

import { authenticate } from "../driver/guard";
import { DropNotFoundError, ProofValidationError, submitProof } from "../proof/service";

/**
 * POST /driver/v1/delivery/drops/{dropId}/proof (064, US1).
 *
 * ⚠ THIS ROUTE IS THE DELIVERY COMPLETION. Before 064 a same-day order could not reach `delivered`
 * by any driver action at all — the only writer of that status was back-office's manual arrival path
 * for carrier packages (research R2).
 *
 * ⚠ "NOT YOURS" AND "NO SUCH DROP" ARE THE SAME ANSWER, BYTE FOR BYTE. They come from one query that
 * returns no row. Distinguishing them would make this route an oracle for other drivers' work (052's
 * rule, applied to the driver audience).
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

  let body: ProofRequest;
  try {
    body = JSON.parse(event.body ?? "{}") as ProofRequest;
  } catch {
    return problem(400, "invalid_request", "Malformed body", "The request body was not valid JSON.", guard.scope);
  }

  try {
    const result = await submitProof(dropId, guard.driver.id, guard.driver.subject, body);

    // ⚠ A REPLAY ANSWERS 200 WITH THE ORIGINAL OUTCOME, not a conflict (FR-005). A request that
    // arrived without its response reaching the phone is ordinary in a loading bay, and the retry
    // must not be something the driver has to think about.
    const response: ProofResponse = { status: "delivered" };
    guard.scope.log.info(
      {
        dropId,
        method: body.method,
        replayed: result.replayed,
        orderComplete: result.orderComplete,
      },
      "driver.proof_captured",
    );
    return json(200, response, guard.scope);
  } catch (err) {
    if (err instanceof ProofValidationError) {
      return problem(422, "validation_failed", "Cannot record proof", err.detail, guard.scope, [
        { field: err.field, message: err.detail },
      ]);
    }
    if (err instanceof DropNotFoundError) {
      return problem(404, "not_found", "Not available", "That delivery is not available.", guard.scope);
    }
    throw err;
  }
};
