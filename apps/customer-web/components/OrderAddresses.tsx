import { hasDeliveryInstructions, type DeliveryInstructionsDTO, type OrderAddressDTO } from "@effy/shared-types"

import { handoverLabel } from "@/lib/delivery-instructions"

/**
 * The shipping + billing address block on a receipt / order detail (023 US5).
 *
 * Shipping is ALWAYS shown in full. Billing is shown in full ONLY when the order snapshotted a
 * divergent one (`billing` non-null); a null billing means the customer left it "same as shipping", so
 * the line reads "Same as shipping" rather than repeating the address (FR-016). Both snapshots are
 * immutable — editing/deleting the saved address later never changes what renders here (FR-015).
 *
 * A synchronous, pure component so it is unit-testable — the pages that host it (the receipt and order
 * detail) are async Server Components, which Vitest cannot render.
 */
export function OrderAddresses({
  shipping,
  billing,
  instructions,
}: {
  shipping: OrderAddressDTO
  billing?: OrderAddressDTO | null
  /** 066 — what the shopper told the driver when the order was placed; null/absent when nothing. */
  instructions?: DeliveryInstructionsDTO | null
}) {
  return (
    <>
      <section className="mt-6 text-sm">
        <h2 className="font-medium">Delivering to</h2>
        <AddressLines address={shipping} />
      </section>

      {/* 066 — rendered ONLY when the shopper said something. No placeholder, no "none given": an
          order placed before this existed must look exactly as it did (SC-003).
          ⚠ `note` is customer-authored text and goes through a React text node — never an HTML
          sink. `whitespace-pre-line` keeps the line breaks they typed without interpreting anything. */}
      {hasDeliveryInstructions(instructions) && (
        <section className="mt-6 text-sm">
          <h2 className="font-medium">Delivery instructions</h2>
          {instructions.handover && (
            <p className="mt-1 text-muted-foreground">{handoverLabel(instructions.handover)}</p>
          )}
          {instructions.note && (
            <p className="mt-1 whitespace-pre-line break-words text-muted-foreground">{instructions.note}</p>
          )}
        </section>
      )}

      <section className="mt-6 text-sm">
        <h2 className="font-medium">Billing address</h2>
        {billing ? (
          <AddressLines address={billing} />
        ) : (
          <p className="mt-1 text-muted-foreground">Same as shipping</p>
        )}
      </section>
    </>
  )
}

function AddressLines({ address }: { address: OrderAddressDTO }) {
  return (
    <p className="mt-1 text-muted-foreground">
      {address.recipientName}
      <br />
      {address.line1}
      {address.line2 ? `, ${address.line2}` : ""}
      <br />
      {address.city} {address.postalCode}, {address.country}
    </p>
  )
}
