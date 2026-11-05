// Every comparison is computed here, not on the client: the comparison window (same weekday last week,
// truncated to the same time) needs the shop's zone.
import type {
  InsightsFigureDTO,
  InsightsRange,
  ShopInsightsDTO,
} from "@effy/shared-types";

import { buildBriefing } from "./briefing";
import {
  readAisles,
  readCantSupplyProducts,
  readComputedAt,
  readHours,
  readPairs,
  readPickers,
  readProductRanks,
  readProductSales,
  readReadyByHour,
  readRhythm,
  readRuns,
  readTopProducts,
  readWeekdaySales,
  signThumbnails,
} from "./repository";
import type { HourRow } from "./repository";
import { DEMAND_DAYS, NOT_SELLING_DAYS, readStock } from "./stock";
import { addLocalDays, bucketsFor, localParts, planFor, startOfLocalDay } from "./window";

export const TOP_PRODUCT_LIMIT = 10;
export const PAIR_LIMIT = 5;
/** Weeks the weekday averages cover. */
export const WEEKDAY_WEEKS = 4;
/** A pace needs this much of a usual day behind it before it says anything. */
export const PACE_MIN_SHARE = 0.15;
export const CANT_SUPPLY_LIMIT = 5;
/** A week's rhythm needs more than one week behind it. */
export const RHYTHM_MIN_WEEKS = 2;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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
export function qualityOf(
  current: Totals,
  previous: Totals,
  readySpread: number[] = [0, 0, 0, 0, 0, 0],
  runs: { due: number; ready: number; previousDue: number; previousReady: number } = { due: 0, ready: 0, previousDue: 0, previousReady: 0 },
): ShopInsightsDTO["quality"] {
  const avg = (t: Totals) => (t.readyOrders > 0 ? t.readySeconds / t.readyOrders : 0);
  return {
    readySpread,
    readyBeforeDriver: rateFigure(runs.ready, runs.due, runs.previousReady, runs.previousDue),
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
  /** Managers see who picked; staff do not. */
  manager?: boolean;
}

/** How many of the products that sold make 80% of the sales: most first, counted until the share is reached. */
export function concentrationOf(sales: readonly number[]): { products: number; top80: number } {
  const sorted = [...sales].sort((a, b) => b - a);
  const total = sorted.reduce((n, x) => n + x, 0);
  if (total <= 0) return { products: 0, top80: 0 };
  let sum = 0;
  let top80 = 0;
  for (const x of sorted) {
    sum += x;
    top80 += 1;
    if (sum >= total * 0.8) break;
  }
  return { products: sorted.length, top80 };
}

/**
 * Where today ends if the rest goes as this weekday usually does: the orders so far over the usual share of a day sold
 * by now (the current hour counted by its minutes). Null with too little of a usual day behind it.
 */
export function paceOf(
  cells: readonly { weekday: number; hour: number; orders: number }[],
  isoWeekday: number,
  hour: number,
  minute: number,
  sold: { orders: number; revenue: number },
): { orders: number; revenue: string } | null {
  const day = cells.filter((c) => c.weekday === isoWeekday);
  const usualDay = day.reduce((n, c) => n + c.orders, 0);
  if (usualDay <= 0 || sold.orders <= 0) return null;
  const soFar = day.reduce((n, c) => n + (c.hour < hour ? c.orders : c.hour === hour ? (c.orders * minute) / 60 : 0), 0);
  const share = soFar / usualDay;
  if (share < PACE_MIN_SHARE) return null;
  if (share >= 1) return { orders: sold.orders, revenue: sold.revenue.toFixed(2) };
  return { orders: Math.round(sold.orders / share), revenue: (Math.round(sold.revenue / share / 10) * 10).toFixed(2) };
}

export class InvalidRangeError extends Error {
  readonly field = "range";
  constructor(readonly given: string) {
    super(`unknown range: ${given}`);
  }
}

/** Added up bucket by bucket: an hour's spread is its six counts. */
function spreadOf(rows: readonly HourRow[]): number[] {
  return rows.reduce((total, r) => total.map((n, i) => n + (r.readySpread[i] ?? 0)), [0, 0, 0, 0, 0, 0]);
}

/** A bucket's service figures; null where nothing finished in it. */
function bucketQuality(t: Totals) {
  return {
    foundRate: t.finishedUnitsOrdered > 0 ? Math.min(100, (t.finishedUnitsSupplied / t.finishedUnitsOrdered) * 100).toFixed(1) : null,
    cantSupplyRate: t.finishedOrders > 0 ? Math.min(100, (t.cantSupply / t.finishedOrders) * 100).toFixed(1) : null,
    averageTimeToReady: t.readyOrders > 0 ? Math.round(t.readySeconds / t.readyOrders) : null,
  };
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

  const today = startOfLocalDay(now, timezone);
  const [currentRows, previousRows, computedAt, rhythm, weekdaySales, readyByHour, runs, previousRuns] = await Promise.all([
    readHours(actor.shopId, plan.window.from, plan.window.to),
    readHours(actor.shopId, plan.comparison.from, plan.comparison.to),
    readComputedAt(actor.shopId),
    readRhythm(actor.shopId, timezone),
    // The last four whole weeks, today left out: a day still running would pull its weekday down.
    readWeekdaySales(actor.shopId, timezone, addLocalDays(today, timezone, -7 * WEEKDAY_WEEKS), today),
    readReadyByHour(actor.shopId, timezone, plan.window.from, plan.window.to),
    readRuns(actor.shopId, timezone, plan.window.from, plan.window.to),
    readRuns(actor.shopId, timezone, plan.comparison.from, plan.comparison.to),
  ]);

  const current = sum(currentRows);
  const previous = sum(previousRows);

  const localDate = (d: Date) => {
    const p = localParts(d, timezone);
    return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  };
  const from = localDate(plan.window.from);
  // The window's last day, inclusive.
  const to = localDate(addLocalDays(plan.window.to, timezone, 0));
  const previousFrom = localDate(plan.comparison.from);
  const previousTo = localDate(range === "today" ? plan.comparison.from : addLocalDays(plan.comparison.to, timezone, -1));
  const [topRows, ranks, cantSupplyProducts, aisles, previousAisles, productSales, together, pickers, stock] = await Promise.all([
    readTopProducts(actor.shopId, from, to, TOP_PRODUCT_LIMIT),
    // A comparison window's end is exclusive, except today's, whose day is still the one to compare with.
    readProductRanks(
      actor.shopId,
      localDate(plan.comparison.from),
      localDate(range === "today" ? plan.comparison.from : addLocalDays(plan.comparison.to, timezone, -1)),
    ),
    readCantSupplyProducts(actor.shopId, from, to, CANT_SUPPLY_LIMIT),
    readAisles(actor.shopId, from, to),
    readAisles(actor.shopId, previousFrom, previousTo),
    readProductSales(actor.shopId, from, to),
    readPairs(actor.shopId, from, to, PAIR_LIMIT),
    actor.manager ? readPickers(actor.shopId, from, to) : Promise.resolve(null),
    // The shelves are read live; a failure there costs the stock figures, never the page.
    readStock(actor.shopId, {
      from: plan.window.from,
      to: plan.window.to,
      fromDate: from,
      toDate: to,
      demandFrom: localDate(addLocalDays(today, timezone, -DEMAND_DAYS)),
      demandTo: localDate(addLocalDays(today, timezone, -1)),
      notSellingSince: localDate(addLocalDays(today, timezone, -NOT_SELLING_DAYS)),
    }).catch(() => null),
  ]);
  const thumbnails = await signThumbnails(topRows);
  const topRevenue = topRows.length > 0 ? Number(topRows[0]!.revenue) : 0;

  // Every bucket, empty ones included: a missing bar and a zero bar say different things.
  const buckets = bucketsFor(plan, timezone);
  // Point for point: the comparison's own buckets, so a day that skips an hour for daylight saving still lines up.
  const comparisonBuckets = bucketsFor({ ...plan, window: plan.comparison }, timezone);
  const series = buckets.map((b, i) => {
    const inBucket = currentRows.filter(
      (r) => r.bucketStart >= b.start && r.bucketStart < b.end,
    );
    const t = sum(inBucket);
    const before = comparisonBuckets[i];
    const was = before ? sum(previousRows.filter((r) => r.bucketStart >= before.start && r.bucketStart < before.end)) : null;
    return {
      start: b.start.toISOString(),
      label: b.label,
      partial: b.partial,
      revenue: money(revenueOf(t)),
      orders: t.orders,
      units: t.units,
      previousRevenue: was ? money(revenueOf(was)) : null,
      previousOrders: was ? was.orders : null,
      previousUnits: was ? was.units : null,
      ...bucketQuality(t),
    };
  });

  const aov = current.orders > 0 ? current.gross / current.orders : 0;
  const previousAov = previous.orders > 0 ? previous.gross / previous.orders : 0;

  const lastHourRow = currentRows.at(-1);
  const days = range === "today" ? 1 : range === "7d" ? 7 : 30;

  const runTotals = {
    due: runs.reduce((n, r) => n + r.due, 0),
    ready: runs.reduce((n, r) => n + r.ready, 0),
    previousDue: previousRuns.reduce((n, r) => n + r.due, 0),
    previousReady: previousRuns.reduce((n, r) => n + r.ready, 0),
  };
  const quality = qualityOf(current, previous, spreadOf(currentRows), runTotals);
  const totalGross = productSales.reduce((n, x) => n + x, 0);
  const ipo = (t: Totals) => (t.orders > 0 ? t.units / t.orders : 0);
  const itemsPerOrder: InsightsFigureDTO =
    current.orders === 0
      ? { value: "0.0", previous: null, change: { kind: "none", amount: null } }
      : previous.orders === 0
        ? { value: ipo(current).toFixed(1), previous: null, change: { kind: "none", amount: null } }
        : {
            value: ipo(current).toFixed(1),
            previous: ipo(previous).toFixed(1),
            change: { kind: "pct", amount: (((ipo(current) - ipo(previous)) / ipo(previous)) * 100).toFixed(1) },
          };
  const local = localParts(now, timezone);
  const rhythmOk = rhythm.weeks >= RHYTHM_MIN_WEEKS;
  const pace =
    range === "today" && rhythmOk
      ? paceOf(rhythm.cells, local.weekday === 0 ? 7 : local.weekday, local.hour, local.minute, {
          orders: current.orders,
          revenue: revenueOf(current),
        })
      : null;
  const previousAisle = new Map(previousAisles.map((a) => [a.categoryId, a.revenue]));
  const sizes = currentRows.reduce((total, r) => total.map((n, i) => n + (r.sizeSpread[i] ?? 0)), [0, 0, 0, 0, 0]);
  const worstRun = runs
    .filter((r) => r.due > r.ready)
    .sort((a, b) => b.due - b.ready - (a.due - a.ready))[0];
  const revenue = figure(revenueOf(current), revenueOf(previous), "pct", true);
  const topProducts = topRows.map((r, i) => ({
    productId: r.productId,
    name: r.name,
    sku: r.sku,
    thumbnailUrl: thumbnails[i] ?? null,
    units: r.units,
    revenue: r.revenue,
    // A bar width relative to the top row.
    share: topRevenue > 0 ? Number(r.revenue) / topRevenue : 0,
    shareOfSales: totalGross > 0 ? ((Number(r.revenue) / totalGross) * 100).toFixed(1) : "0.0",
    previousRank: ranks.get(r.productId) ?? null,
    stockLeft: r.stockLeft,
  }));

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
      revenue,
      orders: {
        ...figure(current.orders, previous.orders, "abs"),
        perDay: range === "today" ? null : (current.orders / days).toFixed(0),
        lastHour: range === "today" ? (lastHourRow?.orders ?? 0) : null,
      },
      averageOrderValue: figure(aov, previousAov, "pct", true),
      itemsPerOrder,
    },
    pace,
    weekdays: rhythmOk
      ? [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, revenue: money((weekdaySales.get(weekday) ?? 0) / WEEKDAY_WEEKS) }))
      : null,
    readyByHour,
    aisles: aisles.map((a) => ({ ...a, previous: previousAisle.get(a.categoryId) ?? (previous.orders > 0 ? "0.00" : null) })),
    orderSizes: sizes,
    customers: {
      effyDriver: currentRows.reduce((n, r) => n + r.effyOrders, 0),
      courier: currentRows.reduce((n, r) => n + r.courierOrders, 0),
      returning: currentRows.reduce((n, r) => n + r.returningOrders, 0),
    },
    concentration: concentrationOf(productSales),
    together,
    runs,
    pickers:
      pickers?.map((p) => ({
        staffId: p.staffId,
        name: p.name,
        orders: p.orders,
        averageTimeToReady: p.readyOrders > 0 ? Math.round(p.readySeconds / p.readyOrders) : null,
        cantSupplyUnits: p.cantUnits,
      })) ?? null,
    stock,
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
    quality,
    topProducts,
    cantSupplyProducts,
    rhythm: rhythmOk ? rhythm : null,
    briefing: buildBriefing({
      soldOut: stock?.soldOut.find((s) => s.times > 0) ?? null,
      worstRun: worstRun ?? null,
      range,
      weekday: WEEKDAYS[localParts(now, timezone).weekday]!,
      currency: "AUD",
      revenue,
      buckets: series,
      quality,
      topProducts,
      cantSupplyProducts,
    }),
  };
}

