// HTTP boundary helpers for the shop same-day declaration (032): the authz guard, the domain→wire
// mapping, and the error→problem+json mapping. No business logic (Principle VI).
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import type { AuthedEvent, RequestScope } from "@effy/edge-shared";
import { forbidden, problem, ProblemType, subject, unavailable } from "@effy/edge-shared";
import type { SamedayAreaDTO, SamedayDeclarationDTO, SamedayDeclarationViewDTO } from "@effy/shared-types";

import { authorizeDeclarationRead, authorizeDeclarationWrite } from "./authz";
import { isDeclarationError } from "./types";
import type { Declaration, DeclarationArea, DeclarationView } from "./types";

/**
 * Resolve the actor's shop, or the response that denies them.
 *
 * ⚠ `level` is not cosmetic: a same-day declaration is a standing commitment about what the shop can
 * physically do, so submitting is shop_manager only while reading is any active member.
 */
export async function guard(
  event: AuthedEvent,
  scope: RequestScope,
  level: "read" | "submit",
): Promise<{ sub: string; shopId: string } | { deny: APIGatewayProxyStructuredResultV2 }> {
  const sub = subject(event);
  if (!sub) {
    return {
      deny: problem(401, ProblemType.Unauthenticated, "Authentication required",
        "a valid access token for this audience is required", scope),
    };
  }
  try {
    const shopId =
      level === "read" ? await authorizeDeclarationRead(sub) : await authorizeDeclarationWrite(sub);
    if (!shopId) return { deny: forbidden(scope) };
    return { sub, shopId };
  } catch (err) {
    scope.log.error(
      { err: err instanceof Error ? err.message : String(err), sub },
      "delivery declaration authz check failed",
    );
    return { deny: unavailable(scope) };
  }
}

/** Map a domain error to problem+json. Unknown errors become 503 with the cause logged only. */
export function mapDeclarationError(err: unknown, scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  if (isDeclarationError(err)) {
    switch (err.kind) {
      case "validation":
        return problem(400, ProblemType.ValidationFailed, "Validation failed", err.message, scope, err.fields);
      // ⚠ 422, not 400: the body parsed and every field is the right type — what is refused is a
      // DECLARATION that would quietly mean something the shop did not intend. The `code` is what
      // makes each refusal distinguishable, because "invalid" would leave a shop operator guessing
      // which of six rules they broke.
      case "unprocessable":
        return problem(
          422,
          ProblemType.ValidationFailed,
          "Cannot save this declaration",
          err.message,
          scope,
          err.code ? [{ field: err.code, message: err.message }] : err.fields,
        );
      case "forbidden":
        return forbidden(scope);
    }
  }
  scope.log.error({ err: err instanceof Error ? err.message : String(err) }, "delivery declaration op failed");
  return unavailable(scope);
}

// ── domain → wire ─────────────────────────────────────────────────────────────────────────────

function toAreaDTO(a: DeclarationArea): SamedayAreaDTO {
  return { postcode: a.postcode, places: a.places, localityCount: a.localityCount };
}

export function toDeclarationDTO(d: Declaration): SamedayDeclarationDTO {
  return {
    id: d.id,
    shopId: d.shopId,
    offersSameday: d.offersSameday,
    cutoffTime: d.cutoffTime,
    status: d.status,
    areas: d.areas.map(toAreaDTO),
    submittedBy: d.submittedBy,
    submittedAt: d.submittedAt,
    decidedBy: d.decidedBy,
    decidedAt: d.decidedAt,
    decisionNote: d.decisionNote,
  };
}

export function toDeclarationViewDTO(v: DeclarationView): SamedayDeclarationViewDTO {
  return {
    canDeclare: v.canDeclare,
    cannotDeclareReason: v.cannotDeclareReason,
    inForce: v.inForce ? toDeclarationDTO(v.inForce) : null,
    pending: v.pending ? toDeclarationDTO(v.pending) : null,
    lastDecision: v.lastDecision ? toDeclarationDTO(v.lastDecision) : null,
  };
}
