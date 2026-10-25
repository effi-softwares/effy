"use client"

import { Plus } from "lucide-react"
import { useState } from "react"

import type { AddressDTO } from "@effy/shared-types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import { AddressForm } from "@/app/(account)/addresses/_components/AddressForm"
import { CoverageNote } from "@/app/(account)/addresses/_components/CoverageNote"
import { addressLines, type Address } from "@/lib/addresses/model"

/**
 * The checkout address picker, for shipping and billing: the chosen address as a summary row, "Change"
 * for the saved list as radio options, and "Add a new address" for the shared address form inline. A
 * choice is for this order and never changes the saved default; the parent owns selection and analytics.
 */
export function AddressPicker({
  addresses,
  selectedId,
  onSelect,
  onAddressAdded,
  idPrefix,
  busy = false,
  showCoverage = false,
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
  /**
   * Show who delivers to each address. For the delivery picker only: a billing address is
   * where the card statement goes, and "we can't deliver there" would be a wrong thing to say of it.
   */
  showCoverage?: boolean
}) {
  // Start expanded when there is nothing selected yet (e.g. a just-revealed billing picker) so the
  // list is immediately visible; start collapsed on a pre-selected address (the everyday summary).
  const [expanded, setExpanded] = useState(selectedId == null)
  const [formOpen, setFormOpen] = useState(false)

  const selected = addresses.find((a) => a.id === selectedId) ?? null

  function handleSaved(created: Address) {
    onAddressAdded(created)
    setFormOpen(false)
    setExpanded(false)
  }

  // Empty book → prompt to add one; there is no selection to summarise, and pay stays blocked.
  if (addresses.length === 0) {
    return (
      <div>
        {formOpen ? (
          <AddressForm onSaved={handleSaved} onCancel={() => setFormOpen(false)} />
        ) : (
          <>
            <p className="text-sm text-muted-foreground" data-testid={`${idPrefix}-empty`}>
              Add an address to continue.
            </p>
            <Button type="button" variant="outline" className="mt-3" onClick={() => setFormOpen(true)}>
              Add an address
            </Button>
          </>
        )}
      </div>
    )
  }

  return (
    <div>
      {!expanded ? (
        <div className="flex items-start justify-between gap-4 rounded-md border border-primary bg-primary-muted/40 p-4">
          <AddressSummary address={selected} showCoverage={showCoverage} />
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="shrink-0 text-sm font-medium text-primary underline underline-offset-4"
          >
            Change
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <ul className="grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="Saved addresses">
            {addresses.map((a) => (
              <li key={a.id}>
                <label className="flex h-full cursor-pointer items-start gap-3 rounded-md border p-4 shadow-xs hover:bg-accent has-checked:border-primary">
                  <input
                    type="radio"
                    name={`${idPrefix}-address`}
                    className="mt-1 accent-primary"
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
                      {a.isDefault && <Badge variant="secondary">Default</Badge>}
                    </span>
                    <span className="block text-muted-foreground">{addressLines(a)}</span>
                    {showCoverage ? <CoverageNote coverage={a.coverage} /> : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {formOpen ? (
            <div className="rounded-md border p-4">
              <h3 className="mb-3 text-sm font-medium">Add a delivery address</h3>
              <AddressForm onSaved={handleSaved} onCancel={() => setFormOpen(false)} />
            </div>
          ) : (
            <Button type="button" variant="outline" onClick={() => setFormOpen(true)}>
              <Plus aria-hidden="true" />
              Add a new address
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/** The selected-address summary shown when the picker is collapsed. Not a card. */
function AddressSummary({ address, showCoverage }: { address: AddressDTO | null; showCoverage: boolean }) {
  if (!address) {
    return <p className="text-sm text-muted-foreground">No address selected.</p>
  }
  return (
    <div className="min-w-0 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{address.recipientName}</span>
        {address.isDefault && <Badge variant="secondary">Default</Badge>}
      </div>
      <p className="text-muted-foreground">{addressLines(address)}</p>
      {showCoverage ? <CoverageNote coverage={address.coverage} /> : null}
    </div>
  )
}
