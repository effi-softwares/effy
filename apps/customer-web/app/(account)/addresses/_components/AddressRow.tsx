"use client"

import { Badge } from "@effy/design-system/ui"

import { addressLines, chipForLabel, type Address } from "@/lib/addresses/model"

/**
 * One row of the address book (US1/US3/US4/US5).
 *
 * ⚠ The **row body** is the edit affordance (FR-017a) — the whole label/recipient/lines block is a
 * single button that opens the pre-filled form. **Set as default** and **Delete** are distinct
 * controls alongside it and MUST NOT open the editor; they sit outside the body button, so there is
 * no nested-interactive ambiguity and no event-propagation trickery to get wrong.
 *
 * A LIST row, not a card (Principle V): the visual container is the parent's `divide-y rounded border`.
 */
export function AddressRow({
  address,
  busy,
  onEdit,
  onSetDefault,
  onDelete,
}: {
  address: Address
  busy: boolean
  onEdit: () => void
  onSetDefault: () => void
  onDelete: () => void
}) {
  const chip = chipForLabel(address.label)

  return (
    <li className="flex items-start gap-4 p-4">
      <button
        type="button"
        onClick={onEdit}
        data-testid="address-row-body"
        className="min-w-0 flex-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Edit address for ${address.recipientName}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          {chip ? (
            <span className="text-sm font-medium">{chip === "Other" ? address.label : chip}</span>
          ) : (
            <span className="text-sm font-medium">{address.recipientName}</span>
          )}
          {address.isDefault && (
            <Badge variant="success" data-testid="default-badge">
              Default
            </Badge>
          )}
        </div>
        {chip && <p className="text-sm text-muted-foreground">{address.recipientName}</p>}
        <p className="truncate text-sm text-muted-foreground">{addressLines(address)}</p>
        {address.phone && <p className="text-sm text-muted-foreground">{address.phone}</p>}
      </button>

      <div className="flex shrink-0 flex-col items-end gap-2 text-sm">
        {!address.isDefault && (
          <button
            type="button"
            disabled={busy}
            onClick={onSetDefault}
            className="font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
          >
            Set as default
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </li>
  )
}
