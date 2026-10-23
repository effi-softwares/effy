import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import { announceStop } from "../work/announce";
import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem } from "@effy/edge-shared";
import type { DropFailRequest, DropFailResponse } from "@effy/shared-types";

import { authenticate } from "../driver/guard";
import { DropNotFoundError, ProofValidationError, submitFailure } from "../proof/service";
import { RoundNotOpenError, roundNotOpenProblem } from "../work/open";
import { SequenceError, sequenceProblem } from "../work/sequence";

/** Records the attempt and the stop status only: the package stays in the van, and the order is never delivered by a failure. */
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
    await announceStop(dropId);

    // The reason is logged, the note is not: it may name a person or a property.
    guard.scope.log.info(
      { dropId, reason: body.reason, replayed: result.replayed },
      "driver.drop_failed",
    );

    const response: DropFailResponse = { status: "failed" };
    return json(200, response, guard.scope);
  } catch (err) {
    // The round has not opened: nothing was written.
    if (err instanceof RoundNotOpenError) return roundNotOpenProblem(err, guard.scope);
    if (err instanceof SequenceError) return sequenceProblem(err, guard.scope);
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
