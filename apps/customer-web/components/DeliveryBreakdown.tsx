import type { OrderFulfillmentDTO } from "@effy/shared-types"

import { formatMoney } from "@/lib/money"

/**
 * The per-package delivery breakdown on the receipt (021 US3/US5).
 *
 * 021 evolves the hidden-fulfilment doctrine: the SPLIT is shown, the sellers are not (FR-019). So the
 * receipt may honestly say "your order arrives in N packages" and show, per anonymous package, the
 * service level the customer bought, its promised window, and its snapshotted fee — but NEVER a shop
 * name, code, or location (SC-006), and never who carries it (SC-007). Only portions that carry a 021
 * delivery snapshot are shown; pre-021 orders render nothing here.
 */
export function DeliveryBreakdown({
  fulfillments,
  currency,
}: {
  fulfillments: readonly OrderFulfillmentDTO[]
  currency: string
}) {
  const priced = fulfillments.filter((f) => f.deliveryServiceLevel != null)
  if (priced.length === 0) return null

  const labelled = priced.length > 1

  return (
    <section className="mt-6 text-sm">
      <h2 className="font-medium">Delivery</h2>
      <ul className="mt-2 divide-y rounded-lg border">
        {priced.map((f, i) => (
          <li key={i} className="flex items-start justify-between gap-4 p-4">
            <span>
              {labelled && <span className="font-medium">Package {i + 1} · </span>}
              {f.deliveryServiceLevel}
              {f.deliveryWindow ? (
                <span className="block text-muted-foreground">{f.deliveryWindow}</span>
              ) : null}
            </span>
            <span className="font-medium">
              {f.deliveryFeeAmount ? formatMoney(f.deliveryFeeAmount, currency) : "—"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
