// Domain → wire mapping for Today and its conditional GET. The gate and error mapping are the fulfilment slice's.
import { createHash } from "node:crypto";

import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import type { AuthedEvent, RequestScope } from "@effy/edge-shared";
import { instantAtLocalTime, localDateParts } from "@effy/edge-shared";
import { PACKAGE_STATUSES, type PackageStatus, type ShopTodayAheadDTO, type ShopTodayDTO, type ShopTodayEventDTO } from "@effy/shared-types";

import { OUT_OF_STOCK_LIMIT } from "./service";
import type { TodaySnapshot } from "./types";

export { gate, mapFulfillmentError as mapTodayError } from "../fulfillments/handler-support";

/** "HH:MM" on the shop's clock, today, as an instant. */
function todayAt(hhmm: string | null, now: Date): string | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  const { year, month, day } = localDateParts(now);
  return instantAtLocalTime(year, month, day, h, m).toISOString();
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

const noPackages = (): Record<PackageStatus, number> => Object.fromEntries(PACKAGE_STATUSES.map((k) => [k, 0])) as Record<PackageStatus, number>;

export function toTodayDTO(s: TodaySnapshot): ShopTodayDTO {
  const out = s.stock.filter((x) => x.severity === "out").sort((a, b) => b.soldLast7Days - a.soldLast7Days || a.name.localeCompare(b.name));
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
    runs: s.runs.map((r) => ({
      runAt: r.runAt.toISOString(),
      driver: r.driver,
      collectedAt: iso(r.collectedAt),
      firstPaidAt: iso(r.firstPaidAt),
      collected: r.collected,
      ready: r.ready,
      picking: r.picking,
      waiting: r.waiting,
      missed: r.missed,
    })),
    courierPickups: s.pickups.map((p) => ({ from: todayAt(p.from, s.now), to: todayAt(p.to, s.now), courierName: p.courierName, parcels: p.parcels, handedOver: p.handedOver })),
    packages: s.packages ?? { effy_driver: noPackages(), courier: noPackages() },
    picking: s.picking.map((p) => ({ ...p, startedAt: p.startedAt.toISOString(), runAt: iso(p.runAt) })),
    late: s.late.map((l) => ({ ...l, missedRunAt: l.missedRunAt.toISOString(), nextRunAt: iso(l.nextRunAt) })),
    outOfStock: out.slice(0, OUT_OF_STOCK_LIMIT).map((x) => ({
      productId: x.productId,
      variantId: x.variantId,
      name: x.name,
      soldLast7Days: x.soldLast7Days,
      since: x.since.toISOString(),
    })),
    outOfStockMore: Math.max(0, s.backlog.lowStock.outOfStock - Math.min(out.length, OUT_OF_STOCK_LIMIT)),
    refunds: s.proposals.map((p) => ({ fulfillmentId: p.fulfillmentId, orderNumber: p.orderNumber, amount: p.amount, since: p.since.toISOString() })),
    selling: s.selling,
    catalog: s.catalog,
    nextCollection: s.nextCollection,
    events: s.events.map((e) => ({ ...e, at: e.at.toISOString() }) as ShopTodayEventDTO),
    ahead: s.ahead.map((a) => ({ ...a, at: a.at.toISOString() }) as ShopTodayAheadDTO),
    yesterday: s.yesterday,
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
