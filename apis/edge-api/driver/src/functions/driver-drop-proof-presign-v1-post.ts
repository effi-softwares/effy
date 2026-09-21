import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem } from "@effy/edge-shared";
import type { ProofPresignRequest } from "@effy/shared-types";

import { authenticate } from "../driver/guard";
import { MediaValidationError, ProofValidationError, presignProof } from "../proof/service";

/**
 * POST /driver/v1/delivery/drops/{dropId}/proof/presign (064, US1).
 *
 * ⚠ BYTES NEVER PASS THROUGH LAMBDA. The driver uploads straight to S3 against a presigned PUT; this
 * only mints the url and the key. The app then submits the key with the proof — upload FIRST, submit
 * SECOND, which is what makes FR-006 structural: a drop cannot be marked delivered against an image
 * that failed to arrive, because the submission carries a key to something already stored.
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

  let body: ProofPresignRequest;
  try {
    body = JSON.parse(event.body ?? "{}") as ProofPresignRequest;
  } catch {
    return problem(400, "invalid_request", "Malformed body", "The request body was not valid JSON.", guard.scope);
  }

  try {
    return json(200, await presignProof(dropId, body), guard.scope);
  } catch (err) {
    if (err instanceof ProofValidationError) {
      return problem(422, "validation_failed", "Cannot prepare upload", err.detail, guard.scope, [
        { field: err.field, message: err.detail },
      ]);
    }
    // The shared helper already answers field-scoped for a bad content type or an oversize file; it
    // is mapped rather than rethrown so a driver sees which field is wrong, not a 500.
    if (err instanceof MediaValidationError) {
      return problem(422, "validation_failed", "Cannot prepare upload", err.message, guard.scope, err.fields);
    }
    throw err;
  }
};
