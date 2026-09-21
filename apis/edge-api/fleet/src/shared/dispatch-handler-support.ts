// Shared refusal mapping for the dispatch routes (063).
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { problem, type RequestScope } from "@effy/edge-shared";

import { DispatchError } from "../dispatch/service";

/** Human wording for each reason a driver cannot take a round (FR-034). */
const REASON_TEXT: Record<string, string> = {
  not_on_duty: "they are not on duty",
  not_employable: "they are stood down or no longer employed",
  licence_expired: "their licence has expired",
  no_vehicle: "they are not holding a vehicle",
  not_cleared: "they are not cleared for this work",
  no_refrigeration: "their vehicle cannot carry these goods",
  over_capacity: "the round is heavier than their vehicle can carry",
  cannot_meet_deadline: "they cannot finish it in time",
};

/**
 * ⚠ A REFUSAL MUST NAME THE CONDITION (FR-034). A uniform "not allowed" sends the operator hunting
 * through five screens for which of five things is wrong — and 053 found every console refusal
 * collapsing to one generic sentence because the screen matched on `instanceof Error` while the
 * api-client throws a plain object.
 */
export function mapDispatchError(
  err: unknown,
  scope: RequestScope,
): APIGatewayProxyStructuredResultV2 {
  if (err instanceof DispatchError) {
    switch (err.kind) {
      case "not_found":
        return problem(404, "not_found", "Not found", err.detail, scope);
      case "stale":
        return problem(409, "conflict", "Changed by someone else", err.detail, scope);
      case "locked":
        return problem(409, "conflict", "Locked", err.detail, scope);
      case "invalid":
        return problem(400, "invalid_request", "Invalid", err.detail, scope);
      case "ineligible": {
        const named = err.reasons.map((r) => REASON_TEXT[r] ?? r).join(", and ");
        return problem(
          422,
          "ineligible_driver",
          "That driver cannot take this round",
          named === "" ? err.detail : `That driver cannot take this round because ${named}.`,
          scope,
          // ⚠ THE STABLE CODE GOES IN `field`, which is 032's convention for a whole-request
          // refusal — `ProblemFieldIssue` has no `code`, and inventing one would have been a second
          // shape for a thing the contract already expresses. The console maps this code to its OWN
          // wording; `message` is a fallback for anything that reads the problem document raw.
          err.reasons.map((r) => ({ field: r, message: REASON_TEXT[r] ?? r })),
        );
      }
    }
  }
  throw err;
}
