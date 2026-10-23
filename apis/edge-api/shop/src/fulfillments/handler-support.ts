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

/** `https://effyshopping.com/problems/<code>`. */
export const problemType = (code: string): string => `https://effyshopping.com/problems/${code}`;

/**
 * The actor's shop and staff id in one round trip. Membership only: both shop roles have full
 * fulfilment access. Operator active, assigned, shop active are one predicate, so a refusal never
 * says which term failed. `staffId` attributes every transition to a person.
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

/** Without a verified sub, uniform 403 on deny, 503 if the check itself throws. */
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

/** `not_found` maps to 403, not 404: every read is shop-scoped, so another shop's portion must look the same as none. */
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
        return problem(409, err.code ? problemType(err.code) : CONFLICT, "Conflict", err.message, scope);
      case "unprocessable":
        return problem(422, err.code ? problemType(err.code) : CONFLICT, "Cannot be done", err.message, scope, err.fields);
    }
  }
  scope.log.error(
    { err: err instanceof Error ? err.message : String(err) },
    "fulfillment op failed",
  );
  return unavailable(scope);
}

// Domain → wire DTOs. Nothing here selects a shop or a payment field.

function toPromiseDTO(p: DeliveryPromise): DeliveryPromiseDTO {
  return {
    readyBy: p.readyBy.toISOString(),
    deliveredBy: p.deliveredBy,
    ...(p.courierPickup ? { courierPickup: p.courierPickup } : {}),
  };
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
    variantLabel: i.variantLabel,
    variantCode: i.variantCode,
    sku: i.sku,
    gtin: i.gtin,
    imageUrl: i.imageUrl,
    orderedQuantity: i.orderedQuantity,
    gatheredQuantity: i.gatheredQuantity,
    unavailableQuantity: i.unavailableQuantity,
  };
}

export function toDetailDTO(d: FulfillmentDetail): FulfillmentDetailDTO {
  return {
    id: d.id,
    orderId: d.orderId,
    orderNumber: d.orderNumber,
    placedAt: d.placedAt.toISOString(),
    status: d.status,
    stateChangedAt: d.stateChangedAt.toISOString(),
    promise: toPromiseDTO(d.promise),
    delivery: { ...d.delivery },
    items: d.items.map(toItemDTO),
  };
}
