import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";
import type { AuthedEvent } from "@effy/edge-shared";
import { isMediaValidationError, json, presignUpload, problem, ProblemType, unavailable } from "@effy/edge-shared";
import type { ProofPresignRequest } from "@effy/shared-types";

import { authenticate } from "../driver/guard";
import { getDrop } from "../delivery/repository";

const NOT_FOUND = "https://effyshopping.com/problems/not-found";

/**
 * POST /driver/v1/delivery/drops/{dropId}/proof/presign (049 US2, R7). A presigned PUT to the private
 * media bucket under the driver-proof/ prefix (IAM-scoped). Only needed for photo/signature proof.
 */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const g = await authenticate(event, context);
  if (!g.ok) return g.response;
  const dropId = event.pathParameters?.dropId;
  if (!dropId) return problem(400, ProblemType.ValidationFailed, "Validation failed", "dropId is required", g.scope);
  let body: ProofPresignRequest;
  try {
    body = JSON.parse(event.body ?? "{}") as ProofPresignRequest;
  } catch {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "body must be JSON", g.scope);
  }
  try {
    // Confirm the drop is this driver's before minting an upload URL.
    const drop = await getDrop(dropId, g.driver.id);
    if (!drop) return problem(404, NOT_FOUND, "Not found", "no such drop", g.scope);

    const { uploadUrl, storageKey } = await presignUpload("driver-proof", dropId, body.contentType, body.fileSize);
    return json(200, { uploadUrl, mediaKey: storageKey }, g.scope);
  } catch (err) {
    if (isMediaValidationError(err)) {
      return problem(400, ProblemType.ValidationFailed, "Validation failed", err.message, g.scope, err.fields);
    }
    g.scope.log.error({ err, dropId }, "proof presign failed");
    return unavailable(g.scope);
  }
};
