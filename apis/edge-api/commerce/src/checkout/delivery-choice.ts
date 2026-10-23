/** Turns the shopper's choice into what each package gets. Pure; the clock is an input. */
import {
  METHOD_SAME_DAY, METHOD_STANDARD, windowKey, type CourierQuote, type PackageInput, type PricedFee, type QuoteResult,
} from "@effy/edge-shared/delivery";
import type { DeliveryChoiceRefusalCode, DeliveryPromise } from "@effy/shared-types";

import type { PackageDelivery, SlotHold } from "./store";

/** The chosen window is gone or none was chosen. Never substituted: the shopper chooses again. */
export class DeliveryChoiceError extends Error {
  constructor(readonly code: DeliveryChoiceRefusalCode) {
    super(`checkout: delivery choice refused: ${code}`);
  }
}

type EffyQuote = Extract<QuoteResult, { coverage: "effy" }>;

export interface ChosenWindow {
  slotId: string;
  /** yyyy-mm-dd, Melbourne. */
  date: string;
}

export interface EffyChoice {
  packages: PackageDelivery[];
  hold: SlotHold;
  fee: PricedFee;
  promise: DeliveryPromise;
  /** Set exactly when `promise` is `asap`. */
  asapEstimate: string | null;
}

/**
 * Binds the chosen window to every package. An "Any time" window promises the day (never today's).
 * The method is the customer's word: `same_day` for today, `standard` for a later day.
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
 * The first day (today first) that can take an untimed order. The customer is told the estimate,
 * never the day, and pays the one asap fee whatever day it lands on.
 */
export function resolveAsap(q: EffyQuote, now: Date): EffyChoice {
  const asap = q.effyWindows.asap;
  const day = q.effyWindows.days.find((d) => d.anyTime !== null);
  if (!asap || !day?.anyTime) throw new DeliveryChoiceError("slot_unavailable");
  return { ...bind(q, day, day.anyTime, now), fee: asap.fee, promise: "asap", asapEstimate: asap.estimate };
}

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

/** Exactly one of a window or asap. */
export function resolveEffyChoice(q: EffyQuote, chosen: ChosenWindow | null, asap: boolean, now: Date): EffyChoice {
  if (asap && chosen) throw new DeliveryChoiceError("slot_required");
  return asap ? resolveAsap(q, now) : resolveEffyWindow(q, chosen, now);
}

/**
 * A courier order binds and holds nothing. Packages are stored `standard` with no window: routing,
 * not what the customer was sold.
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
