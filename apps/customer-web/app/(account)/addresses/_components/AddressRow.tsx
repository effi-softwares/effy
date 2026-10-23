"use client"

import { Pencil, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { chipForLabel, type Address } from "@/lib/addresses/model"

import { CoverageNote } from "./CoverageNote"

/**
 * One saved address: its name, who and where, who delivers there (`CoverageNote`, the server's answer),
 * and its actions. "Set as default" is absent on the default address.
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
  const title = chip ? (chip === "Other" ? address.label : chip) : address.recipientName
  return (
    <li className="flex flex-col rounded-lg border bg-card shadow-xs">
      <div className="flex flex-1 flex-col gap-1 p-6">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{title}</span>
          {address.isDefault && (
            <Badge variant="secondary" data-testid="default-badge">
              Default
            </Badge>
          )}
        </p>
        <p className="text-sm text-muted-foreground">
          {[chip ? address.recipientName : null, address.phone].filter(Boolean).join(" · ")}
        </p>
        <p className="text-sm text-muted-foreground">{[address.line1, address.line2].filter(Boolean).join(", ")}</p>
        <p className="text-sm text-muted-foreground">
          {[address.city, address.region, address.postalCode].filter(Boolean).join(" ")}
        </p>
        <CoverageNote coverage={address.coverage} className="mt-4" />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t px-6 py-4">
        <Button type="button" variant="outline" size="sm" onClick={onEdit} data-testid="address-row-body" aria-label={`Edit address for ${address.recipientName}`}>
          <Pencil aria-hidden="true" />
          Edit
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onDelete}>
          <Trash2 aria-hidden="true" />
          Delete
        </Button>
        {!address.isDefault && (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onSetDefault}>
            Set as default
          </Button>
        )}
      </div>
    </li>
  )
}
