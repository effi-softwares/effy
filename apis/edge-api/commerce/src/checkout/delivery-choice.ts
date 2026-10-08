/**
 * Turning a shopper's delivery preference into what each package will actually get (047, 069).
 * Pure: every input is passed in, including the clock.
 */
import {
  METHOD_SAME_DAY, METHOD_STANDARD, offersSameDay, type OpenSlot, type PricedFee, type QuoteResult,
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

type ServicedQuote = Extract<QuoteResult, { serviced: true }>;

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

  return { packages, hold: slot ? { slotId: slot.id, now } : null, fee };
}
