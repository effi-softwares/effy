import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { problem, type RequestScope } from "@effy/edge-shared";

import { AssignmentError } from "./service";

/** Every refusal answers with ONE line a person can read, in `detail` (073 FR-017). */
export function mapAssignmentError(err: unknown, scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  if (!(err instanceof AssignmentError)) throw err;
  const status = { cannot_take: 422, needs_confirm: 409, changed: 409, collected: 409, not_needed: 409, not_found: 404 }[err.kind];
  return problem(status, err.kind, err.detail, err.detail, scope);
}

export function isStage(v: unknown): v is "collection" | "delivery" {
  return v === "collection" || v === "delivery";
}
