"use client"

import { useState } from "react"

import type { AddressDTO } from "@effy/shared-types"
import { Badge, Button } from "@effy/design-system/ui"

import { AddressFormModal } from "@/app/(account)/addresses/_components/AddressFormModal"
import { addressLines, type Address } from "@/lib/addresses/model"

/**
 * The checkout saved-address picker (023 US1–US3). Reused verbatim for BOTH shipping and billing.
 *
 * Shows the selected address as a summary row (a LIST/picker, never a card — FR-022); "Change" reveals
 * the saved list as radio options with the default badged; "Add a new address" opens the shared 022
 * responsive form (dialog on large screens / drawer on small) and, on save, hands the created address
 * back to the parent to select for this order.
 *
 * The component is deliberately telemetry-free and identity-free: the list is the customer's own
 * (FR-021, resolved server-side from the token), and selection here is per-order — it NEVER mutates the
 * saved default (FR-006). The parent owns the selection state and any analytics.
 */
export function AddressPicker({
  addresses,
  selectedId,
  onSelect,
  onAddressAdded,
  idPrefix,
  busy = false,
}: {
  addresses: AddressDTO[]
  selectedId: string | null
  /** A switch to an existing saved address (radio). */
  onSelect: (id: string) => void
  /** A newly created address — the parent appends it and decides to select it. */
  onAddressAdded: (address: AddressDTO) => void
  /** Distinguishes the shipping vs billing radio groups on one page. */
  idPrefix: string
  busy?: boolean
}) {
  // Start expanded when there is nothing selected yet (e.g. a just-revealed billing picker) so the
  // list is immediately visible; start collapsed on a pre-selected address (the everyday summary).
  const [expanded, setExpanded] = useState(selectedId == null)
  const [formOpen, setFormOpen] = useState(false)

  const selected = addresses.find((a) => a.id === selectedId) ?? null

  function handleSaved(created: Address) {
    onAddressAdded(created)
    setExpanded(false)
  }

  // Empty book → prompt to add one; there is no selection to summarise, and pay stays blocked (FR-007).
  if (addresses.length === 0) {
    return (
      <div>
        <p className="text-sm text-muted-foreground" data-testid={`${idPrefix}-empty`}>
          Add an address to continue.
        </p>
        <Button type="button" variant="outline" className="mt-3" onClick={() => setFormOpen(true)}>
          Add an address
        </Button>
        <AddressFormModal open={formOpen} onOpenChange={setFormOpen} onSaved={handleSaved} />
      </div>
    )
  }

  return (
    <div>
      {!expanded ? (
        <div className="flex items-start justify-between gap-4 rounded-md border p-3">
          <AddressSummary address={selected} />
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="shrink-0 text-sm font-medium text-primary hover:underline"
          >
            Change
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <ul className="space-y-2" role="radiogroup" aria-label="Saved addresses">
            {addresses.map((a) => (
              <li key={a.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-accent">
                  <input
                    type="radio"
                    name={`${idPrefix}-address`}
                    className="mt-1"
                    checked={selectedId === a.id}
                    disabled={busy}
                    onChange={() => {
                      onSelect(a.id)
                      setExpanded(false)
                    }}
                  />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{a.recipientName}</span>
                      {a.isDefault && <Badge variant="success">Default</Badge>}
                    </span>
                    <span className="block text-muted-foreground">{addressLines(a)}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <Button type="button" variant="outline" onClick={() => setFormOpen(true)}>
            Add a new address
          </Button>
        </div>
      )}

      <AddressFormModal open={formOpen} onOpenChange={setFormOpen} onSaved={handleSaved} />
    </div>
  )
}

/** The selected-address summary shown when the picker is collapsed. Not a card (FR-022). */
function AddressSummary({ address }: { address: AddressDTO | null }) {
  if (!address) {
    return <p className="text-sm text-muted-foreground">No address selected.</p>
  }
  return (
    <div className="min-w-0 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{address.recipientName}</span>
        {address.isDefault && <Badge variant="success">Default</Badge>}
      </div>
      <p className="text-muted-foreground">{addressLines(address)}</p>
    </div>
  )
}
