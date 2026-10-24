// Every comparison is computed here, not on the client: the comparison window (same weekday last week,
// truncated to the same time) needs the shop's zone.
import type {
  InsightsFigureDTO,
  InsightsRange,
  ShopInsightsDTO,
} from "@effy/shared-types";

import { readComputedAt, readHours, readTopProducts, signThumbnails } from "./repository";
import type { HourRow } from "./repository";
import { addLocalDays, bucketsFor, localParts, planFor } from "./window";

export const TOP_PRODUCT_LIMIT = 5;

export interface Totals {
  gross: number;
  refunds: number;
  refundedOrders: number;
  orders: number;
  units: number;
  cantSupply: number;
  cantSupplyUnits: number;
  cancelled: number;
  finishedOrders: number;
  finishedUnitsOrdered: number;
  finishedUnitsSupplied: number;
  readyOrders: number;
  readySeconds: number;
}

const ZERO: Totals = {
  gross: 0,
  refunds: 0,
  refundedOrders: 0,
  orders: 0,
  units: 0,
  cantSupply: 0,
  cantSupplyUnits: 0,
  cancelled: 0,
  finishedOrders: 0,
  finishedUnitsOrdered: 0,
  finishedUnitsSupplied: 0,
  readyOrders: 0,
  readySeconds: 0,
};

function sum(rows: readonly HourRow[]): Totals {
  return rows.reduce<Totals>(
    (t, r) => ({
      gross: t.gross + Number(r.grossGoods),
      refunds: t.refunds + Number(r.refunds),
      refundedOrders: t.refundedOrders + r.refundedOrders,
      orders: t.orders + r.orders,
      units: t.units + r.units,
      cantSupply: t.cantSupply + r.cantSupply,
      cantSupplyUnits: t.cantSupplyUnits + r.cantSupplyUnits,
      cancelled: t.cancelled + r.cancelled,
      finishedOrders: t.finishedOrders + r.finishedOrders,
      finishedUnitsOrdered: t.finishedUnitsOrdered + r.finishedUnitsOrdered,
      finishedUnitsSupplied: t.finishedUnitsSupplied + r.finishedUnitsSupplied,
      readyOrders: t.readyOrders + r.readyOrders,
      readySeconds: t.readySeconds + r.readySeconds,
    }),
    { ...ZERO },
  );
}

/** Goods sold, less refunds issued in the window. */
function revenueOf(t: Totals): number {
  return t.gross - t.refunds;
}

const money = (n: number): string => n.toFixed(2);

/** `kind: "none"` when there is nothing to compare against, rather than a division by zero or "+100%". */
function figure(current: number, previous: number, kind: "pct" | "abs", asMoney = false): InsightsFigureDTO {
  const fmt = (n: number) => (asMoney ? money(n) : String(Math.round(n)));

  if (previous === 0) {
    return { value: fmt(current), previous: fmt(previous), change: { kind: "none", amount: null } };
  }
  if (kind === "pct") {
    const pct = ((current - previous) / previous) * 100;
    return {
      value: fmt(current),
      previous: fmt(previous),
      change: { kind: "pct", amount: pct.toFixed(pct >= 10 || pct <= -10 ? 0 : 1) },
    };
  }
  return {
    value: fmt(current),
    previous: fmt(previous),
    change: { kind: "abs", amount: String(Math.round(current - previous)) },
  };
}

/** A rate in percent to one place, compared in percentage points; null when there is nothing to measure. */
function rateFigure(num: number, den: number, prevNum: number, prevDen: number): InsightsFigureDTO | null {
  if (den <= 0) return null;
  const now = Math.min(100, (num / den) * 100);
  if (prevDen <= 0) return { value: now.toFixed(1), previous: null, change: { kind: "none", amount: null } };
  const before = Math.min(100, (prevNum / prevDen) * 100);
  return { value: now.toFixed(1), previous: before.toFixed(1), change: { kind: "abs", amount: (now - before).toFixed(1) } };
}

/**
 * How well the shop fulfils (099), over the portions it finished in the window: found rate (units
 * supplied of units ordered), can't-supply rate (portions it could not supply of portions finished),
 * and the average time from payment to ready, in whole seconds. Customer cancellations never count.
 */
export function qualityOf(current: Totals, previous: Totals): ShopInsightsDTO["quality"] {
  const avg = (t: Totals) => (t.readyOrders > 0 ? t.readySeconds / t.readyOrders : 0);
  return {
    foundRate: rateFigure(current.finishedUnitsSupplied, current.finishedUnitsOrdered, previous.finishedUnitsSupplied, previous.finishedUnitsOrdered),
    cantSupplyRate: rateFigure(current.cantSupply, current.finishedOrders, previous.cantSupply, previous.finishedOrders),
    averageTimeToReady:
      current.readyOrders > 0
        ? previous.readyOrders > 0
          ? figure(avg(current), avg(previous), "pct")
          : { value: String(Math.round(avg(current))), previous: null, change: { kind: "none", amount: null } }
        : null,
  };
}

export interface Actor {
  shopId: string;
}

export class InvalidRangeError extends Error {
  readonly field = "range";
  constructor(readonly given: string) {
    super(`unknown range: ${given}`);
  }
}

const RANGES: readonly InsightsRange[] = ["today", "7d", "30d"];

export function parseRange(raw: string | undefined | null): InsightsRange {
  const value = (raw ?? "today").trim();
  if (!(RANGES as readonly string[]).includes(value)) throw new InvalidRangeError(value);
  return value as InsightsRange;
}

export async function readInsights(
  actor: Actor,
  range: InsightsRange,
  timezone: string,
  now = new Date(),
): Promise<ShopInsightsDTO> {
  const plan = planFor(range, now, timezone);

  const [currentRows, previousRows, computedAt] = await Promise.all([
    readHours(actor.shopId, plan.window.from, plan.window.to),
    readHours(actor.shopId, plan.comparison.from, plan.comparison.to),
    readComputedAt(actor.shopId),
  ]);

  const current = sum(currentRows);
  const previous = sum(previousRows);

  const localDate = (d: Date) => {
    const p = localParts(d, timezone);
    return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  };
  const topRows = await readTopProducts(
    actor.shopId,
    localDate(plan.window.from),
    // The window's last day, inclusive.
    localDate(addLocalDays(plan.window.to, timezone, 0)),
    TOP_PRODUCT_LIMIT,
  );
  const thumbnails = await signThumbnails(topRows);
  const topRevenue = topRows.length > 0 ? Number(topRows[0]!.revenue) : 0;

  // Every bucket, empty ones included: a missing bar and a zero bar say different things.
  const buckets = bucketsFor(plan, timezone);
  const series = buckets.map((b) => {
    const inBucket = currentRows.filter(
      (r) => r.bucketStart >= b.start && r.bucketStart < b.end,
    );
    const t = sum(inBucket);
    return {
      start: b.start.toISOString(),
      label: b.label,
      partial: b.partial,
      revenue: money(revenueOf(t)),
      orders: t.orders,
    };
  });

  const aov = current.orders > 0 ? current.gross / current.orders : 0;
  const previousAov = previous.orders > 0 ? previous.gross / previous.orders : 0;

  const lastHourRow = currentRows.at(-1);
  const days = range === "today" ? 1 : range === "7d" ? 7 : 30;

  return {
    range,
    timezone,
    window: { from: plan.window.from.toISOString(), to: plan.window.to.toISOString() },
    comparison: {
      basis: plan.basis,
      from: plan.comparison.from.toISOString(),
      to: plan.comparison.to.toISOString(),
    },
    computedAt: computedAt?.toISOString() ?? null,
    currency: "AUD",
    primary: {
      revenue: figure(revenueOf(current), revenueOf(previous), "pct", true),
      orders: {
        ...figure(current.orders, previous.orders, "abs"),
        perDay: range === "today" ? null : (current.orders / days).toFixed(0),
        lastHour: range === "today" ? (lastHourRow?.orders ?? 0) : null,
      },
      averageOrderValue: figure(aov, previousAov, "pct", true),
    },
    secondary: {
      refunds: {
        ...figure(current.refunds, previous.refunds, "pct", true),
        orders: current.refundedOrders,
      },
      cantSupply: {
        ...figure(current.cantSupply, previous.cantSupply, "abs"),
        units: current.cantSupplyUnits,
      },
      cancelled: figure(current.cancelled, previous.cancelled, "abs"),
    },
    series: {
      grain: plan.grain,
      buckets: series,
      revenueTotal: figure(revenueOf(current), revenueOf(previous), "pct", true),
      ordersTotal: figure(current.orders, previous.orders, "abs"),
    },
    quality: qualityOf(current, previous),
    topProducts: topRows.map((r, i) => ({
      productId: r.productId,
      name: r.name,
      sku: r.sku,
      thumbnailUrl: thumbnails[i] ?? null,
      units: r.units,
      revenue: r.revenue,
      // A bar width relative to the top row.
      share: topRevenue > 0 ? Number(r.revenue) / topRevenue : 0,
    })),
  };
}

