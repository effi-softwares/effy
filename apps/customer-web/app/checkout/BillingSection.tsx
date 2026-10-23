"use client"

import type { AddressDTO } from "@effy/shared-types"
import { Label, Switch } from "@/components/ui/form"

import { AddressPicker } from "./AddressPicker"

/**
 * The billing section: "Billing address same as shipping", on by default (no `billingAddressId` is sent;
 * the order stores null). Off reveals the same picker for a different address, required before paying;
 * switching back on discards it. The toggle and the chosen id live in {@link CheckoutFlow}.
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
        <Label htmlFor="billing-same" className="text-base leading-snug font-semibold">
          Billing address same as shipping
        </Label>
        <Switch id="billing-same" checked={sameAsShipping} onCheckedChange={onSameAsShippingChange} />
      </div>

      {!sameAsShipping && (
        <div className="mt-4">
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">Billing address</h3>
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
