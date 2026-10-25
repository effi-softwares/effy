import { useState } from "react"

import type { ProductStockDTO } from "@effy/shared-types"
import {
  Button,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  Input,
  Label,
  Switch,
} from "@effy/design-system/ui"

import { CatalogModal } from "./CatalogModal"
import type { ProductDetail } from "./model"
import { wholeNumber } from "./numberInput"
import { stockErrorText } from "./stockErrorText"
import { useSetStockThreshold, useSetStockTracking } from "./stockQueries"
import { sizeLabelOf } from "./variants"

interface Props {
  detail: ProductDetail
  variantId: string
  stock: ProductStockDTO
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function InventoryRulesDialog({ open, onOpenChange, ...props }: Props) {
  return (
    <CatalogModal open={open} onOpenChange={onOpenChange}>
      <InventoryRulesForm {...props} onClose={() => onOpenChange(false)} />
    </CatalogModal>
  )
}

function InventoryRulesForm({
  detail,
  variantId,
  stock,
  onClose,
}: Omit<Props, "open" | "onOpenChange"> & { onClose: () => void }) {
  const size = sizeLabelOf(detail, variantId)
  const setTracking = useSetStockTracking(variantId)
  const setThreshold = useSetStockThreshold(variantId)

  const [tracked, setTracked] = useState(stock.tracked)
  const [openingCount, setOpeningCount] = useState("")
  const [threshold, setThresholdValue] = useState(stock.threshold === null ? "" : String(stock.threshold))

  const turningOn = tracked && !stock.tracked
  const opening = wholeNumber(openingCount)
  const thresholdValue = threshold.trim() === "" ? null : wholeNumber(threshold)

  const openingValid = !turningOn || (opening !== null && opening >= 0)
  const thresholdValid = threshold.trim() === "" || (thresholdValue !== null && thresholdValue >= 0)
  const canSave = openingValid && thresholdValid

  const pending = setTracking.isPending || setThreshold.isPending
  const failure = setTracking.error ?? setThreshold.error

  async function save() {
    try {
      if (tracked !== stock.tracked) {
        await setTracking.mutateAsync(tracked ? { tracked: true, onHand: opening ?? 0 } : { tracked: false })
      }
      if (tracked && thresholdValue !== stock.threshold) {
        await setThreshold.mutateAsync({ threshold: thresholdValue })
      }
      onClose()
    } catch {
      // the failed mutation's error is shown below
    }
  }

  return (
    <>
      <ResponsiveModalHeader>
        <ResponsiveModalTitle>{size ? `Inventory rules — ${size}` : "Inventory rules"}</ResponsiveModalTitle>
        <ResponsiveModalDescription>
          How this product&apos;s stock behaves. Changing a rule here never moves the count.
        </ResponsiveModalDescription>
      </ResponsiveModalHeader>

      <div className="grid gap-5">
        <div className="border-border flex items-start justify-between gap-4 border-b pb-4">
          <div className="grid gap-1">
            <Label htmlFor="rules-tracked" className="text-[13.5px] font-medium">
              Track stock
            </Label>
            <p className="text-muted-foreground text-[12.5px]">
              Deduct units on every paid order, and stop selling at zero.
            </p>
          </div>
          <Switch
            id="rules-tracked"
            checked={tracked}
            aria-label="Track stock for this product"
            onCheckedChange={setTracked}
          />
        </div>

        {turningOn ? (
          <div className="grid gap-1.5">
            <Label htmlFor="rules-opening">Opening count</Label>
            <Input
              id="rules-opening"
              inputMode="numeric"
              autoComplete="off"
              className="w-32"
              placeholder="0"
              value={openingCount}
              onChange={(e) => setOpeningCount(e.target.value)}
            />
            <p className="text-muted-foreground text-[12.5px]">
              How many you have right now. Required — tracking cannot start from an unknown count.
            </p>
          </div>
        ) : null}

        {tracked ? (
          <div className="grid gap-1.5">
            <Label htmlFor="rules-threshold">Low-stock threshold</Label>
            <Input
              id="rules-threshold"
              inputMode="numeric"
              autoComplete="off"
              className="w-32"
              placeholder="Shop default"
              value={threshold}
              onChange={(e) => setThresholdValue(e.target.value)}
            />
            <p className="text-muted-foreground text-[12.5px]">
              {threshold.trim() === ""
                ? stock.effectiveThreshold === null
                  ? "Leave blank to use the shop default. Nothing is set for this shop yet, so only products that reach zero are reported."
                  : `Leave blank to use the shop default of ${stock.effectiveThreshold}.`
                : "At or below this count, the product is reported as running low. It stays on sale."}
            </p>
          </div>
        ) : null}

        {failure ? (
          <p role="alert" className="text-sm font-medium">
            {stockErrorText(failure)}
          </p>
        ) : null}
      </div>

      <ResponsiveModalFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={() => void save()} disabled={!canSave || pending}>
          {pending ? "Saving…" : "Save rules"}
        </Button>
      </ResponsiveModalFooter>
    </>
  )
}
