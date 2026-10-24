// Domain → wire mapping for Today and its conditional GET. The gate and error mapping are the fulfilment slice's.
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
        variantId: i.variantId,
        name: i.name,
        soldLast7Days: i.soldLast7Days,
        since: i.since.toISOString(),
      };
    case "low_stock":
      return {
        kind: i.kind,
        productId: i.productId,
        variantId: i.variantId,
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
    deliveredBy: o.deliveredBy,
    ...(o.courierPickup ? { courierPickup: o.courierPickup } : {}),
    total: o.total,
    currency: o.currency,
    ...(o.collection ? { collection: o.collection } : {}),
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
    nextCollection: s.nextCollection,
    live: s.live.map(toLiveDTO),
  };
}

/** A weak ETag over the payload excluding `now`, which changes on every read. Saves bandwidth, not a database read. */
export function etagFor(dto: ShopTodayDTO): string {
  const { now: _now, ...rest } = dto;
  return `W/"${createHash("sha256").update(JSON.stringify(rest)).digest("base64url").slice(0, 27)}"`;
}

/** Case-insensitive: API Gateway v2 lower-cases, tests and proxies may not. */
export function ifNoneMatch(event: AuthedEvent): string | null {
  const headers = event.headers ?? {};
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === "if-none-match" && typeof v === "string") return v;
  }
  return null;
}

/** 200, or 304 when unchanged. `private, no-cache`: one shop's state, always revalidated. */
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
