import type { DeliveryFeeBreakdownDTO, DeliveryFeeDTO, DeliveryFeeLineDTO } from "@effy/shared-types";

import { formatCents } from "../lib/money";
import type { FeeLine } from "./engine";
import type { PricedFee } from "./quote";

/**
 * A priced fee's two wire forms. `feeDTO`: lines and a total for a customer. `storedBreakdown`: the plan,
 * inputs and every step, kept in `"order".delivery_fee_breakdown` for staff only (customers and shops
 * read `->'lines'`).
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

