"use client"

import { useState } from "react"

import { Button } from "@effy/design-system/ui"

import { deleteAddress, setDefault } from "@/lib/addresses/repo"
import { toAddress, type Address } from "@/lib/addresses/model"
import { capture } from "@/lib/telemetry"

import { AddressFormModal } from "./AddressFormModal"
import { AddressRow } from "./AddressRow"
import { DeleteAddressDialog } from "./DeleteAddressDialog"

/**
 * The address book (US1–US5). Follows the FavoritesList pattern — the page fetches the initial list
 * server-side, this client component holds it in `useState` and reflects every mutation locally so the
 * list updates without a reload (FR-008). NO TanStack Query (this surface stays dependency-free).
 *
 * The one form serves add and edit; the row body opens edit, while set-default and delete are distinct
 * per-row controls (FR-017a). Deleting the default while others exist is blocked with a reassign prompt
 * (client guard + server 409 backstop, FR-016a).
 */
export function AddressList({ initial }: { initial: Address[] }) {
  const [items, setItems] = useState<Address[]>(initial.map(toAddress))
  const [busyId, setBusyId] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Address | undefined>(undefined)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Address | null>(null)
  const [deleteBlocked, setDeleteBlocked] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)

  function openAdd() {
    setEditing(undefined)
    setFormOpen(true)
  }

  function openEdit(address: Address) {
    setEditing(address)
    setFormOpen(true)
  }

  /** Reflect a created or edited address into the local list, keeping exactly one default. */
  function onSaved(saved: Address) {
    setItems((prev) => {
      const exists = prev.some((a) => a.id === saved.id)
      const next = exists ? prev.map((a) => (a.id === saved.id ? saved : a)) : [...prev, saved]
      // If the saved row is default, no other row may remain default (mirrors the server CTE).
      return saved.isDefault ? next.map((a) => (a.id === saved.id ? a : { ...a, isDefault: false })) : next
    })
  }

  async function makeDefault(address: Address) {
    if (address.isDefault) return // idempotent no-op (FR-014) — no request needed
    setBusyId(address.id)
    const result = await setDefault(address.id)
    setBusyId(null)
    if (result.ok) {
      onSaved(result.address)
      capture({ name: "address_default_set" })
    }
  }

  function requestDelete(address: Address) {
    const isBlocked = address.isDefault && items.length > 1
    setDeleteTarget(address)
    setDeleteBlocked(isBlocked)
    setDeleteOpen(true)
    if (isBlocked) capture({ name: "address_delete_default_blocked" })
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleteBusy(true)
    const result = await deleteAddress(deleteTarget.id)
    setDeleteBusy(false)
    if (result.ok) {
      setItems((prev) => prev.filter((a) => a.id !== deleteTarget.id))
      capture({ name: "address_deleted" })
      setDeleteOpen(false)
      setDeleteTarget(null)
    } else if (result.status === 409) {
      // Backstop: a racing device set this default again between the guard and the request.
      setDeleteBlocked(true)
      capture({ name: "address_delete_default_blocked" })
    }
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={openAdd} data-testid="add-address">
          Add address
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center" data-testid="addresses-empty">
          <p className="text-muted-foreground">You haven’t saved any addresses yet.</p>
          <button
            type="button"
            onClick={openAdd}
            className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
          >
            Add your first address
          </button>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((a) => (
            <AddressRow
              key={a.id}
              address={a}
              busy={busyId === a.id}
              onEdit={() => openEdit(a)}
              onSetDefault={() => makeDefault(a)}
              onDelete={() => requestDelete(a)}
            />
          ))}
        </ul>
      )}

      <AddressFormModal open={formOpen} onOpenChange={setFormOpen} address={editing} onSaved={onSaved} />

      <DeleteAddressDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        blocked={deleteBlocked}
        busy={deleteBusy}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
