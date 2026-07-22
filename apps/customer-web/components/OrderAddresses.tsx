import type { OrderAddressDTO } from "@effy/shared-types"

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
}: {
  shipping: OrderAddressDTO
  billing?: OrderAddressDTO | null
}) {
  return (
    <>
      <section className="mt-6 text-sm">
        <h2 className="font-medium">Delivering to</h2>
        <AddressLines address={shipping} />
      </section>

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
