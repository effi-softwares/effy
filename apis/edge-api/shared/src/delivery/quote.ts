import type { Queryable } from "../lib/db";
import { fee, type FeeInputs } from "./engine";
import { loadActivePlan, METHOD_SAME_DAY, METHOD_STANDARD, type Plan } from "./plan";
import { melbourneDate, sameDaySchedule } from "./sameday";
import { loadSlots, loadSlotSettings, openSlots, ownLiveHolds, slotLoad, type OpenSlot } from "./slots";
import { availableDays, nonDeliveryDates } from "./standard-days";
import { coverageForPostcode } from "./coverage";
import { sameDayForShops, zoneForPostcode } from "./zone";

/**
 * The INVARIANT breach (047 FR-029): a served zone whose ring the active plan does not price.
 * Activation guarantees it cannot happen; if it ever does, the quote fails LOUD — never free
 * delivery — and the caller raises the alarm metric.
 */
export class ServedZoneUnpricedError extends Error {
  constructor(planId: string, ringId: string) {
    super(`delivery: served zone could not be priced (plan ${planId}, ring ${ringId})`);
    this.name = "ServedZoneUnpricedError";
  }
}

/** One per-shop package to price: its fulfilling shop and its total weight. */
/**
 * ⚠ AN INVARIANT, NOT A REFUSAL (076 research R7). The coverage answer is "courier" — and nothing
 * can sell a courier order yet. It cannot happen while `COURIER_ORDERING_AVAILABLE` is false,
 * because the admin service will not switch courier delivery on. If it is thrown, either someone
 * set `delivery_settings.courier_offered` by hand, or the courier checkout was switched on without
 * teaching the quote to price it. The customer is told the address cannot be delivered to; the
 * log says why that is wrong.
 */
export class CourierNotPurchasableError extends Error {
  constructor(postcode: string) {
    super(`delivery: postcode ${postcode} is courier-only, and a courier order cannot be placed yet`);
    this.name = "CourierNotPurchasableError";
  }
}

export interface PackageInput {
  shopId: string;
  grams: number;
}

/** One offered delivery method for a package, at its GST-inclusive, snapped-up fee. */
export interface DeliveryOption {
  method: string;
  feeCents: number;
}

/**
 * A package's offered options. A served package ALWAYS carries a standard option; it carries a
 * same_day option only when the fulfilling shop does same-day in this zone and a slot is open.
 */
export interface PackageQuote {
  shopId: string;
  options: DeliveryOption[];
}

/** The package's standard fee (always present when serviced). */
export function standardFeeCents(p: PackageQuote): number {
  return (p.options.find((o) => o.method === METHOD_STANDARD) ?? p.options[0])?.feeCents ?? 0;
}

/**
 * The fee for a chosen method, falling back to standard when that method is not offered on this
 * package — a client asking for same_day where it is unavailable is charged standard, never
 * refused.
 */
export function feeFor(p: PackageQuote, method: string): DeliveryOption {
  return p.options.find((o) => o.method === method) ?? { method: METHOD_STANDARD, feeCents: standardFeeCents(p) };
}

export function offersSameDay(p: PackageQuote): boolean {
  return p.options.some((o) => o.method === METHOD_SAME_DAY);
}

/**
 * Why same-day is not on offer (069 FR-004). The two are different sentences to a customer: "not
 * in your area" will still be true tomorrow, "today's times are taken" will not.
 */
export const SAME_DAY_NOT_ELIGIBLE = "not_eligible";
export const SAME_DAY_SLOTS_CLOSED = "slots_closed";

export type QuoteResult =
  | { serviced: false; coverage: "none" }
  | {
      serviced: true;
      /** 076 — who delivers. Only Effy's own delivery can be sold until the courier checkout exists. */
      coverage: "effy";
      /** The postcode's group, or null when it is in none (076). */
      zoneId: string | null;
      ringId: string;
      /** The latest cutoff among the open slots; null when there is no same-day today. */
      sameDayUntil: Date | null;
      packages: PackageQuote[];
      standardTotalCents: number;
      /** The windows still open for this order, earliest first. */
      sameDaySlots: OpenSlot[];
      /** Why `sameDaySlots` is empty; null when it is not. */
      sameDayUnavailable: string | null;
      /** The days a standard delivery can arrive — never empty when serviced (069 FR-020). */
      standardDays: string[];
    };

export function feeInputs(plan: Plan, ringPriceCents: number, grams: number, factorMilli: number): FeeInputs {
  return {
    ringPriceCents,
    packageGrams: grams,
    weightBands: plan.weightBands,
    factorMilli,
    stepCents: plan.roundingStepCents,
    floorCents: plan.floorCents,
    capCents: plan.capCents,
  };
}

/** First-appearance order. */
export function distinctShops(pkgs: readonly PackageInput[]): string[] {
  return [...new Set(pkgs.map((p) => p.shopId))];
}

/**
 * Price delivery per package for a destination postcode at `now` (047 US1–US3, 069). Every served
 * package gets a standard option; a same_day option is added where the fulfilling shop does
 * same-day in this zone AND a delivery slot is still open today.
 *
 * `customerId` is whose checkout this is: their own unpaid hold is not counted against them. Null
 * subtracts nothing.
 */
export async function quote(
  q: Queryable,
  customerId: string | null,
  postcode: string,
  pkgs: readonly PackageInput[],
  now: Date,
): Promise<QuoteResult> {
  const zone = await zoneForPostcode(q, postcode);
  if (!zone) {
    // Not on Effy's list. Nobody delivers — or a courier does, which nothing here can sell yet.
    if ((await coverageForPostcode(q, postcode)).kind === "courier") throw new CourierNotPurchasableError(postcode);
    return { serviced: false, coverage: "none" };
  }

  const plan = await loadActivePlan(q);
  // A listed postcode always resolves a tier while any tier exists (076 `coverage_ring_for_km`).
  const ringId = zone.ringId;
  const ringPrice = ringId === null ? undefined : plan.ringPriceCents.get(ringId);
  if (ringId === null || ringPrice === undefined) throw new ServedZoneUnpricedError(plan.id, ringId ?? "none");

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

  const packages: PackageQuote[] = [];
  let standardTotalCents = 0;
  for (const p of pkgs) {
    const std = fee(feeInputs(plan, ringPrice, p.grams, plan.standardFactorMilli));
    const options: DeliveryOption[] = [{ method: METHOD_STANDARD, feeCents: std }];
    standardTotalCents += std;

    // Same-day is a strictly additive offer (047 FR-038): its absence never removes standard.
    // ⚠ 069: only while a slot is open. Same-day without a window is not something the platform
    // sells, so there is no "same-day, time to be confirmed" option to fall into.
    if (sameDayOpen && sameDayShops.get(p.shopId)) {
      options.push({ method: METHOD_SAME_DAY, feeCents: fee(feeInputs(plan, ringPrice, p.grams, plan.sameDayFactorMilli)) });
    }
    packages.push({ shopId: p.shopId, options });
  }

  return {
    serviced: true,
    coverage: "effy",
    zoneId: zone.id,
    ringId,
    sameDayUntil,
    packages,
    standardTotalCents,
    sameDaySlots,
    sameDayUnavailable,
    standardDays,
  };
}
