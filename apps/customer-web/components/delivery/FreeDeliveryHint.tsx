import { DELIVERY_FEE_WORDS } from "@effy/shared-types"

import { formatMoney } from "@/lib/money"

/**
 * "Spend $N more for free delivery" (077 FR-029), or that it has been earned — in the shared words.
 *
 * Renders NOTHING when the business has set no free-delivery amount: a hint about a rule that does
 * not exist would be a promise. ⚠ On the website the delivery postcode is first known at checkout,
 * so this is shown there; the mobile cart shows it from the address the shopper has chosen.
 */
export function FreeDeliveryHint({
  remainingAmount,
  freeApplied,
  currency,
}: {
  /** How much more the basket needs; null when no amount is set or it is reached. */
  remainingAmount: string | null | undefined
  /** The fee for the chosen delivery is free because the amount was reached. */
  freeApplied: boolean
  currency: string
}) {
  if (freeApplied) return <p className="text-sm font-medium text-success">{DELIVERY_FEE_WORDS.freeReached}</p>
  if (!remainingAmount) return null
  return (
    <p className="text-sm text-muted-foreground">
      {DELIVERY_FEE_WORDS.spendMore.replace("{amount}", formatMoney(remainingAmount, currency))}
    </p>
  )
}
