// PATCH /shop/v1/notification-preferences — mute or unmute types on ONE registration (059, FR-024).
//
// ⚠ REPLACES WHOLESALE. `[]` is a meaningful value — "everything on" — not an absence. That is the
// inverse of 056's COALESCE defect, where a field could never be cleared at all; here the
// requirement is that clearing works, and that omitting the CALL changes nothing.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";

// `ProblemType` has no NotFound member; `products/handler-support.ts` declares the same literal.
const NOT_FOUND = "https://effyshopping.com/problems/not-found";
import {
  KNOWN_SHOP_NOTIFICATION_TYPES,
  parseJsonBody,
  preamble,
  problem,
  ProblemType,
  setMutedTypes,
  subject,
} from "@effy/edge-shared";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const sub = subject(event);
  if (!sub) {
    return problem(
      401,
      ProblemType.Unauthenticated,
      "Authentication required",
      "a valid shop token is required",
      scope,
    );
  }

  const body = parseJsonBody<{ fcmToken?: unknown; mutedTypes?: unknown }>(event.body);
  if (body.errors.length > 0 || !body.value) {
    return problem(
      400,
      ProblemType.ValidationFailed,
      "Invalid request",
      body.errors[0]?.message ?? "the request body is not valid JSON",
      scope,
    );
  }

  const fcmToken = typeof body.value.fcmToken === "string" ? body.value.fcmToken.trim() : "";
  if (!fcmToken) {
    return problem(400, ProblemType.ValidationFailed, "Invalid request", "fcmToken is required", scope);
  }

  const raw = body.value.mutedTypes;
  if (!Array.isArray(raw) || !raw.every((t) => typeof t === "string")) {
    return problem(
      400,
      ProblemType.ValidationFailed,
      "Invalid request",
      "mutedTypes must be an array of strings",
      scope,
    );
  }

  // ⚠ A CLOSED SET. An unknown type would mute nothing, so accepting it silently would leave the
  // operator believing they had switched something off. Named in the refusal so a console version
  // mismatch is legible rather than mysterious.
  const unknown = raw.filter((t) => !KNOWN_SHOP_NOTIFICATION_TYPES.includes(t as never));
  if (unknown.length > 0) {
    return problem(
      400,
      ProblemType.ValidationFailed,
      "Invalid request",
      `unknown notification type: ${unknown.join(", ")}`,
      scope,
    );
  }

  const updated = await setMutedTypes(sub, fcmToken, raw as string[]);
  if (!updated) {
    // ⚠ IDENTICAL for "not yours" and "no such token" — see the GET handler. A distinguishable
    // refusal here is an oracle for which tokens are registered on the platform.
    return problem(404, NOT_FOUND, "Not found", "no registration for that token", scope);
  }

  return { statusCode: 204, headers: { "x-request-id": scope.requestId } };
};
