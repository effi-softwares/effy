import { DELIVERY_FEE_LINE_LABEL, type DeliveryFeeDTO } from "@effy/shared-types"

import { formatMoney } from "@/lib/money"

/**
 * What delivery costs, as the lines the customer is charged (077 FR-028): delivery, a window
 * surcharge, a small-order fee, a free-delivery saving. They sum to the total; a zero line is
 * never sent, so none is drawn.
 *
 * ⚠ The words come from `DELIVERY_FEE_LINE_LABEL` — the file the mobile app, the receipt and the
 * email read too. Writing a label here would be the second wording `P25` exists to catch.
 */
export function DeliveryFeeLines({ fee, currency }: { fee: DeliveryFeeDTO; currency: string }) {
  return (
    <>
      {fee.lines.map((l, i) => {
        const saving = l.amount.startsWith("-")
        return (
          <div key={`${l.kind}-${i}`} className="flex items-center justify-between">
            <dt className={saving ? "text-success" : "text-muted-foreground"}>{DELIVERY_FEE_LINE_LABEL[l.kind]}</dt>
            <dd className={saving ? "font-medium text-success" : "font-medium"}>
              {saving ? `−${formatMoney(l.amount.slice(1), currency)}` : formatMoney(l.amount, currency)}
            </dd>
          </div>
        )
      })}
    </>
  )
}
