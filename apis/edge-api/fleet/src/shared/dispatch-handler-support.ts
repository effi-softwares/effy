import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { problem, type RequestScope } from "@effy/edge-shared";

import { DispatchError } from "../dispatch/service";

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

/** A refusal names the condition. */
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
      case "invalid":
        return problem(400, "invalid_request", "Invalid", err.detail, scope);
      case "parcels_to_return":
        return problem(409, "parcels_to_return", "Parcels to return first", err.detail, scope);
      case "ineligible": {
        const named = err.reasons.map((r) => REASON_TEXT[r] ?? r).join(", and ");
        return problem(
          422,
          "ineligible_driver",
          "That driver cannot take this round",
          named === "" ? err.detail : `That driver cannot take this round because ${named}.`,
          scope,
          // The stable code goes in `field` (`ProblemFieldIssue` has no `code`); the console words it, `message` is a fallback.
          err.reasons.map((r) => ({ field: r, message: REASON_TEXT[r] ?? r })),
        );
      }
    }
  }
  throw err;
}
