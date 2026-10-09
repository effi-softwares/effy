import type { Queryable } from "../lib/db";
import {
  courierFee, effyFee, feeLines, UnpricedDistanceError, UnpricedWeightError, type FeeBreakdown, type FeeLine,
} from "./engine";
import {
  courierValues, effyValues, loadActivePlan, METHOD_SAME_DAY, METHOD_STANDARD, NoActivePlanError, windowPremiumCents, type Plan,
} from "./plan";
import { melbourneDate, sameDaySchedule } from "./sameday";
import { deliveryModelV2At } from "./model";
import {
  loadSlots, loadSlotSettings, openSlots, ownLiveHolds, ownLiveHoldsByDate, slotLoad, slotLoadByDate, type OpenSlot,
} from "./slots";
import { effyDays, openWindows, windowKey, windowsUnavailable, type EffyDay } from "./windows";
import { availableDays, nonDeliveryDates } from "./standard-days";
import { courierReachesPostcode, coverageForPostcode, loadCourierSettings } from "./coverage";
import { sameDayForShops, zoneForPostcode } from "./zone";

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

/** A method a package can have. ⚠ No fee: delivery is priced once per ORDER (077). */
export interface DeliveryOption {
  method: string;
}

/**
 * The methods one package can have. A served package ALWAYS carries standard; it carries same_day
 * only when the fulfilling shop does same-day in this group and a slot is open.
 */
export interface PackageQuote {
  shopId: string;
  options: DeliveryOption[];
}

export function offersSameDay(p: PackageQuote): boolean {
  return p.options.some((o) => o.method === METHOD_SAME_DAY);
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
 * Why same-day is not on offer (069 FR-004). The two are different sentences to a customer: "not
 * in your area" will still be true tomorrow, "today's times are taken" will not.
 */
export const SAME_DAY_NOT_ELIGIBLE = "not_eligible";
export const SAME_DAY_SLOTS_CLOSED = "slots_closed";

/**
 * 078 — what a customer may choose once the new delivery model is on: ONE window for the order.
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
      /** 076 — who delivers: Effy's own drivers. */
      coverage: "effy";
      /** The postcode's group, or null when it is in none (076). */
      zoneId: string | null;
      /** The latest cutoff among the open slots; null when there is no same-day today. */
      sameDayUntil: Date | null;
      packages: PackageQuote[];
      /** 077 — the order's delivery charge when NO window is chosen (a later day). */
      standardFee: PricedFee;
      /** 077 — the order's delivery charge with each open window, by slot id. */
      slotFees: ReadonlyMap<string, PricedFee>;
      /** 077 — how much more the basket needs for free delivery; null when unset or reached. */
      freeDeliveryRemainingCents: number | null;
      /** The windows still open for this order, earliest first. */
      sameDaySlots: OpenSlot[];
      /** Why `sameDaySlots` is empty; null when it is not. */
      sameDayUnavailable: string | null;
      /** The days a standard delivery can arrive — never empty when serviced (069 FR-020), while `effyWindows` is null. */
      standardDays: string[];
      /** 078 — null while the new delivery model is off, and then everything above is the 069 quote. */
      effyWindows: EffyWindowsQuote | null;
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
 * Quote delivery for a destination postcode at `now` (047 US1–US3, 069, 077, 079).
 *
 * ⚠ ONE FEE FOR THE ORDER. Effy collects from its suppliers and delivers from its hub, so to the
 * customer the order comes from one place: the basket is weighed whole and priced once, and how many
 * packages it splits into changes nothing. The packages still say which of them can go TODAY — that
 * is what a customer chooses a window for, not what they pay by.
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
  // ⚠ Judged at the caller's `now`, like the model switch below: the coverage answer is "courier"
  // only once the new delivery model is on (079), and the two must be asked about the same instant.
  const coverage = await coverageForPostcode(q, postcode, now);
  const grams = pkgs.reduce((sum, p) => sum + p.grams, 0);
  // 079 — outside Effy's area, and a courier order can be placed there. Never reached while the new
  // delivery model is off: the checkout customers use until the cutover has no courier order to sell.
  if (coverage.kind === "courier") return quoteCourier(q, postcode, grams, basketCents, "out_of_coverage");
  const zone = coverage.kind === "effy" ? await zoneForPostcode(q, postcode) : null;
  if (!zone) return { serviced: false, coverage: "none" };

  const plan = await loadActivePlan(q, "effy");
  // Every listed postcode has a distance (076: the column is NOT NULL). Without one there is no
  // band to price it on — and "no price" must never become "no charge".
  const km = coverage.distanceKm;
  if (km === null) throw new ListedPostcodeUnpricedError(plan.id, postcode, "no distance");

  if (await deliveryModelV2At(q, now)) return quoteEffyWindows(q, customerId, postcode, pkgs, now, basketCents, plan, km, grams, zone.id);

  const sameDayShops = await sameDayForShops(q, zone.id, zone.sameDayEligible, distinctShops(pkgs));
  const { runs, bufferMin } = await sameDaySchedule(q);

  // 069 — what a customer can CHOOSE. Slots and days are facts about the order, not about a
  // package: every run collects from every shop, so a slot that is open is open for all of them,
  // and one choice covers every same-day package (FR-005).
  const settings = await loadSlotSettings(q);
  const today = melbourneDate(now);
  const noDates = await nonDeliveryDates(q, today);

  const standardDays = availableDays(
    now, runs, bufferMin, settings.carrierLeadDays, settings.lookaheadDays, settings.noWeekdays, noDates,
  );

  let sameDaySlots: OpenSlot[] = [];
  let sameDayUnavailable: string | null = null;
  if (!pkgs.some((p) => sameDayShops.get(p.shopId))) {
    sameDayUnavailable = SAME_DAY_NOT_ELIGIBLE;
  } else {
    const slots = await loadSlots(q);
    const load = await slotLoad(q, today);
    for (const [id, n] of await ownLiveHolds(q, customerId, today)) load.set(id, (load.get(id) ?? 0) - n);
    sameDaySlots = openSlots(now, slots, load, runs, bufferMin, settings.turnaroundMin);
    if (sameDaySlots.length === 0) sameDayUnavailable = SAME_DAY_SLOTS_CLOSED;
  }
  const sameDayOpen = sameDaySlots.length > 0;

  let sameDayUntil: Date | null = null;
  for (const s of sameDaySlots) {
    if (!sameDayUntil || s.cutoff.getTime() > sameDayUntil.getTime()) sameDayUntil = s.cutoff;
  }

  const packages: PackageQuote[] = pkgs.map((p) => {
    const options: DeliveryOption[] = [{ method: METHOD_STANDARD }];
    // Same-day is a strictly additive offer (047 FR-038): its absence never removes standard.
    // ⚠ 069: only while a slot is open. Same-day without a window is not something the platform
    // sells, so there is no "same-day, time to be confirmed" option to fall into.
    if (sameDayOpen && sameDayShops.get(p.shopId)) options.push({ method: METHOD_SAME_DAY });
    return { shopId: p.shopId, options };
  });

  // No window: a later day. Then once per open window — every slot offered today IS today, which is
  // what makes a same-day delivery dearer (the plan's today premium), plus the window's own premium.
  const standardFee = priceEffyOrder(plan, postcode, km, grams, basketCents, null, false);
  const slotFees = new Map<string, PricedFee>();
  for (const s of sameDaySlots) slotFees.set(s.id, priceEffyOrder(plan, postcode, km, grams, basketCents, s.id, s.date === today));

  return {
    serviced: true,
    coverage: "effy",
    zoneId: zone.id,
    sameDayUntil,
    packages,
    standardFee,
    slotFees,
    freeDeliveryRemainingCents:
      plan.freeOverCents !== null && basketCents < plan.freeOverCents ? plan.freeOverCents - basketCents : null,
    sameDaySlots,
    sameDayUnavailable,
    standardDays,
    effyWindows: null,
  };
}

/**
 * The quote under the new delivery model (078): today plus the next delivery days, the windows open
 * on each, and the order's charge with each.
 *
 * ⚠ ONE WINDOW FOR THE WHOLE ORDER. The per-shop same-day bridge (`sameDayForShops`) is NOT asked:
 * every collection run visits every shop, so a window that is open is open for all of them, and an
 * order never splits across today and a later day — the split was the one thing on a delivery screen
 * that told a customer how many suppliers they had.
 *
 * ⚠ THE 069 FIELDS ARE STILL FILLED, truthfully — today's windows as `sameDaySlots`, the later days
 * that have a window as `standardDays` — so a client built before 078 draws something real. Its
 * intent carries no window and is refused; it never buys a day without one.
 */
async function quoteEffyWindows(
  q: Queryable,
  customerId: string | null,
  postcode: string,
  pkgs: readonly PackageInput[],
  now: Date,
  basketCents: number,
  plan: Plan,
  km: number,
  grams: number,
  zoneId: string | null,
): Promise<QuoteResult> {
  const { runs, bufferMin } = await sameDaySchedule(q);
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
  if (windowsUnavailable(days, slots) !== null) {
    const courier = await loadCourierSettings(q);
    if (courier.whenNoWindows && (await courierReachesPostcode(q, postcode, now))) {
      return quoteCourier(q, postcode, grams, basketCents, "no_window");
    }
  }

  // The plain later-day charge is what a window's surcharge is measured against.
  const standardFee = priceEffyOrder(plan, postcode, km, grams, basketCents, null, false);
  const fees = new Map<string, PricedFee>();
  for (const d of days) {
    for (const w of d.windows) fees.set(windowKey(w.id, d.date), priceEffyOrder(plan, postcode, km, grams, basketCents, w.id, d.isToday));
  }

  const sameDaySlots = days[0]?.isToday ? days[0].windows : [];
  const slotFees = new Map<string, PricedFee>();
  let sameDayUntil: Date | null = null;
  for (const s of sameDaySlots) {
    slotFees.set(s.id, fees.get(windowKey(s.id, s.date))!);
    if (!sameDayUntil || s.cutoff.getTime() > sameDayUntil.getTime()) sameDayUntil = s.cutoff;
  }

  return {
    serviced: true,
    coverage: "effy",
    zoneId,
    sameDayUntil,
    packages: pkgs.map((p) => ({
      shopId: p.shopId,
      options: sameDaySlots.length > 0 ? [{ method: METHOD_STANDARD }, { method: METHOD_SAME_DAY }] : [{ method: METHOD_STANDARD }],
    })),
    standardFee,
    slotFees,
    freeDeliveryRemainingCents:
      plan.freeOverCents !== null && basketCents < plan.freeOverCents ? plan.freeOverCents - basketCents : null,
    sameDaySlots,
    sameDayUnavailable: sameDaySlots.length > 0 ? null : SAME_DAY_SLOTS_CLOSED,
    standardDays: days.filter((d) => !d.isToday && d.windows.length > 0).map((d) => d.date),
    effyWindows: { days, fees, unavailable: windowsUnavailable(days, slots) },
  };
}
