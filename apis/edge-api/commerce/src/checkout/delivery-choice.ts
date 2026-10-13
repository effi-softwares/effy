/**
 * Turning what a shopper chose into what each package of the order will get (078, 079).
 * Pure: every input is passed in, including the clock.
 */
import {
  METHOD_SAME_DAY, METHOD_STANDARD, windowKey, type CourierQuote, type PackageInput, type PricedFee, type QuoteResult,
} from "@effy/edge-shared/delivery";
import type { DeliveryChoiceRefusalCode } from "@effy/shared-types";

import type { PackageDelivery, SlotHold } from "./store";

/**
 * The chosen window is no longer on offer, or none was chosen.
 *
 * ⚠ Never SUBSTITUTED. The platform never moves an order to a time the shopper did not pick: the
 * intent is refused and they choose again (069 FR-010).
 */
export class DeliveryChoiceError extends Error {
  constructor(readonly code: DeliveryChoiceRefusalCode) {
    super(`checkout: delivery choice refused: ${code}`);
  }
}

/** A quote Effy itself delivers — the only kind that has windows to choose. */
type EffyQuote = Extract<QuoteResult, { coverage: "effy" }>;

/** The window a shopper chose: a slot ON A DAY. */
export interface ChosenWindow {
  slotId: string;
  /** yyyy-mm-dd, Melbourne. */
  date: string;
}

/** 085 — what the order was sold: a time on a day, a day with no time, or "as soon as possible". */
export type SoldPromise = "window" | "day" | "asap";

/** What a resolved Effy choice gives the checkout to write. */
export interface EffyChoice {
  packages: PackageDelivery[];
  hold: SlotHold;
  fee: PricedFee;
  promise: SoldPromise;
  /** The estimate the customer was told; set exactly when `promise` is `asap`. */
  asapEstimate: string | null;
}

/**
 * 078 — bind the ONE window the shopper chose to every package of the order.
 *
 * 085 — the window may be the day's "Any time" window: the order is then promised the DAY. It is
 * bound, held and stored exactly like any window; only `promise` says the customer was sold no
 * hours. ⚠ Not today's: a customer cannot choose "today, any time" (that is a same-day window, or
 * an "as soon as possible" order the server placed there itself).
 *
 * The package's method is the customer's word for it: `same_day` when the window is today,
 * `standard` when it is a later day. Either way Effy delivers, in that window.
 *
 * ⚠ NEVER SUBSTITUTED: no window, a day that is no longer offered, or a window that has closed or
 * filled is a refusal, and the shopper chooses again.
 */
export function resolveEffyWindow(q: EffyQuote, chosen: ChosenWindow | null, now: Date): EffyChoice {
  if (q.effyWindows.unavailable) throw new DeliveryChoiceError("no_windows_available");
  if (!chosen) throw new DeliveryChoiceError("slot_required");

  const day = q.effyWindows.days.find((d) => d.date === chosen.date);
  if (!day || day.closedReason === "not_delivery_day") throw new DeliveryChoiceError("date_unavailable");
  const timed = day.windows.find((w) => w.id === chosen.slotId);
  const untimed = !timed && !day.isToday && day.anyTime?.id === chosen.slotId ? day.anyTime : null;
  const slot = timed ?? untimed;
  const fee = q.effyWindows.fees.get(windowKey(chosen.slotId, chosen.date));
  if (!slot || !fee) throw new DeliveryChoiceError("slot_unavailable");

  return { ...bind(q, day, slot, now), fee, promise: untimed ? "day" : "window", asapEstimate: null };
}

/**
 * 085 — "as soon as possible": the FIRST day of the calendar (today first) that can take an order
 * with no time. From here it is a day-only order for that day in every respect — same window, same
 * hold, same round. Only what the customer was told differs: the estimate, never the day.
 *
 * ⚠ THIS IS THE WHOLE OF "AS SOON AS POSSIBLE". No job re-plans it and nothing moves it later
 * except a person in back-office.
 * ⚠ The fee is the quote's one ASAP fee whatever day it lands on — never today's premium — so the
 * total the shopper saw cannot depend on a day they were not shown.
 */
export function resolveAsap(q: EffyQuote, now: Date): EffyChoice {
  const asap = q.effyWindows.asap;
  const day = q.effyWindows.days.find((d) => d.anyTime !== null);
  if (!asap || !day?.anyTime) throw new DeliveryChoiceError("slot_unavailable");
  return { ...bind(q, day, day.anyTime, now), fee: asap.fee, promise: "asap", asapEstimate: asap.estimate };
}

/** One window on one day, bound to every package of the order — and the place to hold in it. */
function bind(
  q: EffyQuote,
  day: EffyQuote["effyWindows"]["days"][number],
  slot: EffyQuote["effyWindows"]["days"][number]["windows"][number],
  now: Date,
): { packages: PackageDelivery[]; hold: SlotHold } {
  const method = day.isToday ? METHOD_SAME_DAY : METHOD_STANDARD;
  const packages = q.shopIds.map((shopId): PackageDelivery => ({
    shopId, method, promisedDay: day.date, slotId: slot.id, windowStart: slot.start, windowEnd: slot.end,
  }));
  return { packages, hold: { slotId: slot.id, date: day.date, now } };
}

/**
 * 085 — which of the two an Effy intent asked for. A window (timed or a day's Any-time one) OR
 * "as soon as possible" — both, or neither, is no choice at all.
 */
export function resolveEffyChoice(q: EffyQuote, chosen: ChosenWindow | null, asap: boolean, now: Date): EffyChoice {
  if (asap && chosen) throw new DeliveryChoiceError("slot_required");
  return asap ? resolveAsap(q, now) : resolveEffyWindow(q, chosen, now);
}

/**
 * 079 — a courier order: nothing was chosen, so there is nothing to bind or to hold.
 *
 * Every package is recorded `standard` with no window and no day — the shape the platform already
 * collects to the hub and hands to a carrier. ⚠ That word is ROUTING, not what the customer was
 * sold: who delivers is the order's delivery type, and the customer reads "Courier delivery".
 * ⚠ `hold` is null BY TYPE: a courier order never takes a place in an Effy window (FR-012).
 */
export function resolveCourier(
  q: CourierQuote,
  pkgs: readonly PackageInput[],
): { packages: PackageDelivery[]; hold: null; fee: PricedFee; promise: null; asapEstimate: null } {
  return {
    promise: null,
    asapEstimate: null,
    packages: pkgs.map((p): PackageDelivery => ({
      shopId: p.shopId, method: METHOD_STANDARD, promisedDay: "", slotId: null, windowStart: null, windowEnd: null,
    })),
    hold: null,
    fee: q.fee,
  };
}
