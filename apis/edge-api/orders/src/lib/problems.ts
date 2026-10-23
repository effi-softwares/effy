// Problem types the shared enum does not carry, spelled out locally.

import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import type { RequestScope } from "@effy/edge-shared";
import { problem } from "@effy/edge-shared";

export const NOT_FOUND = "https://effyshopping.com/problems/not-found";
export const CONFLICT = "https://effyshopping.com/problems/conflict";
export const UNPROCESSABLE = "https://effyshopping.com/problems/unprocessable";
export const VALIDATION_FAILED = "https://effyshopping.com/problems/validation-failed";

import { ACTION_REFUSALS, OrderActionError } from "./errors";

/** State refusals name their reason: the caller is already authorized. */
export function refusalResponse(
  err: unknown,
  scope: RequestScope,
): APIGatewayProxyStructuredResultV2 | null {
  if (!(err instanceof OrderActionError)) return null;
  const r = ACTION_REFUSALS[err.reason];
  const type =
    r.status === 404 ? NOT_FOUND : r.status === 409 ? CONFLICT : UNPROCESSABLE;
  return problem(r.status, type, r.title, r.detail, scope);
}
