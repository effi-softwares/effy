import { useState } from "react"

import type { BackOfficeProductDTO, BackOfficeVariantDTO, OperatorStockReason } from "@effy/shared-types"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Input,
  Label,
  Switch,
  ToggleGroup,
  ToggleGroupItem,
} from "@effy/design-system/ui"

import { useSetStockCount, useSetVariantState } from "./queries"
import { productErrorText } from "./words"

const REASON_WORDS: Record<OperatorStockReason, string> = {
  received: "Delivery received",
  correction: "Count corrected",
  damage: "Damaged",
  expiry: "Expired",
}

/** One size's own actions on the product page: on or off sale, and its count when the shop counts it. */
export function SizeActions({ product, variant }: { product: BackOfficeProductDTO; variant: BackOfficeVariantDTO }) {
  const setState = useSetVariantState(product.productId)
  const [error, setError] = useState<string | null>(null)
  const [counting, setCounting] = useState(false)
  const onSale = product.variants.filter((v) => v.state === "active").length
  const last = variant.state === "active" && onSale === 1
  const heldOff = product.hold !== null && variant.state !== "active"

  return (
    <div className="flex items-center justify-end gap-2">
      {product.variants.length > 1 ? (
        <Switch
          checked={variant.state === "active"}
          aria-label={`${variant.label ?? "This size"} on sale`}
          disabled={setState.isPending || last || heldOff}
          title={
            heldOff
              ? "The product is held — release it before a size goes back on sale"
              : last
                ? "The last size on sale — hold the product instead"
                : undefined
          }
          onCheckedChange={(on) => {
            setError(null)
            setState.mutate(
              { variantId: variant.id, body: { version: product.version, state: on ? "active" : "inactive" } },
              { onError: (err) => setError(productErrorText(err)) },
            )
          }}
        />
      ) : null}
      {variant.stockTracked ? (
        <Button variant="ghost" size="sm" onClick={() => setCounting(true)}>
          Set count
        </Button>
      ) : null}
      {error ? (
        <span role="alert" className="text-sm font-medium">
          {error}
        </span>
      ) : null}
      {counting ? <CountDialog product={product} variant={variant} onClose={() => setCounting(false)} /> : null}
    </div>
  )
}

function CountDialog({
  product,
  variant,
  onClose,
}: {
  product: BackOfficeProductDTO
  variant: BackOfficeVariantDTO
  onClose: () => void
}) {
  const setCount = useSetStockCount(product.shop.id)
  const [count, setCountText] = useState(String(variant.stockOnHand ?? 0))
  const [reason, setReason] = useState<OperatorStockReason>("correction")
  const [error, setError] = useState<string | null>(null)
  const valid = /^\d{1,6}$/.test(count.trim())

  return (
    <AlertDialog open onOpenChange={(o) => (!o && !setCount.isPending ? onClose() : null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Set the count{variant.label ? ` — ${variant.label}` : ""}</AlertDialogTitle>
          <AlertDialogDescription>
            On {product.shop.name}'s behalf. It is recorded as changed by Effy, and the shop sees it at once.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-3">
          <div className="space-y-2">
            <Label htmlFor="stock-count">In stock</Label>
            <Input
              id="stock-count"
              inputMode="numeric"
              className="w-32"
              value={count}
              onChange={(e) => setCountText(e.target.value)}
            />
          </div>
          <ToggleGroup
            type="single"
            variant="outline"
            aria-label="Why"
            value={reason}
            onValueChange={(v) => v && setReason(v as OperatorStockReason)}
          >
            {(Object.keys(REASON_WORDS) as OperatorStockReason[]).map((r) => (
              <ToggleGroupItem key={r} value={r} className="px-3">
                {REASON_WORDS[r]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        {error ? (
          <p role="alert" className="text-sm font-medium">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={setCount.isPending}>Cancel</AlertDialogCancel>
          <Button
            disabled={!valid || setCount.isPending}
            onClick={() =>
              setCount.mutate(
                { variantId: variant.id, body: { onHand: Number(count.trim()), reason, note: "Set by Effy" } },
                { onSuccess: onClose, onError: (err) => setError(productErrorText(err)) },
              )
            }
          >
            Save count
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
