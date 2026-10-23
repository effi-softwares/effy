import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import { announceDelivered } from "../work/announce";
import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem } from "@effy/edge-shared";
import type { ProofRequest, ProofResponse } from "@effy/shared-types";

import { authenticate } from "../driver/guard";
import { DropNotFoundError, ProofValidationError, submitProof } from "../proof/service";
import { NothingToHandOver, ParcelsUnaccounted, parcelsUnaccountedProblem } from "@effy/edge-shared/labels";
import { RoundNotOpenError, roundNotOpenProblem } from "../work/open";
import { SequenceError, sequenceProblem } from "../work/sequence";

/** Completes the delivery. "NOT YOURS" and "NO SUCH DROP" are the same answer from one query. */
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
    await announceDelivered(dropId);

    // A replay answers 200 with the original outcome.
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
    // The round has not opened: nothing was written.
    if (err instanceof RoundNotOpenError) return roundNotOpenProblem(err, guard.scope);
    if (err instanceof SequenceError) return sequenceProblem(err, guard.scope);
    if (err instanceof ParcelsUnaccounted) return parcelsUnaccountedProblem(err, guard.scope);
    if (err instanceof NothingToHandOver) {
      return problem(409, "nothing_to_deliver", "Nothing to hand over", err.message, guard.scope);
    }
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
