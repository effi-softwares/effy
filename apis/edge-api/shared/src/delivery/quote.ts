import type { Queryable } from "../lib/db";
import {
  courierFee, effyFee, feeLines, UnpricedDistanceError, UnpricedWeightError, type FeeBreakdown, type FeeLine,
} from "./engine";
import { courierValues, effyValues, loadActivePlan, NoActivePlanError, windowPremiumCents, type Plan } from "./plan";
import { collectionSchedule, melbourneDate } from "./schedule";
import { loadSlots, loadSlotSettings, nonDeliveryDates, ownLiveHoldsByDate, slotLoadByDate } from "./slots";
import { effyDays, openWindows, windowKey, windowsUnavailable, type EffyDay } from "./windows";
import { courierReachesPostcode, coverageForPostcode, loadCourierSettings } from "./coverage";

/**
 * The INVARIANT breach (047 FR-029, 077 FR-009): a postcode on Effy's list that the active plan
 * cannot price — it has no distance, or the plan has no band for it. Activation guarantees it cannot
 * happen; if it ever does, the quote fails LOUD — never free delivery — and the caller raises the
 * alarm metric.
 */
export class ListedPostcodeUnpricedError extends Error {
  constructor(planId: string, postcode: string, why: string) {
    super(`delivery: listed postcode ${postcode} could not be priced by plan ${planId} (${why})`);
    this.name = "ListedPostcodeUnpricedError";
  }
}

/**
 * ⚠ AN INVARIANT, NOT A REFUSAL (076 research R7, rebuilt by 079). The coverage answer is "courier"
 * and the order cannot be priced or described: no courier fee table is active, or no estimate is
 * set. `public.courier_reaches_postcode` answers "courier" only when BOTH exist, and the admin
 * service will not remove either while courier delivery is on — so this is thrown only if someone
 * changed a setting by hand, or between the coverage read and the plan read. The customer is told
 * the address cannot be delivered to; the log and the alarm metric say why that is wrong.
 */
export class CourierNotPurchasableError extends Error {
  constructor(postcode: string, why: string) {
    super(`delivery: postcode ${postcode} is courier-only, and a courier order cannot be sold (${why})`);
    this.name = "CourierNotPurchasableError";
  }
}

/** One per-shop package: its fulfilling shop and its total weight. */
export interface PackageInput {
  shopId: string;
  grams: number;
}

/**
 * One priced delivery choice for the order: every step that built it, and the lines a customer
 * reads. ⚠ `breakdown` holds a distance and the plan's prices — it is stored on the order for staff
 * and never sent to a customer; `lines` and `totalCents` are what a customer sees.
 */
export interface PricedFee {
  planId: string;
  planName: string;
  /** The window this choice is for; null when none is chosen (a later day). */
  slotId: string | null;
  windowIsToday: boolean;
  breakdown: FeeBreakdown;
  lines: FeeLine[];
  totalCents: number;
}

/**
 * What a customer may choose when Effy delivers: ONE window for the order (078).
 * `fees` holds the order's delivery charge with each open window, filed under `windowKey(slot, date)`
 * — the same window costs more today than on a later day (the plan's today premium).
 */
export interface EffyWindowsQuote {
  /** Today first, then the next delivery days. */
  days: EffyDay[];
  fees: ReadonlyMap<string, PricedFee>;
  /** Why no day has a window; null when one can be chosen. */
  unavailable: "no_windows" | "none_defined" | null;
}

/**
 * 079 — the order goes by courier. There is nothing to choose: no window, no day, one fee.
 *
 * ⚠ NO PACKAGES. How the order splits across shops is not part of what a courier order is sold as;
 * the intent takes the shops from the cart lines it already has.
 */
export interface CourierQuote {
  serviced: true;
  coverage: "courier";
  /** The courier fee for the whole order — `courierFee`, nothing from Effy's plan. */
  fee: PricedFee;
  /** The default courier service's timeframe as it stands now; the order keeps a copy. */
  estimate: string;
  /** 080 — that service, recorded on the order. */
  serviceId: string;
  /** 080 — how the order's parcels will reach the courier (the platform default now). */
  collection: "hub" | "supplier";
  /**
   * `out_of_coverage`: Effy does not deliver to the address. `no_window`: it does, but no window is
   * open on any offered day and the business sends such an order by courier (FR-011).
   */
  reason: "out_of_coverage" | "no_window";
  /** How much more the basket needs for the COURIER table's own free delivery; null when unset or reached. */
  freeDeliveryRemainingCents: number | null;
}

export type QuoteResult =
  | { serviced: false; coverage: "none" }
  | CourierQuote
  | {
      serviced: true;
      /** Who delivers: Effy's own drivers (076). */
      coverage: "effy";
      /** The postcode's group, or null when it is in none (076). */
      zoneId: string | null;
      /** The shops that fill the order — for the platform's own use; a customer never sees them. */
      shopIds: string[];
      /**
       * The order's delivery charge on a plain later day, with no window surcharge — what each
       * window's surcharge is measured against. ⚠ Not something that can be bought: every Effy order
       * has a window.
       */
      baseFee: PricedFee;
      /** How much more the basket needs for free delivery; null when unset or reached (077). */
      freeDeliveryRemainingCents: number | null;
      /** Today and the next delivery days, the windows open on each, and the charge with each. */
      effyWindows: EffyWindowsQuote;
    };

/** First-appearance order. */
export function distinctShops(pkgs: readonly PackageInput[]): string[] {
  return [...new Set(pkgs.map((p) => p.shopId))];
}

/**
 * Price ONE delivery choice for the order under `plan` (077 FR-001): the whole basket's weight, the
 * postcode's distance, the basket's value, and what the window adds.
 *
 * ⚠ It CALLS the engine and adds nothing itself — `effyFee` is the only sum.
 */
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

/**
 * Price a courier delivery for the order under the active courier table (077 FR-011): the flat
 * amount plus the whole basket's weight band. ⚠ It CALLS the engine — `courierFee` is the only sum —
 * and reads nothing of Effy's plan: no distance, no window, not Effy's free-delivery amount.
 */
export function priceCourierOrder(plan: Plan, postcode: string, grams: number, basketCents: number): PricedFee {
  try {
    const breakdown = courierFee({ grams, basketCents, plan: courierValues(plan) });
    return { planId: plan.id, planName: plan.name, slotId: null, windowIsToday: false, breakdown, lines: feeLines(breakdown), totalCents: breakdown.totalCents };
  } catch (err) {
    // Activation guarantees a courier table covers every weight (077); a gap is the same breach.
    if (err instanceof UnpricedWeightError) throw new CourierNotPurchasableError(postcode, err.message);
    throw err;
  }
}

/**
 * The courier quote for an order (079). The caller has already established that a courier order CAN
 * be placed to this postcode now — `coverageForPostcode` answered "courier", or
 * `courierReachesPostcode` did for an address with no window left.
 */
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
 * Quote delivery for a destination postcode at `now` (076–079).
 *
 * ⚠ ONE FEE FOR THE ORDER. Effy collects from its suppliers and delivers from its hub, so to the
 * customer the order comes from one place: the basket is weighed whole and priced once, and how many
 * packages it splits into changes nothing.
 *
 * ⚠ ONE WINDOW FOR THE WHOLE ORDER. Every collection run visits every shop, so a window that is open
 * is open for all of them, and an order never splits across days.
 *
 * ⚠ THERE IS ONE CHECKOUT (083). Until its removal an order could also be sold a same-day slot or a
 * standard day a carrier delivered; a serviced address now answers Effy windows or a courier, and
 * nothing else.
 *
 * `basketCents` is `basketValueCents(...)`. `customerId` is whose checkout this is: their own unpaid
 * hold is not counted against them. Null subtracts nothing.
 */
export async function quote(
  q: Queryable,
  customerId: string | null,
  postcode: string,
  pkgs: readonly PackageInput[],
  now: Date,
  basketCents: number,
): Promise<QuoteResult> {
  const coverage = await coverageForPostcode(q, postcode, now);
  const grams = pkgs.reduce((sum, p) => sum + p.grams, 0);
  // Outside Effy's area, and a courier order can be placed there (079).
  if (coverage.kind === "courier") return quoteCourier(q, postcode, grams, basketCents, "out_of_coverage");
  if (coverage.kind !== "effy") return { serviced: false, coverage: "none" };

  const plan = await loadActivePlan(q, "effy");
  // Every listed postcode has a distance (076: the column is NOT NULL). Without one there is no
  // band to price it on — and "no price" must never become "no charge".
  const km = coverage.distanceKm;
  if (km === null) throw new ListedPostcodeUnpricedError(plan.id, postcode, "no distance");

  const { runs, bufferMin } = await collectionSchedule(q);
  const settings = await loadSlotSettings(q);
  const today = melbourneDate(now);
  const calendar = effyDays(now, settings.effyLookaheadDays, settings.noWeekdays, await nonDeliveryDates(q, today));
  const dates = calendar.map((d) => d.date);

  const slots = await loadSlots(q);
  const load = await slotLoadByDate(q, dates);
  // The customer's own unpaid hold is not counted against them, on whichever day it is.
  for (const [date, held] of await ownLiveHoldsByDate(q, customerId, dates)) {
    const day = load.get(date);
    if (day) for (const [id, n] of held) day.set(id, (day.get(id) ?? 0) - n);
  }
  const days = openWindows(now, calendar, slots, load, runs, bufferMin, settings.turnaroundMin);

  // 079 FR-011 — NO window on any offered day. If the business sends such an order by courier, and a
  // courier order can be placed to this postcode (it may be on the courier exclusions list), that is
  // what is offered instead. ⚠ ONLY THEN: while any window is open the customer never chooses
  // between Effy and a courier (FR-003).
  const unavailable = windowsUnavailable(days, slots);
  if (unavailable !== null) {
    const courier = await loadCourierSettings(q);
    if (courier.whenNoWindows && (await courierReachesPostcode(q, postcode, now))) {
      return quoteCourier(q, postcode, grams, basketCents, "no_window");
    }
  }

  const fees = new Map<string, PricedFee>();
  for (const d of days) {
    for (const w of d.windows) fees.set(windowKey(w.id, d.date), priceEffyOrder(plan, postcode, km, grams, basketCents, w.id, d.isToday));
  }

  return {
    serviced: true,
    coverage: "effy",
    zoneId: coverage.groupId,
    shopIds: distinctShops(pkgs),
    baseFee: priceEffyOrder(plan, postcode, km, grams, basketCents, null, false),
    freeDeliveryRemainingCents:
      plan.freeOverCents !== null && basketCents < plan.freeOverCents ? plan.freeOverCents - basketCents : null,
    effyWindows: { days, fees, unavailable },
  };
}
