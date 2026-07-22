import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import { type RequestScope, problem, ProblemType, unavailable } from "@effy/edge-shared";

import { CustomerBarredError, CustomerNotFoundError } from "../customer/service";
import type { AddressInput } from "./repo";
import {
  AddressNotFoundError,
  AddressValidationError,
  DefaultDeleteBlockedError,
} from "./service";

/**
 * Map a parsed request body to the repository's AddressInput. Absent fields are `null`; on UPDATE a
 * null field is preserved (COALESCE), on CREATE the required fields are validated in the service.
 * Unknown fields never reach SQL — the statements name their columns explicitly.
 */
export function toAddressInput(body: Record<string, unknown>): AddressInput {
  const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
  return {
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

/** The shared error envelope for the write handlers — same vocabulary as core-api's addresses. */
export function addressErrorResponse(
  err: unknown,
  scope: RequestScope,
): APIGatewayProxyStructuredResultV2 {
  // The record decides access (FR-020) — a barred account, or one with no record yet, is refused
  // uniformly and without disclosing which (parity with the profile endpoints).
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
