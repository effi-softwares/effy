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

/**
 * 078 — bind the ONE window the shopper chose to every package of the order.
 *
 * The package's method is the customer's word for it: `same_day` when the window is today,
 * `standard` when it is a later day. Either way Effy delivers, in that window.
 *
 * ⚠ NEVER SUBSTITUTED: no window, a day that is no longer offered, or a window that has closed or
 * filled is a refusal, and the shopper chooses again.
 */
export function resolveEffyWindow(
  q: EffyQuote,
  chosen: ChosenWindow | null,
  now: Date,
): { packages: PackageDelivery[]; hold: SlotHold; fee: PricedFee } {
  if (q.effyWindows.unavailable) throw new DeliveryChoiceError("no_windows_available");
  if (!chosen) throw new DeliveryChoiceError("slot_required");

  const day = q.effyWindows.days.find((d) => d.date === chosen.date);
  if (!day || day.closedReason === "not_delivery_day") throw new DeliveryChoiceError("date_unavailable");
  const slot = day.windows.find((w) => w.id === chosen.slotId);
  const fee = q.effyWindows.fees.get(windowKey(chosen.slotId, chosen.date));
  if (!slot || !fee) throw new DeliveryChoiceError("slot_unavailable");

  const method = day.isToday ? METHOD_SAME_DAY : METHOD_STANDARD;
  const packages = q.shopIds.map((shopId): PackageDelivery => ({
    shopId, method, promisedDay: day.date, slotId: slot.id, windowStart: slot.start, windowEnd: slot.end,
  }));
  return { packages, hold: { slotId: slot.id, date: day.date, now }, fee };
}

/**
 * 079 — a courier order: nothing was chosen, so there is nothing to bind or to hold.
 *
 * Every package is recorded `standard` with no window and no day — the shape the platform already
 * collects to the hub and hands to a carrier. ⚠ That word is ROUTING, not what the customer was
 * sold: who delivers is the order's delivery type, and the customer reads "Courier delivery".
 * ⚠ `hold` is null BY TYPE: a courier order never takes a place in an Effy window (FR-012).
 */
export function resolveCourier(q: CourierQuote, pkgs: readonly PackageInput[]): { packages: PackageDelivery[]; hold: null; fee: PricedFee } {
  return {
    packages: pkgs.map((p): PackageDelivery => ({
      shopId: p.shopId, method: METHOD_STANDARD, promisedDay: "", slotId: null, windowStart: null, windowEnd: null,
    })),
    hold: null,
    fee: q.fee,
  };
}
