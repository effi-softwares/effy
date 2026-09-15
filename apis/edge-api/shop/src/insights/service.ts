// Insights' service: turn rollup rows into the figures the screen renders (058, US3).
//
// ⚠ EVERY COMPARISON IS COMPUTED HERE, NOT ON THE CLIENT (FR-024). Two surfaces doing their own
// arithmetic on the same pair of numbers is how two screens come to disagree about one figure; and
// the client cannot do it correctly anyway, because the comparison window is a calendar question
// (the same weekday last week, truncated to the same time of day) that needs the shop's zone.
import type {
  InsightsFigureDTO,
  InsightsRange,
  ShopInsightsDTO,
} from "@effy/shared-types";

import { readComputedAt, readHours, readTopProducts, signThumbnails } from "./repository";
import type { HourRow } from "./repository";
import { addLocalDays, bucketsFor, localParts, planFor, windowLabel } from "./window";

export const TOP_PRODUCT_LIMIT = 5;

/** Money in, money out, and everything counted — the totals a window reduces to. */
interface Totals {
  gross: number;
  refunds: number;
  refundedOrders: number;
  orders: number;
  units: number;
  cantSupply: number;
  cantSupplyUnits: number;
  cancelled: number;
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
    }),
    { ...ZERO },
  );
}

/** Revenue = goods sold, less refunds ISSUED in the window (FR-032, research R4). */
function revenueOf(t: Totals): number {
  return t.gross - t.refunds;
}

const money = (n: number): string => n.toFixed(2);

/**
 * A figure and its comparison.
 *
 * ⚠ `kind: "none"` IS A REAL ANSWER. When the previous window has nothing to compare against — a new
 * shop, a quiet week — a percentage is either a division by zero or the meaningless "+100%". Saying
 * "nothing to compare yet" is the honest reading, and the UI renders it as such rather than as a
 * triumphant increase.
 */
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
    // The window's last day, inclusive — `to` is "now", which is inside today.
    localDate(addLocalDays(plan.window.to, timezone, 0)),
    TOP_PRODUCT_LIMIT,
  );
  const thumbnails = await signThumbnails(topRows);
  const topRevenue = topRows.length > 0 ? Number(topRows[0]!.revenue) : 0;

  // The chart series: every bucket the window contains, including the empty ones — a missing bar and
  // a zero bar say different things, and a chart that silently omits quiet hours misreports the shape
  // of a day.
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

  // "6 in the last hour" on today; "23 per day on average" on the longer ranges.
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
    topProducts: topRows.map((r, i) => ({
      productId: r.productId,
      name: r.name,
      sku: r.sku,
      thumbnailUrl: thumbnails[i] ?? null,
      units: r.units,
      revenue: r.revenue,
      // A bar width relative to the top row, not a figure to read off the screen.
      share: topRevenue > 0 ? Number(r.revenue) / topRevenue : 0,
    })),
  };
}

/** The window label the subtitle states ("26 August – 1 September"). */
export function labelFor(range: InsightsRange, now: Date, timezone: string): string {
  return windowLabel(planFor(range, now, timezone), timezone);
}
