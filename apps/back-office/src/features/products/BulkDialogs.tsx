import { useState } from "react"

import { HOLD_REASON_MAX, type BulkProductsResultDTO, type MarginDTO } from "@effy/shared-types"
import {
  Alert,
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Label,
  Textarea,
} from "@effy/design-system/ui"

import { MarginField } from "@/features/product-review/MarginField"
import { toMargin, type MarginEntry } from "@/features/product-review/model"

import { useBulkProducts } from "./queries"
import { productErrorText } from "./words"

/** What an action is about: the products as the list showed them (their versions travel with them). */
export interface Target {
  productId: string
  name: string
  version: string
  shopPriceFrom: string | null
  margin: MarginDTO | null
}

export type BulkAction = "hold" | "release" | "margin"

const TITLE: Record<BulkAction, (n: number) => string> = {
  hold: (n) => (n === 1 ? "Hold this product?" : `Hold ${n} products?`),
  release: (n) => (n === 1 ? "Release this product?" : `Release ${n} products?`),
  margin: (n) => (n === 1 ? "Set the margin" : `Set one margin for ${n} products`),
}

const DESCRIPTION: Record<BulkAction, string> = {
  hold: "They come off sale straight away and their shops cannot put them back. Each shop is told, with your reason.",
  release: "Each goes back to the state it was in when it was held, and its shop is told.",
  margin: "Customers pay the shop's price plus this margin, on every size. Shops are not told - the margin is Effy's.",
}

/**
 * One dialog for one product or many: hold, release or set the margin. Each product is changed on its
 * own, so the ones that could not be are listed with why (FR-028).
 */
export function BulkDialog({
  action,
  targets,
  onClose,
  onDone,
}: {
  action: BulkAction | null
  targets: readonly Target[]
  onClose: () => void
  onDone: (result: BulkProductsResultDTO) => void
}) {
  const bulk = useBulkProducts()
  const first = targets[0]?.margin
  const [reason, setReason] = useState("")
  const [margin, setMargin] = useState<MarginEntry>({ kind: first?.kind ?? "percent", value: first?.value ?? "" })
  const [error, setError] = useState<string | null>(null)
  const open = action !== null && targets.length > 0
  const ready = action === "hold" ? reason.trim() !== "" : action === "margin" ? toMargin(margin) !== null : true

  function submit() {
    if (!action) return
    setError(null)
    bulk.mutate(
      {
        action,
        items: targets.map((t) => ({ productId: t.productId, version: t.version })),
        ...(action === "hold" ? { reason: reason.trim() } : {}),
        ...(action === "margin" ? { margin: toMargin(margin)! } : {}),
      },
      {
        onSuccess: (r) => {
          setReason("")
          onDone(r)
        },
        onError: (err) => setError(productErrorText(err)),
      },
    )
  }

  if (!action) return null
  return (
    <AlertDialog open={open} onOpenChange={(o) => (!o && !bulk.isPending ? onClose() : null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{TITLE[action](targets.length)}</AlertDialogTitle>
          <AlertDialogDescription>{DESCRIPTION[action]}</AlertDialogDescription>
        </AlertDialogHeader>
        {targets.length > 1 ? (
          <ul className="max-h-32 overflow-auto text-sm text-muted-foreground">
            {targets.map((t) => (
              <li key={t.productId} className="truncate">
                {t.name}
              </li>
            ))}
          </ul>
        ) : null}
        {action === "hold" ? (
          <div className="space-y-2">
            <Label htmlFor="bulk-hold-reason">Why?</Label>
            <Textarea
              id="bulk-hold-reason"
              rows={3}
              maxLength={HOLD_REASON_MAX}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. The maker has recalled this batch."
            />
            <p className="mt-0.5 block text-sm text-muted-foreground">
              Each shop sees this, from Effy - not from you by name.
            </p>
          </div>
        ) : null}
        {action === "margin" ? (
          <MarginField
            id="bulk-margin"
            shopPrices={targets.flatMap((t) => (t.shopPriceFrom ? [t.shopPriceFrom] : []))}
            value={margin}
            onChange={setMargin}
            disabled={bulk.isPending}
          />
        ) : null}
        {error ? (
          <p role="alert" className="text-sm font-medium">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={bulk.isPending}>Cancel</AlertDialogCancel>
          <Button
            variant={action === "hold" ? "destructive" : "default"}
            disabled={bulk.isPending || !ready}
            onClick={submit}
          >
            {action === "hold" ? "Hold" : action === "release" ? "Release" : "Set margin"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** After a bulk action: how many changed, and each one that did not, with why. */
export function BulkResult({
  result,
  names,
  onDismiss,
}: {
  result: BulkProductsResultDTO
  names: ReadonlyMap<string, string>
  onDismiss: () => void
}) {
  return (
    <Alert role="status" variant="info" className="flex flex-wrap items-start justify-between gap-3">
      <div className="grid gap-1">
        <p className="font-medium">
          {result.done.length} changed{result.refused.length > 0 ? `, ${result.refused.length} not changed` : ""}.
        </p>
        {result.refused.length > 0 ? (
          <ul className="list-disc pl-5 text-sm">
            {result.refused.map((r) => (
              <li key={r.productId}>
                {names.get(r.productId) ?? "A product"}: {r.reason}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <Button variant="ghost" size="sm" onClick={onDismiss}>
        Dismiss
      </Button>
    </Alert>
  )
}
