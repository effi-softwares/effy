import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem } from "@effy/edge-shared";
import type { ProofPresignRequest } from "@effy/shared-types";

import { authenticate } from "../driver/guard";
import { MediaValidationError, ProofValidationError, presignProof } from "../proof/service";
import { RoundNotOpenError, roundNotOpenProblem } from "../work/open";

/** Bytes go straight to S3; the proof is submitted with the key afterwards, so it refers to a stored image. */
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

  let body: ProofPresignRequest;
  try {
    body = JSON.parse(event.body ?? "{}") as ProofPresignRequest;
  } catch {
    return problem(400, "invalid_request", "Malformed body", "The request body was not valid JSON.", guard.scope);
  }

  try {
    return json(200, await presignProof(dropId, guard.driver.id, body), guard.scope);
  } catch (err) {
    // The round has not opened: nothing was written.
    if (err instanceof RoundNotOpenError) return roundNotOpenProblem(err, guard.scope);
    if (err instanceof ProofValidationError) {
      return problem(422, "validation_failed", "Cannot prepare upload", err.detail, guard.scope, [
        { field: err.field, message: err.detail },
      ]);
    }
    // Mapped rather than rethrown, so the driver sees which field is wrong.
    if (err instanceof MediaValidationError) {
      return problem(422, "validation_failed", "Cannot prepare upload", err.message, guard.scope, err.fields);
    }
    throw err;
  }
};
