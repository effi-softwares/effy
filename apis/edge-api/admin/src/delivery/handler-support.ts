// Shared handler support for the delivery slice: the back-office auth guard, DeliveryError →
// problem+json mapping, and domain → wire-DTO mappers. Keeps the thin handlers free of repetition
// while each still owns its own parse/authorize/map flow (ARCHITECTURE: no middleware framework).
// Mirrors 009 shops/handler-support.ts.
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import type { AuthedEvent, RequestScope } from "@effy/edge-shared";
import { forbidden, problem, ProblemType, subject, unavailable } from "@effy/edge-shared";
import type {
  AuditEntryDTO,
  DeliveryOfferingDTO,
  DeliveryPriceBandDTO,
  DeliveryPricingRuleDTO,
  DeliveryZoneDTO,
  DeliveryZonePostcodeDTO,
  PagedDTO,
  ShopLocationDTO,
} from "@effy/shared-types";

import { canManageDelivery, isActiveStaff } from "./authz";
import { isDeliveryError } from "./types";
import type {
  AuditEntry,
  DeliveryZone,
  Offering,
  Paged,
  PriceBand,
  PricingRule,
  ShopLocation,
  ZonePostcode,
} from "./types";

const CONFLICT = "https://effyshopping.com/problems/conflict";
const NOT_FOUND = "https://effyshopping.com/problems/not-found";

/** Authenticate (401 if no sub) + authorize from the platform record (403), fail-closed to 503 on
 *  an infra error. `read` = any active staff; `mutate` = admin/manager (US4/FR-013). */
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
    const ok = level === "read" ? await isActiveStaff(sub) : await canManageDelivery(sub);
    if (!ok) return { deny: forbidden(scope) };
  } catch (err) {
    scope.log.error(
      { err: err instanceof Error ? err.message : String(err), sub },
      "delivery authz check failed",
    );
    return { deny: unavailable(scope) };
  }
  return { sub };
}

/** Map a domain error to problem+json. Unknown errors become 503 with the cause logged only. */
export function mapDeliveryError(err: unknown, scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  if (isDeliveryError(err)) {
    switch (err.kind) {
      case "validation":
        return problem(400, ProblemType.ValidationFailed, "Validation failed", err.message, scope, err.fields);
      // ⚠ 422, not 400 (032). The body parsed and every field is the right type — what is refused is
      // a CONFIGURATION that would quietly do the wrong thing. The `code` is what makes each refusal
      // distinguishable: "invalid" tells an operator nothing about which of five rules they broke.
      case "unprocessable":
        return problem(
          422,
          ProblemType.ValidationFailed,
          "Cannot apply this configuration",
          err.message,
          scope,
          err.code ? [{ field: err.code, message: err.message }] : err.fields,
        );
      case "not_found":
        return problem(404, NOT_FOUND, "Not found", err.message, scope);
      case "conflict":
        return problem(409, CONFLICT, "Conflict", err.message, scope);
    }
  }
  scope.log.error({ err: err instanceof Error ? err.message : String(err) }, "delivery op failed");
  return unavailable(scope);
}

// ── domain → wire DTO (never leak domain shapes past the handler) ──────────────────────────────

export function toZoneDTO(z: DeliveryZone): DeliveryZoneDTO {
  return {
    id: z.id,
    code: z.code,
    name: z.name,
    status: z.status,
    postcodeCount: z.postcodeCount,
    createdAt: z.createdAt,
    updatedAt: z.updatedAt,
  };
}

export function toZoneListDTO(p: Paged<DeliveryZone>): PagedDTO<DeliveryZoneDTO> {
  return { items: p.items.map(toZoneDTO), total: p.total, page: p.page, pageSize: p.pageSize };
}

export function toPostcodeDTO(pc: ZonePostcode): DeliveryZonePostcodeDTO {
  return { id: pc.id, postcode: pc.postcode };
}

export function toPostcodeListDTO(p: Paged<ZonePostcode>): PagedDTO<DeliveryZonePostcodeDTO> {
  return { items: p.items.map(toPostcodeDTO), total: p.total, page: p.page, pageSize: p.pageSize };
}

export function toOfferingDTO(o: Offering): DeliveryOfferingDTO {
  return {
    id: o.id,
    originZoneId: o.originZoneId,
    originZoneName: o.originZoneName,
    destinationZoneId: o.destinationZoneId,
    destinationZoneName: o.destinationZoneName,
    method: o.method,
    priceAmount: o.priceAmount,
    leadDaysMin: o.leadDaysMin,
    leadDaysMax: o.leadDaysMax,
    sameDayCutoff: o.sameDayCutoff,
    status: o.status,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

export function toOfferingListDTO(p: Paged<Offering>): PagedDTO<DeliveryOfferingDTO> {
  return { items: p.items.map(toOfferingDTO), total: p.total, page: p.page, pageSize: p.pageSize };
}

export function toShopLocationDTO(l: ShopLocation): ShopLocationDTO {
  return { shopId: l.shopId, shopCode: l.shopCode, shopName: l.shopName, postcode: l.postcode };
}

export function toAuditDTO(p: Paged<AuditEntry>): PagedDTO<AuditEntryDTO> {
  return {
    items: p.items.map((a) => ({
      id: a.id,
      actorSub: a.actorSub,
      action: a.action,
      targetType: a.targetType,
      targetId: a.targetId,
      detail: a.detail,
      createdAt: a.createdAt,
    })),
    total: p.total,
    page: p.page,
    pageSize: p.pageSize,
  };
}

// ── 032-delivery-pricing ───────────────────────────────────────────────────────────────────────

export function toPricingRuleDTO(r: PricingRule): DeliveryPricingRuleDTO {
  return {
    method: r.method,
    baseAmount: r.baseAmount,
    roundingStep: r.roundingStep,
    maxAmount: r.maxAmount,
    status: r.status,
    distanceBands: r.distanceBands.map(toBandDTO),
    weightBands: r.weightBands.map(toBandDTO),
    updatedBy: r.updatedBy,
    updatedAt: r.updatedAt,
  };
}

function toBandDTO(b: PriceBand): DeliveryPriceBandDTO {
  return { upperBound: b.upperBound, addAmount: b.addAmount };
}

export function toPricingRuleListDTO(rules: PricingRule[]): { rules: DeliveryPricingRuleDTO[] } {
  // ⚠ Wrapped in an object rather than returned as a bare array: there are exactly three rules, so
  // this is not paged, but a top-level JSON array is the shape that cannot gain a field later.
  return { rules: rules.map(toPricingRuleDTO) };
}
