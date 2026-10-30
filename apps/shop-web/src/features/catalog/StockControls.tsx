import { useQuery } from "@tanstack/react-query"
import { PackagePlus } from "lucide-react"

import { Button, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@effy/design-system/ui"

import type { ProductDetail } from "./model"
import { variantStockQuery } from "./stockQueries"

/** Which size a stock dialog is about, when the product has more than one. */
export function SizePicker({
  detail,
  variantId,
  onChange,
  id = "stock-size",
}: {
  detail: ProductDetail
  variantId: string
  onChange: (id: string) => void
  id?: string
}) {
  const live = detail.variants.filter((v) => v.state !== "removed")
  if (live.length <= 1) return null
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Label htmlFor={id}>Size</Label>
      <Select value={variantId} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-55">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {live.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              {v.label ?? detail.name}
              {v.state === "inactive" ? " (off sale)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function ReceiveStockButton({ variantId, onReceive }: { variantId: string; onReceive: () => void }) {
  const { data } = useQuery(variantStockQuery(variantId))
  const loading = data === undefined
  const tracked = data?.stock.tracked ?? false

  return (
    <Button variant="outline" onClick={onReceive} disabled={loading}>
      <PackagePlus aria-hidden="true" />
      {loading || tracked ? "Receive stock" : "Add stock"}
    </Button>
  )
}
