// Shared handler support for the promotions slice: the back-office guard, PromoError → problem+json, and
// domain → wire-DTO mappers. Keeps the thin handlers free of repetition while each still owns its own
// parse/authorize/map flow (ARCHITECTURE: no middleware framework). Mirrors the delivery slice.
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import type { AuthedEvent, RequestScope } from "@effy/edge-shared";
import { forbidden, problem, ProblemType, subject, unavailable } from "@effy/edge-shared";
import type { AuditEntryDTO, OrderPolicyDTO, PagedDTO, PromoCodeDTO } from "@effy/shared-types";

import { canManagePromotions, isActiveStaff } from "./authz";
import { type AuditEntry, type OrderPolicy, type Paged, type PromoCode, isPromoError } from "./types";

/**
 * Authenticate (401) + authorize from the platform record (403), fail-closed to 503 on an infra error.
 * `read` = any active staff including csa — answering "is this code still live?" is support work.
 * `mutate` = admin/manager only (FR-052).
 */
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

/**
 * Map a domain refusal to problem+json.
 *
 * ⚠ The refusal's own `code` becomes the problem `type` URI, so the console can tell a duplicate from an
 * inverted window from an attempt to rewrite a redeemed code — three different things for an operator to
 * do next. Unknown errors become 503 with the cause logged only.
 */
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

// ── domain → wire DTO (never leak domain shapes past the handler) ──────────────────────────────

export function toPromoDTO(p: PromoCode): PromoCodeDTO {
  return {
    id: p.id,
    code: p.code,
    kind: p.kind,
    percentOff: p.percentOff,
    amountOff: p.amountOff,
    currency: p.currency,
    minimumSubtotalAmount: p.minimumSubtotalAmount,
    startsAt: p.startsAt,
    endsAt: p.endsAt,
    maxRedemptions: p.maxRedemptions,
    maxPerCustomer: p.maxPerCustomer,
    status: p.status,
    redemptionCount: p.redemptionCount,
    createdBy: p.createdBy,
    updatedBy: p.updatedBy,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export function toPromoListDTO(p: Paged<PromoCode>): PagedDTO<PromoCodeDTO> {
  return { items: p.items.map(toPromoDTO), total: p.total, page: p.page, pageSize: p.pageSize };
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
