import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";
import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem, ProblemType, unavailable } from "@effy/edge-shared";
import type { ProofMethod, ProofRequest } from "@effy/shared-types";

import { authenticate } from "../driver/guard";
import { completeWithProof } from "../delivery/repository";

const NOT_FOUND = "https://effyshopping.com/problems/not-found";
const METHODS: ProofMethod[] = ["photo", "code", "signature", "contactless"];

/** POST /driver/v1/delivery/drops/{dropId}/proof (049 US2, FR-024–027) — complete with proof. */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const g = await authenticate(event, context);
  if (!g.ok) return g.response;
  const dropId = event.pathParameters?.dropId;
  if (!dropId) return problem(400, ProblemType.ValidationFailed, "Validation failed", "dropId is required", g.scope);
  let body: ProofRequest;
  try {
    body = JSON.parse(event.body ?? "{}") as ProofRequest;
  } catch {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "body must be JSON", g.scope);
  }
  if (!METHODS.includes(body.method) || !body.changeId) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "a valid method and changeId are required", g.scope);
  }
  if ((body.method === "photo" || body.method === "signature") && !body.mediaKey) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "mediaKey is required for photo/signature proof", g.scope);
  }
  if (body.method === "code" && !body.code) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "code is required for code proof", g.scope);
  }
  try {
    const ok = await completeWithProof(dropId, g.driver.id, {
      method: body.method,
      mediaKey: body.mediaKey,
      code: body.code,
      note: body.note,
      changeId: body.changeId,
    });
    if (!ok) return problem(404, NOT_FOUND, "Not found", "no such drop", g.scope);
    return json(200, { status: "delivered" }, g.scope);
  } catch (err) {
    if ((err as { code?: string })?.code === "code_invalid") {
      return problem(422, ProblemType.ValidationFailed, "Code incorrect", "the delivery code does not match", g.scope);
    }
    g.scope.log.error({ err, dropId }, "proof completion failed");
    return unavailable(g.scope);
  }
};
