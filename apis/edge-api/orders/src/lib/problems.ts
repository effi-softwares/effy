// Problem types the shared `ProblemType` enum does not carry, plus the OrderActionError mapper.
//
// Follows the convention already used by admin's `*/handler-support.ts`: the URI is spelled out
// locally rather than added to the shared enum, so a service can name a condition the platform has
// not standardised without every other service inheriting it.

import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import type { RequestScope } from "@effy/edge-shared";
import { problem } from "@effy/edge-shared";

export const NOT_FOUND = "https://effyshopping.com/problems/not-found";
export const CONFLICT = "https://effyshopping.com/problems/conflict";
export const UNPROCESSABLE = "https://effyshopping.com/problems/unprocessable";
export const VALIDATION_FAILED = "https://effyshopping.com/problems/validation-failed";

import { ACTION_REFUSALS, OrderActionError } from "./errors";

/**
 * Turn a state refusal into its response.
 *
 * ⚠ These refusals NAME THEIR REASON, unlike the guard's uniform 403. The caller has already proved
 * who they are, so there is no oracle to protect — and "cannot record that" without saying why is
 * how a support ticket gets written instead of a problem getting fixed (FR-006).
 */
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
