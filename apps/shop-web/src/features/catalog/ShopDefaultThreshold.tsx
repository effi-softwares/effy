import { useState } from "react"

import { useQuery } from "@tanstack/react-query"

import {
  Button,
  ResponsiveModalDescription,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  Input,
  Label,
} from "@effy/design-system/ui"

import { CatalogModal } from "./CatalogModal"
import { stockErrorText } from "./stockErrorText"
import { stockSettingsQuery, useSetStockSettings } from "./stockQueries"

function ShopDefaultThresholdControl() {
  const { data } = useQuery(stockSettingsQuery)
  const saved = data?.defaultThreshold == null ? "" : String(data.defaultThreshold)
  return <ThresholdForm key={saved} saved={saved} />
}

function ThresholdForm({ saved }: { saved: string }) {
  const setSettings = useSetStockSettings()
  const [value, setValue] = useState(saved)

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">Default low-stock threshold</h2>
      <p className="text-sm text-muted-foreground">
        Applies to every tracked product without its own threshold. Leave blank to clear it — nothing is then reported
        as running low, though a product that reaches zero is still reported as out of stock.
      </p>
      <div className="flex items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="default-threshold">Threshold</Label>
          <Input
            id="default-threshold"
            inputMode="numeric"
            className="w-32"
            placeholder="None"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          disabled={setSettings.isPending}
          onClick={() => setSettings.mutate({ defaultThreshold: value.trim() === "" ? null : Number(value) })}
        >
          Save
        </Button>
      </div>
      {setSettings.isError ? (
        <p role="alert" className="text-sm font-medium">
          {stockErrorText(setSettings.error)}
        </p>
      ) : null}
    </section>
  )
}

export function StockSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <CatalogModal open={open} onOpenChange={onOpenChange} className="sm:max-w-md">
      <ResponsiveModalHeader>
        <ResponsiveModalTitle>Stock settings</ResponsiveModalTitle>
        <ResponsiveModalDescription>
          Shop-wide defaults for tracked products. A product&apos;s own inventory rules override them.
        </ResponsiveModalDescription>
      </ResponsiveModalHeader>
      <ShopDefaultThresholdControl />
    </CatalogModal>
  )
}
