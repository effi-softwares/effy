import type { Queryable } from "../lib/db";
import {
  courierFee, effyFee, feeLines, UnpricedDistanceError, UnpricedWeightError, type FeeBreakdown, type FeeLine,
} from "./engine";
import { courierValues, effyValues, loadActivePlan, NoActivePlanError, windowPremiumCents, type Plan } from "./plan";
import { collectionSchedule, melbourneDate } from "./schedule";
import { loadSlots, loadSlotSettings, nonDeliveryDates, ownLiveHoldsByDate, slotLoadByDate } from "./slots";
import { effyDays, openWindows, windowKey, windowsUnavailable, type EffyDay } from "./windows";
import { courierReachesPostcode, coverageForPostcode, loadCourierSettings } from "./coverage";

/** A listed postcode the active plan cannot price. Activation prevents it; if it happens the quote fails loud (never free) and the caller alarms. */
export class ListedPostcodeUnpricedError extends Error {
  constructor(planId: string, postcode: string, why: string) {
    super(`delivery: listed postcode ${postcode} could not be priced by plan ${planId} (${why})`);
    this.name = "ListedPostcodeUnpricedError";
  }
}

/**
 * An invariant, not a refusal: coverage said "courier" but no courier fee table or estimate exists
 * (only possible by a manual change or a race). The customer is told it cannot be delivered; the log
 * and alarm say why that is wrong.
 */
export class CourierNotPurchasableError extends Error {
  constructor(postcode: string, why: string) {
    super(`delivery: postcode ${postcode} is courier-only, and a courier order cannot be sold (${why})`);
    this.name = "CourierNotPurchasableError";
  }
}

/** Its fulfilling shop and total weight. */
export interface PackageInput {
  shopId: string;
  grams: number;
}

/** Every step and the customer lines. `breakdown` holds distance and plan prices (stored for staff); customers see `lines` and `totalCents`. */
export interface PricedFee {
  planId: string;
  planName: string;
  /** null when none is chosen. */
  slotId: string | null;
  windowIsToday: boolean;
  breakdown: FeeBreakdown;
  lines: FeeLine[];
  totalCents: number;
}

/** One window for the order. `fees` is keyed `windowKey(slot, date)`: the same window costs more today. */
export interface EffyWindowsQuote {
  /** Today first, then the next delivery days. */
  days: EffyDay[];
  fees: ReadonlyMap<string, PricedFee>;
  /** Why no day has a window; null when one can be chosen. */
  unavailable: "no_windows" | "none_defined" | null;
  /** "As soon as possible", when some day can take an untimed order. No day: that is decided at the intent and never told. */
  asap: { estimate: string; fee: PricedFee } | null;
}

/** The order goes by courier: nothing to choose, one fee. No packages: the intent takes shops from the cart. */
export interface CourierQuote {
  serviced: true;
  coverage: "courier";
  /** `courierFee`, nothing from Effy's plan. */
  fee: PricedFee;
  /** The default service's current timeframe; the order keeps a copy. */
  estimate: string;
  /** Recorded on the order. */
  serviceId: string;
  /** The platform default now. */
  collection: "hub" | "supplier";
  /** `out_of_coverage`: Effy does not deliver there. `no_window`: it does, but nothing is open and the business sends such orders by courier. */
  reason: "out_of_coverage" | "no_window";
  /** Toward the courier table's own free delivery; null when unset or reached. */
  freeDeliveryRemainingCents: number | null;
}

export type QuoteResult =
  | { serviced: false; coverage: "none" }
  | CourierQuote
  | {
      serviced: true;
      coverage: "effy";
      /** null when in no group. */
      zoneId: string | null;
      /** For the platform's use; a customer never sees them. */
      shopIds: string[];
      /** On a plain later day with no surcharge: what surcharges are measured against and what an untimed order pays. */
      baseFee: PricedFee;
      /** Toward free delivery; null when unset or reached. */
      freeDeliveryRemainingCents: number | null;
      effyWindows: EffyWindowsQuote;
    };

export function distinctShops(pkgs: readonly PackageInput[]): string[] {
  return [...new Set(pkgs.map((p) => p.shopId))];
}

/** One delivery choice under `plan`: whole basket weight, postcode distance, basket value, window premium. Calls the engine; adds nothing. */
export function priceEffyOrder(
  plan: Plan,
  postcode: string,
  km: number,
  grams: number,
  basketCents: number,
  slotId: string | null,
  windowIsToday: boolean,
): PricedFee {
  try {
    const breakdown = effyFee({
      km, grams, basketCents, premiumCents: windowPremiumCents(plan, slotId, windowIsToday), plan: effyValues(plan),
    });
    return { planId: plan.id, planName: plan.name, slotId, windowIsToday, breakdown, lines: feeLines(breakdown), totalCents: breakdown.totalCents };
  } catch (err) {
    if (err instanceof UnpricedDistanceError || err instanceof UnpricedWeightError) {
      throw new ListedPostcodeUnpricedError(plan.id, postcode, err.message);
    }
    throw err;
  }
}

/** The flat amount plus the basket's weight band; calls `courierFee` and reads nothing of Effy's plan. */
export function priceCourierOrder(plan: Plan, postcode: string, grams: number, basketCents: number): PricedFee {
  try {
    const breakdown = courierFee({ grams, basketCents, plan: courierValues(plan) });
    return { planId: plan.id, planName: plan.name, slotId: null, windowIsToday: false, breakdown, lines: feeLines(breakdown), totalCents: breakdown.totalCents };
  } catch (err) {
    // A gap in the courier table's weights is the same breach.
    if (err instanceof UnpricedWeightError) throw new CourierNotPurchasableError(postcode, err.message);
    throw err;
  }
}

/** The caller has established a courier order can be placed here now. */
async function quoteCourier(
  q: Queryable, postcode: string, grams: number, basketCents: number, reason: CourierQuote["reason"],
): Promise<CourierQuote> {
  let plan: Plan;
  try {
    plan = await loadActivePlan(q, "courier");
  } catch (err) {
    if (err instanceof NoActivePlanError) throw new CourierNotPurchasableError(postcode, "no active courier fee table");
    throw err;
  }
  const { estimateText, defaultServiceId, collectionDefault } = await loadCourierSettings(q);
  if (estimateText === null || defaultServiceId === null) throw new CourierNotPurchasableError(postcode, "no default courier service");
  return {
    serviced: true,
    coverage: "courier",
    fee: priceCourierOrder(plan, postcode, grams, basketCents),
    estimate: estimateText,
    serviceId: defaultServiceId,
    collection: collectionDefault,
    reason,
    freeDeliveryRemainingCents:
      plan.freeOverCents !== null && basketCents < plan.freeOverCents ? plan.freeOverCents - basketCents : null,
  };
}

/**
 * Delivery for a postcode at `now`: one fee for the whole basket (however many packages) and one window
 * for the whole order. A serviced address answers Effy windows or a courier, nothing else.
 * `basketCents` is `basketValueCents(...)`; `customerId`'s own unpaid hold is not counted (null: none).
 */
export async function quote(
  q: Queryable,
  customerId: string | null,
  postcode: string,
  pkgs: readonly PackageInput[],
  now: Date,
  basketCents: number,
): Promise<QuoteResult> {
  const coverage = await coverageForPostcode(q, postcode);
  const grams = pkgs.reduce((sum, p) => sum + p.grams, 0);
  // Outside Effy's area, where a courier order can be placed.
  if (coverage.kind === "courier") return quoteCourier(q, postcode, grams, basketCents, "out_of_coverage");
  if (coverage.kind !== "effy") return { serviced: false, coverage: "none" };

  const plan = await loadActivePlan(q, "effy");
  // Every listed postcode has a distance; "no price" must never become "no charge".
  const km = coverage.distanceKm;
  if (km === null) throw new ListedPostcodeUnpricedError(plan.id, postcode, "no distance");

  const { runs, bufferMin } = await collectionSchedule(q);
  const settings = await loadSlotSettings(q);
  const today = melbourneDate(now);
  // Today is absent where the postcode does not offer it; a stale choice of today is refused at the intent.
  const calendar = effyDays(now, settings.effyLookaheadDays, settings.noWeekdays, await nonDeliveryDates(q, today), coverage.todayOffered);
  const dates = calendar.map((d) => d.date);

  const slots = await loadSlots(q);
  const load = await slotLoadByDate(q, dates);
  for (const [date, held] of await ownLiveHoldsByDate(q, customerId, dates)) {
    const day = load.get(date);
    if (day) for (const [id, n] of held) day.set(id, (day.get(id) ?? 0) - n);
  }
  const days = openWindows(now, calendar, slots, load, runs, bufferMin, settings.turnaroundMin);

  // No window on any day: the courier, if the business allows it and one can be booked. Only then: while a window is open the customer never chooses.
  const unavailable = windowsUnavailable(days, slots);
  if (unavailable !== null) {
    const courier = await loadCourierSettings(q);
    if (courier.whenNoWindows && (await courierReachesPostcode(q, postcode))) {
      return quoteCourier(q, postcode, grams, basketCents, "no_window");
    }
  }

  const baseFee = priceEffyOrder(plan, postcode, km, grams, basketCents, null, false);
  const fees = new Map<string, PricedFee>();
  for (const d of days) {
    for (const w of d.windows) fees.set(windowKey(w.id, d.date), priceEffyOrder(plan, postcode, km, grams, basketCents, w.id, d.isToday));
    // An untimed order pays the plain fee, even today: the Any-time window is never priced as a window.
    if (d.anyTime) fees.set(windowKey(d.anyTime.id, d.date), baseFee);
  }
  const asap = days.some((d) => d.anyTime !== null) ? { estimate: settings.asapEstimate, fee: baseFee } : null;

  return {
    serviced: true,
    coverage: "effy",
    zoneId: coverage.groupId,
    shopIds: distinctShops(pkgs),
    baseFee,
    freeDeliveryRemainingCents:
      plan.freeOverCents !== null && basketCents < plan.freeOverCents ? plan.freeOverCents - basketCents : null,
    effyWindows: { days, fees, unavailable, asap },
  };
}
