import type { DeliveryFeeBreakdownDTO, DeliveryFeeDTO, DeliveryFeeLineDTO, DeliveryOfferDTO } from "@effy/shared-types";

import { formatCents } from "../lib/money";
import type { FeeLine } from "./engine";
import type { Plan } from "./plan";
import type { PricedFee } from "./quote";

/**
 * A priced fee in its two wire forms (077) — written ONCE so checkout, the order page, the receipt
 * and the back-office simulator cannot each grow their own.
 *
 *   `feeDTO`           what a CUSTOMER is given: lines and a total. Nothing else.
 *   `storedBreakdown`  what the ORDER keeps: the plan, the inputs and every step, for staff.
 *
 * ⚠ The second holds a distance, a weight and the business's prices. It goes into
 * `"order".delivery_fee_breakdown` and out through the staff gateway only; a customer or shop route
 * that needs the lines reads `delivery_fee_breakdown->'lines'` and never the column whole.
 */

export function lineDTOs(lines: readonly FeeLine[]): DeliveryFeeLineDTO[] {
  return lines.map((l) => ({ kind: l.kind, amount: formatCents(l.cents) }));
}

export function feeDTO(fee: PricedFee): DeliveryFeeDTO {
  return { lines: lineDTOs(fee.lines), totalAmount: formatCents(fee.totalCents) };
}

export function storedBreakdown(fee: PricedFee): DeliveryFeeBreakdownDTO {
  const b = fee.breakdown;
  return {
    v: 1,
    kind: b.kind,
    plan: { id: fee.planId, name: fee.planName },
    inputs: { km: b.km, grams: b.grams, basketCents: b.basketCents, slotId: fee.slotId, windowIsToday: fee.windowIsToday },
    parts: {
      baseCents: b.baseCents,
      distanceCents: b.distanceCents,
      distanceBandUpperKm: b.distanceBandUpperKm,
      weightCents: b.weightCents,
      weightBandUpperGrams: b.weightBandUpperGrams,
      premiumCents: b.premiumCents,
      rawCents: b.rawCents,
      roundedCents: b.roundedCents,
      clamp: b.clamp,
      deliveryCents: b.deliveryCents,
      freeApplied: b.freeApplied,
      smallOrderCents: b.smallOrderCents,
      totalCents: b.totalCents,
    },
    lines: lineDTOs(fee.lines),
  };
}

/**
 * The business's public basket offer under a plan (077): what a cart can say before there is an
 * address and a window to price. ⚠ Three amounts that depend on the basket alone — never a fee.
 */
export function offerDTO(plan: Plan): DeliveryOfferDTO {
  return {
    freeDeliveryOverAmount: plan.freeOverCents === null ? null : formatCents(plan.freeOverCents),
    smallOrderUnderAmount: plan.smallOrderUnderCents === null ? null : formatCents(plan.smallOrderUnderCents),
    smallOrderFeeAmount: plan.smallOrderUnderCents === null ? null : formatCents(plan.smallOrderFeeCents),
  };
}
