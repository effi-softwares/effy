"use client"

import type { AddressDTO } from "@effy/shared-types"
import { Label, Switch } from "@effy/design-system/ui"

import { AddressPicker } from "./AddressPicker"

/**
 * The billing-address section of checkout (023 US4).
 *
 * A "Billing address same as shipping" toggle, ON by default (FR-009). While ON the order's billing
 * mirrors the shipping address — the client sends no `billingAddressId`, so the server stores NULL and
 * the receipt reads "same as shipping". OFF reveals the same saved-address picker + add-new as shipping
 * (FR-011) for choosing a divergent billing address; leaving it unset blocks pay (FR-012, enforced by
 * the parent's continue gate). Toggling back ON discards any divergent choice (FR-013, handled by the
 * parent).
 *
 * A controlled section: the toggle and the chosen billing id live in {@link CheckoutFlow} so the later
 * placement step can send `billingAddressId` only when billing actually diverges.
 */
export function BillingSection({
  sameAsShipping,
  onSameAsShippingChange,
  addresses,
  billingId,
  onBillingSelect,
  onAddressAdded,
}: {
  sameAsShipping: boolean
  onSameAsShippingChange: (value: boolean) => void
  addresses: AddressDTO[]
  billingId: string | null
  onBillingSelect: (id: string) => void
  onAddressAdded: (address: AddressDTO) => void
}) {
  return (
    <section>
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="billing-same" className="text-sm font-medium">
          Billing address same as shipping
        </Label>
        <Switch id="billing-same" checked={sameAsShipping} onCheckedChange={onSameAsShippingChange} />
      </div>

      {!sameAsShipping && (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">Billing address</h3>
          <AddressPicker
            addresses={addresses}
            selectedId={billingId}
            onSelect={onBillingSelect}
            onAddressAdded={onAddressAdded}
            idPrefix="billing"
          />
          {!billingId && (
            <p className="mt-2 text-sm text-muted-foreground">Choose a billing address to continue.</p>
          )}
        </div>
      )}
    </section>
  )
}
