// Domain → wire mapping for Today, plus the conditional-GET plumbing the screens poll through (058).
//
// The gate and the error mapping are the fulfilment slice's, reused as-is: same audience, same
// membership rule (both roles), same uniform 403 for "not yours" and "no such thing".
import { createHash } from "node:crypto";

import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import type { AuthedEvent, RequestScope } from "@effy/edge-shared";
import type {
  ShopAttentionItemDTO,
  ShopLiveOrderDTO,
  ShopTodayDTO,
} from "@effy/shared-types";

import type { AttentionView, LiveOrder, TodaySnapshot } from "./types";

export { gate, mapFulfillmentError as mapTodayError } from "../fulfillments/handler-support";

function toAttentionDTO(i: AttentionView["items"][number]): ShopAttentionItemDTO {
  switch (i.kind) {
    case "awaiting_pick":
      return { kind: i.kind, orders: i.orders, units: i.units, since: i.since.toISOString() };
    case "out_of_stock":
      return {
        kind: i.kind,
        productId: i.productId,
        name: i.name,
        soldLast7Days: i.soldLast7Days,
        since: i.since.toISOString(),
      };
    case "low_stock":
      return {
        kind: i.kind,
        productId: i.productId,
        name: i.name,
        onHand: i.onHand,
        daysOfCover: i.daysOfCover,
        since: i.since.toISOString(),
      };
    case "refund_proposed":
      return {
        kind: i.kind,
        fulfillmentId: i.fulfillmentId,
        orderNumber: i.orderNumber,
        amount: i.amount,
        since: i.since.toISOString(),
      };
  }
}

function toLiveDTO(o: LiveOrder): ShopLiveOrderDTO {
  return {
    fulfillmentId: o.fulfillmentId,
    orderNumber: o.orderNumber,
    customerName: o.customerName,
    paidAt: o.paidAt.toISOString(),
    itemCount: o.itemCount,
    deliveryMethod: o.deliveryMethod,
    total: o.total,
    currency: o.currency,
  };
}

export function toTodayDTO(s: TodaySnapshot, attention: AttentionView): ShopTodayDTO {
  return {
    now: s.now.toISOString(),
    timezone: s.timezone,
    backlog: {
      awaitingPick: {
        orders: s.backlog.awaitingPick.orders,
        units: s.backlog.awaitingPick.units,
        oldestPaidAt: s.backlog.awaitingPick.oldestPaidAt?.toISOString() ?? null,
      },
      readyForPickup: s.backlog.readyForPickup,
      lowStock: { ...s.backlog.lowStock },
    },
    attention: attention.items.map(toAttentionDTO),
    attentionMore: attention.more,
    oldestWaitingAt: attention.oldestWaitingAt?.toISOString() ?? null,
    live: s.live.map(toLiveDTO),
  };
}

/**
 * A weak ETag over the payload, with `now` excluded.
 *
 * ⚠ EXCLUDING THE CLOCK IS THE WHOLE POINT. Today is polled every 30 seconds when the live stream is
 * unavailable, and `now` changes on every single read — an ETag computed over it would never match,
 * so the 304 would never fire and the conditional GET would be decoration. What the operator needs
 * to know is whether the WORK changed.
 *
 * ⚠ It saves bandwidth, not a database read: the snapshot must be computed to know whether it moved.
 * Said plainly here so nobody later reports the polling cost as a bug in this function.
 */
export function etagFor(dto: ShopTodayDTO): string {
  const { now: _now, ...rest } = dto;
  return `W/"${createHash("sha256").update(JSON.stringify(rest)).digest("base64url").slice(0, 27)}"`;
}

/** Case-insensitive header read — API Gateway v2 lower-cases, tests and proxies may not. */
export function ifNoneMatch(event: AuthedEvent): string | null {
  const headers = event.headers ?? {};
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === "if-none-match" && typeof v === "string") return v;
  }
  return null;
}

/**
 * 200 with the body, or 304 when the caller already has this exact work state.
 *
 * `private, no-cache` — private because this is one shop's operational state and must never sit in
 * a shared cache; no-cache because the client MUST revalidate rather than serve a stale backlog from
 * memory. Freshness is the entire value of this screen.
 */
export function todayResponse(
  dto: ShopTodayDTO,
  event: AuthedEvent,
  scope: RequestScope,
): APIGatewayProxyStructuredResultV2 {
  const etag = etagFor(dto);
  const headers = {
    "content-type": "application/json",
    "cache-control": "private, no-cache",
    etag,
    "x-request-id": scope.requestId,
  };
  if (ifNoneMatch(event) === etag) {
    return { statusCode: 304, headers };
  }
  return { statusCode: 200, headers, body: JSON.stringify(dto) };
}
