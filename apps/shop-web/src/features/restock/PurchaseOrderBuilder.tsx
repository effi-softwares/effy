import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"

import {
  Button,
  Input,
  Label,
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@effy/design-system/ui"
import type { LowStockRowDTO } from "@effy/shared-types"

import { productMutationError } from "@/features/catalog/errorText"

import { suppliersQuery, useCreatePurchaseOrder } from "./queries"

interface Draft {
  quantity: string
  unitCost: string
}

/**
 * Build a purchase order from the restock queue (US6, T058).
 *
 * ⚠ IT IS SEEDED FROM THE ROWS THE OPERATOR WAS ALREADY LOOKING AT. The point of the feature is that
 * restocking becomes a decision from a list rather than from a customer complaint — so the flow starts
 * at the shortage, not at a blank order form.
 *
 * ⚠ THE RUNNING TOTAL IS A PREVIEW AND SAYS SO WHEN IT CANNOT BE COMPUTED. A line with no unit cost
 * makes the total unknowable, not zero, and the server returns `null` for exactly that reason. A
 * figure that silently omits the unpriced lines is a wrong number an operator will act on.
 */
export function PurchaseOrderBuilder({
  rows,
  open,
  onOpenChange,
}: {
  rows: readonly LowStockRowDTO[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const suppliers = useQuery(suppliersQuery)
  const create = useCreatePurchaseOrder()

  const [supplierId, setSupplierId] = useState("")
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [error, setError] = useState<string | null>(null)

  const active = (suppliers.data ?? []).filter((s) => s.status === "active")

  // Only rows for the chosen supplier, plus unassigned ones — ordering an unassigned product from a
  // supplier is a legitimate way to assign it for the first time.
  const candidates = useMemo(
    () => rows.filter((r) => r.supplierId === supplierId || r.supplierId === null),
    [rows, supplierId],
  )

  const chosen = candidates.filter((r) => Number(drafts[r.productId]?.quantity ?? 0) > 0)

  const total = useMemo(() => {
    if (chosen.length === 0) return null
    if (chosen.some((r) => !drafts[r.productId]?.unitCost?.trim())) return null
    const cents = chosen.reduce((sum, r) => {
      const d = drafts[r.productId]!
      return sum + Math.round(Number(d.unitCost) * 100) * Number(d.quantity)
    }, 0)
    return (cents / 100).toFixed(2)
  }, [chosen, drafts])

  function set(productId: string, patch: Partial<Draft>) {
    setDrafts((d) => ({
      ...d,
      [productId]: { quantity: "", unitCost: "", ...d[productId], ...patch },
    }))
  }

  function submit() {
    setError(null)
    create.mutate(
      {
        supplierId,
        lines: chosen.map((r) => ({
          productId: r.productId,
          orderedQuantity: Number(drafts[r.productId]!.quantity),
          unitCost: drafts[r.productId]?.unitCost?.trim() || null,
        })),
      },
      {
        onSuccess: () => {
          setDrafts({})
          onOpenChange(false)
        },
        onError: (e) => setError(productMutationError(e)),
      },
    )
  }

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange}>
      <ResponsiveModalContent className="sm:max-w-2xl">
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>New purchase order</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            Pick a supplier, then say how many of each you want. Nothing is sent to the supplier until
            you send it.
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="po-supplier">Supplier</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger id="po-supplier">
                <SelectValue placeholder="Choose a supplier…" />
              </SelectTrigger>
              <SelectContent>
                {active.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {active.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No suppliers yet — add one first.
              </p>
            ) : null}
          </div>

          {supplierId ? (
            <ul className="divide-y rounded-md border">
              {candidates.map((r) => (
                <li key={r.productId} className="flex flex-wrap items-end gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.name}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {r.onHand} in stock
                      {r.supplierId === null ? " · not yet assigned to a supplier" : ""}
                    </span>
                  </span>
                  <span className="space-y-1">
                    <Label htmlFor={`q-${r.productId}`} className="text-xs">
                      Order
                    </Label>
                    <Input
                      id={`q-${r.productId}`}
                      inputMode="numeric"
                      className="w-20"
                      value={drafts[r.productId]?.quantity ?? ""}
                      onChange={(e) => set(r.productId, { quantity: e.target.value })}
                    />
                  </span>
                  <span className="space-y-1">
                    <Label htmlFor={`c-${r.productId}`} className="text-xs">
                      Unit cost
                    </Label>
                    <Input
                      id={`c-${r.productId}`}
                      inputMode="decimal"
                      placeholder="—"
                      className="w-24"
                      value={drafts[r.productId]?.unitCost ?? ""}
                      onChange={(e) => set(r.productId, { unitCost: e.target.value })}
                    />
                  </span>
                </li>
              ))}
              {candidates.length === 0 ? (
                <li className="text-muted-foreground px-3 py-6 text-center text-sm">
                  Nothing from this supplier needs restocking.
                </li>
              ) : null}
            </ul>
          ) : null}

          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
        </div>

        <ResponsiveModalFooter>
          <span className="mr-auto text-sm">
            {chosen.length === 0 ? (
              <span className="text-muted-foreground">Nothing selected</span>
            ) : total === null ? (
              <>
                <span className="tabular-nums">{chosen.length}</span> lines ·{" "}
                {/* ⚠ Not "0.00". An unknown total and a zero total are different facts. */}
                <span className="text-muted-foreground">total unknown until every line has a cost</span>
              </>
            ) : (
              <>
                <span className="tabular-nums">{chosen.length}</span> lines ·{" "}
                <span className="font-medium tabular-nums">AUD {total}</span>
              </>
            )}
          </span>
          <Button variant="ghost" disabled={create.isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!supplierId || chosen.length === 0 || create.isPending} onClick={submit}>
            {create.isPending ? "Creating…" : "Create draft"}
          </Button>
        </ResponsiveModalFooter>
      </ResponsiveModalContent>
    </ResponsiveModal>
  )
}
