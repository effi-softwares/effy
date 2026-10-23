import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import type { AuthedEvent, RequestScope } from "@effy/edge-shared";
import { forbidden, problem, ProblemType, subject, unavailable } from "@effy/edge-shared";
import type { AuditEntryDTO, OrderPolicyDTO } from "@effy/shared-types";

import { canManagePromotions, isActiveStaff } from "./authz";
import { type AuditEntry, type OrderPolicy, isPromoError } from "./types";

/** 401, 403 from the staff record, 503 on infra error. `read`: any staff; `mutate`: admin/manager. */
export async function guard(
  event: AuthedEvent,
  scope: RequestScope,
  level: "read" | "mutate",
): Promise<{ sub: string } | { deny: APIGatewayProxyStructuredResultV2 }> {
  const sub = subject(event);
  if (!sub) {
    return {
      deny: problem(401, ProblemType.Unauthenticated, "Authentication required",
        "a valid access token for this audience is required", scope),
    };
  }
  try {
    const ok = level === "read" ? await isActiveStaff(sub) : await canManagePromotions(sub);
    if (!ok) return { deny: forbidden(scope) };
  } catch (err) {
    scope.log.error({ err: err instanceof Error ? err.message : String(err), sub }, "promotions authz check failed");
    return { deny: unavailable(scope) };
  }
  return { sub };
}

/** The refusal's `code` becomes the problem type. Unknown errors become 503 with the cause logged only. */
export function mapPromoError(err: unknown, scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  if (isPromoError(err)) {
    return problem(
      err.status,
      `https://effyshopping.com/problems/${err.code.replace(/_/g, "-")}`,
      err.status === 409 ? "Conflict" : err.status === 404 ? "Not found" : "Validation failed",
      err.message,
      scope,
      err.fields.length > 0 ? err.fields : undefined,
    );
  }
  scope.log.error({ err: err instanceof Error ? err.message : String(err) }, "promotions op failed");
  return unavailable(scope);
}

export function toOrderPolicyDTO(p: OrderPolicy): OrderPolicyDTO {
  return {
    minimumSubtotalAmount: p.minimumSubtotalAmount,
    currency: p.currency,
    maxLineQuantity: p.maxLineQuantity,
    maxDistinctItems: p.maxDistinctItems,
    updatedBy: p.updatedBy,
    updatedAt: p.updatedAt,
  };
}

export function toAuditDTO(a: AuditEntry): AuditEntryDTO {
  return {
    id: a.id,
    actorSub: a.actorSub,
    action: a.action,
    targetType: a.targetType,
    targetId: a.targetId,
    detail: a.detail,
    createdAt: a.createdAt,
  };
}
