import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import { type RequestScope, problem, ProblemType, unavailable } from "@effy/edge-shared";

import { CustomerBarredError, CustomerNotFoundError } from "../customer/service";
import {
  AddressInstructionsError,
  AddressNotFoundError,
  AddressValidationError,
  DefaultDeleteBlockedError,
  type AddressRequestInput,
} from "./service";

/** Absent fields are `null`; an update keeps them (COALESCE), a create validates required ones in the service. */
export function toAddressInput(body: Record<string, unknown>): AddressRequestInput {
  const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
  return {
    // Passed through raw, only when the key is present: absent leaves the saved default, `null` clears it.
    ...("defaultDeliveryInstructions" in body
      ? { rawDefaultDeliveryInstructions: body.defaultDeliveryInstructions ?? null }
      : {}),
    label: str(body.label),
    recipientName: str(body.recipientName),
    phone: str(body.phone),
    line1: str(body.line1),
    line2: str(body.line2),
    city: str(body.city),
    region: str(body.region),
    postalCode: str(body.postalCode),
    country: str(body.country),
    makeDefault: body.makeDefault === true,
  };
}

export function addressErrorResponse(
  err: unknown,
  scope: RequestScope,
): APIGatewayProxyStructuredResultV2 {
  // The record decides access; a barred account and one with no record are refused alike.
  if (err instanceof CustomerBarredError || err instanceof CustomerNotFoundError) {
    return problem(403, ProblemType.Forbidden, "Not permitted", "this account cannot be used", scope);
  }
  if (err instanceof AddressValidationError) {
    return problem(
      400,
      ProblemType.ValidationFailed,
      "Request validation failed",
      "recipient name, line 1, city and postal code are required",
      scope,
    );
  }
  if (err instanceof AddressInstructionsError) {
    return problem(
      400,
      ProblemType.ValidationFailed,
      "Request validation failed",
      err.reason === "too_long"
        ? "delivery instructions can be at most 250 characters"
        : "check the delivery instructions",
      scope,
    );
  }
  if (err instanceof AddressNotFoundError) {
    return problem(
      404,
      ProblemType.NoRoute,
      "No such address",
      "the requested address does not exist",
      scope,
    );
  }
  if (err instanceof DefaultDeleteBlockedError) {
    return problem(
      409,
      ProblemType.Conflict,
      "Conflict",
      "set another address as your default before deleting this one",
      scope,
    );
  }
  scope.log.error({ err }, "addresses: operation failed");
  return unavailable(scope);
}
