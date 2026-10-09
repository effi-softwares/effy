/**
 * Turning a shopper's delivery preference into what each package will actually get (047, 069).
 * Pure: every input is passed in, including the clock.
 */
import {
  METHOD_SAME_DAY, METHOD_STANDARD, offersSameDay, windowKey, type CourierQuote, type EffyWindowsQuote, type OpenSlot, type PackageInput,
  type PricedFee, type QuoteResult,
} from "@effy/edge-shared/delivery";
import type { DeliveryChoiceRefusalCode } from "@effy/shared-types";

import type { PackageDelivery, SlotHold } from "./store";

/**
 * The chosen slot or day is no longer on offer, or none was chosen.
 *
 * ⚠ Neither is ever SUBSTITUTED. The platform never moves an order to a time the shopper did not
 * pick: the intent is refused and they choose again (069 FR-010).
 */
export class DeliveryChoiceError extends Error {
  constructor(readonly code: DeliveryChoiceRefusalCode) {
    super(`checkout: delivery choice refused: ${code}`);
  }
}

/** Absent or unknown → standard. */
export const preferredMethod = (m: string | undefined | null) => (m === METHOD_SAME_DAY ? METHOD_SAME_DAY : METHOD_STANDARD);

/** A quote Effy itself delivers — the only kind that has packages, slots, days or windows to choose. */
type ServicedQuote = Extract<QuoteResult, { coverage: "effy" }>;

/**
 * Apply the order-level preference per package — same-day where offered, standard elsewhere — and
 * bind the slot and the day the shopper chose. One slot covers every same-day package and one day
 * covers every standard one.
 *
 * ⚠ ONE FEE FOR THE ORDER (077): the chosen window's when anything goes today, the plain later-day
 * fee otherwise. A package carries WHEN it arrives, never what it costs — an order whose packages
 * split across today and a later day still pays one delivery fee, the window's.
 */
export function resolveDeliveryChoice(
  q: ServicedQuote,
  preferred: string,
  slotId: string,
  standardDate: string,
  now: Date,
): { packages: PackageDelivery[]; hold: SlotHold | null; fee: PricedFee } {
  let anySameDay = false;
  let anyStandard = false;
  for (const p of q.packages) {
    if (preferred === METHOD_SAME_DAY && offersSameDay(p)) anySameDay = true;
    else anyStandard = true;
  }

  // Asked for same-day and NO package can have it: refused, not quietly downgraded to standard.
  if (preferred === METHOD_SAME_DAY && !anySameDay) throw new DeliveryChoiceError("slot_unavailable");

  let slot: OpenSlot | undefined;
  if (anySameDay) {
    if (slotId === "") throw new DeliveryChoiceError("slot_required");
    slot = q.sameDaySlots.find((s) => s.id === slotId);
    if (!slot) throw new DeliveryChoiceError("slot_unavailable");
  }

  let day = standardDate;
  if (anyStandard) {
    // No day chosen means the earliest on offer — what the UI preselects.
    if (day === "" && q.standardDays.length > 0) day = q.standardDays[0]!;
    if (day === "" || !q.standardDays.includes(day)) throw new DeliveryChoiceError("date_unavailable");
  }

  // The window's fee was priced with the quote, beside the slot it belongs to. A slot with no fee
  // is a slot the quote did not offer — refused like any other that has gone.
  const fee = slot ? q.slotFees.get(slot.id) : q.standardFee;
  if (!fee) throw new DeliveryChoiceError("slot_unavailable");

  const packages = q.packages.map((p): PackageDelivery =>
    preferred === METHOD_SAME_DAY && offersSameDay(p) && slot
      ? { shopId: p.shopId, method: METHOD_SAME_DAY, promisedDay: slot.date, slotId: slot.id, windowStart: slot.start, windowEnd: slot.end }
      : { shopId: p.shopId, method: METHOD_STANDARD, promisedDay: day, slotId: null, windowStart: null, windowEnd: null },
  );

  return { packages, hold: slot ? { slotId: slot.id, date: slot.date, now } : null, fee };
}

/** The window a shopper chose under the new delivery model: a slot ON A DAY. */
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
 * ⚠ NEVER SUBSTITUTED, like its 069 counterpart: no window, a day that is no longer offered, or a
 * window that has closed or filled is a refusal, and the shopper chooses again.
 */
export function resolveEffyWindow(
  q: ServicedQuote & { effyWindows: EffyWindowsQuote },
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
  const packages = q.packages.map((p): PackageDelivery => ({
    shopId: p.shopId, method, promisedDay: day.date, slotId: slot.id, windowStart: slot.start, windowEnd: slot.end,
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
