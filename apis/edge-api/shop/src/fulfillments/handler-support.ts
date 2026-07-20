// Shared handler support for the fulfilment slice (020): the auth gate, error mapping, and
// domain → wire-DTO mappers. Each thin handler still owns its own parse/authorize/map flow
// (ARCHITECTURE: no middleware framework).

import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import type { AuthedEvent, RequestScope } from "@effy/edge-shared";
import { forbidden, problem, ProblemType, query, subject, unavailable } from "@effy/edge-shared";
import type {
  DeliveryPromiseDTO,
  FulfillmentDetailDTO,
  FulfillmentItemDTO,
  FulfillmentQueueDTO,
  FulfillmentSummaryDTO,
} from "@effy/shared-types";

import type { Actor } from "./service";
import { isFulfillmentError } from "./types";
import type { DeliveryPromise, FulfillmentDetail, FulfillmentItem, FulfillmentSummary } from "./types";

const CONFLICT = "https://effyshopping.com/problems/conflict";

/**
 * Resolve the actor: their shop AND their staff id, in one round trip.
 *
 * Membership-only — NO role term. Both `shop_manager` and `shop_staff` have full fulfilment access
 * (FR-019a, clarification 2), so reusing 007's manager gate here would be wrong. The three terms
 * that DO apply are conjoined in one predicate: operator active, assigned to a shop, and that shop
 * active. The inner JOIN collapses "unassigned" and "inactive shop" into the same falsity, so no
 * extra branch can leak which one failed.
 *
 * `staffId` comes back because the audit trail is this feature's sole accountability control
 * (FR-019b) — without it, a transition could only be attributed to a shop, not a person.
 */
const RESOLVE_ACTOR = `
SELECT ss.id AS staff_id, st.id AS shop_id
  FROM public.shop_staff ss
  JOIN public.shop       st ON st.id = ss.shop_id
 WHERE ss.cognito_sub = $1
   AND ss.status      = 'active'
   AND st.status      = 'active'
 LIMIT 1
`;

export async function resolveActor(sub: string): Promise<{ shopId: string; staffId: string } | null> {
  const res = await query<{ staff_id: string; shop_id: string }>(RESOLVE_ACTOR, [sub]);
  const row = res.rows[0];
  return row ? { shopId: row.shop_id, staffId: row.staff_id } : null;
}

/**
 * Authenticate (401 without a verified sub) + authorize from the platform record (uniform 403 on
 * deny). Fail-closed to 503 if the check itself throws — a failed authorization is never a grant.
 */
export async function gate(
  event: AuthedEvent,
  scope: RequestScope,
): Promise<{ actor: Actor } | { deny: APIGatewayProxyStructuredResultV2 }> {
  const sub = subject(event);
  if (!sub) {
    return {
      deny: problem(
        401,
        ProblemType.Unauthenticated,
        "Authentication required",
        "a valid access token for this audience is required",
        scope,
      ),
    };
  }

  try {
    const resolved = await resolveActor(sub);
    if (!resolved) return { deny: forbidden(scope) };
    return { actor: { sub, shopId: resolved.shopId, staffId: resolved.staffId } };
  } catch (err) {
    scope.log.error(
      { err: err instanceof Error ? err.message : String(err), sub },
      "fulfillment authz check failed",
    );
    return { deny: unavailable(scope) };
  }
}

/**
 * Map a domain error to problem+json.
 *
 * ⚠ `not_found` maps to **403, not 404** — deliberately, and unlike the sibling products slice.
 * Every fulfilment read is already shop-scoped, so "no such portion" and "another shop's portion"
 * are indistinguishable by construction. Emitting a distinct 404 would hand a caller an oracle for
 * enumerating other shops' orders by id (SC-007). One code, one body, no signal.
 */
export function mapFulfillmentError(
  err: unknown,
  scope: RequestScope,
): APIGatewayProxyStructuredResultV2 {
  if (isFulfillmentError(err)) {
    switch (err.kind) {
      case "validation":
        return problem(
          400,
          ProblemType.ValidationFailed,
          "Validation failed",
          err.message,
          scope,
          err.fields,
        );
      case "not_found":
        return forbidden(scope);
      case "conflict":
        return problem(409, CONFLICT, "Conflict", err.message, scope);
    }
  }
  scope.log.error(
    { err: err instanceof Error ? err.message : String(err) },
    "fulfillment op failed",
  );
  return unavailable(scope);
}

// ── Domain → wire DTOs. Nothing here selects a shop or a payment field. ────────────────────────

function toPromiseDTO(p: DeliveryPromise): DeliveryPromiseDTO {
  return { serviceLevel: p.serviceLevel, readyBy: p.readyBy.toISOString() };
}

export function toSummaryDTO(s: FulfillmentSummary): FulfillmentSummaryDTO {
  return {
    id: s.id,
    orderNumber: s.orderNumber,
    placedAt: s.placedAt.toISOString(),
    status: s.status,
    stateChangedAt: s.stateChangedAt.toISOString(),
    itemCount: s.itemCount,
    gatheredCount: s.gatheredCount,
    unavailableCount: s.unavailableCount,
    promise: toPromiseDTO(s.promise),
    atRisk: s.atRisk,
  };
}

export function toQueueDTO(items: FulfillmentSummary[]): FulfillmentQueueDTO {
  return { items: items.map(toSummaryDTO) };
}

function toItemDTO(i: FulfillmentItem): FulfillmentItemDTO {
  return {
    orderItemId: i.orderItemId,
    name: i.name,
    sku: i.sku,
    imageUrl: i.imageUrl,
    orderedQuantity: i.orderedQuantity,
    gatheredQuantity: i.gatheredQuantity,
    unavailableQuantity: i.unavailableQuantity,
  };
}

export function toDetailDTO(d: FulfillmentDetail): FulfillmentDetailDTO {
  return {
    id: d.id,
    orderNumber: d.orderNumber,
    placedAt: d.placedAt.toISOString(),
    status: d.status,
    stateChangedAt: d.stateChangedAt.toISOString(),
    promise: toPromiseDTO(d.promise),
    delivery: { ...d.delivery },
    items: d.items.map(toItemDTO),
  };
}
