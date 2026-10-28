import { useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { PackagePlus } from "lucide-react"

import {
  Button,
  Label,
  Skeleton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"

import { DetailSection, SectionAction } from "@/components/console/primitives"

import type { ProductDetail } from "./model"
import { AdjustStockDialog } from "./StockDialogs"
import { InventoryRulesDialog } from "./InventoryRulesDialog"
import { StockHistory } from "./StockHistory"
import { StockTable } from "./StockTable"
import { variantStockQuery } from "./stockQueries"
import { sizeLabelOf } from "@effy/web-kit/product-form"

export function InventorySection({
  detail,
  variantId,
  onVariantChange,
}: {
  detail: ProductDetail
  variantId: string
  onVariantChange: (variantId: string) => void
}) {
  const { data, isPending, isError, error, refetch } = useQuery(variantStockQuery(variantId))
  const [rulesOpen, setRulesOpen] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const size = sizeLabelOf(detail, variantId)
  const stock = data && data.stock.variantId === variantId ? data.stock : null

  return (
    <>
      <StockTable
        detail={detail}
        onRules={(id) => {
          onVariantChange(id)
          setRulesOpen(true)
        }}
        onHistory={onVariantChange}
      />

      <DetailSection
        title={size ? `Stock movements — ${size}` : "Stock movements"}
        subtitle="Every change to the count, with who made it and why."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <SizePicker detail={detail} variantId={variantId} onChange={onVariantChange} id="history-size" />
            <SectionAction onClick={() => setAdjustOpen(true)} disabled={!stock?.tracked}>
              Adjust stock
            </SectionAction>
          </div>
        }
      >
        {isError ? (
          <div>
            <ErrorState
              error={error}
              onRetry={() => void refetch()}
              forbiddenMessage="You don't have permission to see stock for this product."
            />
          </div>
        ) : isPending || !stock ? (
          <div className="grid gap-3" aria-busy="true" aria-label="Loading stock">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/3" />
          </div>
        ) : stock.tracked ? (
          <StockHistory variantId={variantId} />
        ) : (
          <p className="text-muted-foreground">
            This size is not counted, so nothing is recorded. Enter a number for it in the table above to start keeping
            a count and a history.
          </p>
        )}
      </DetailSection>

      {stock ? (
        <InventoryRulesDialog
          detail={detail}
          variantId={variantId}
          stock={stock}
          open={rulesOpen}
          onOpenChange={setRulesOpen}
        />
      ) : null}
      {stock?.tracked ? (
        <AdjustStockDialog
          variantId={variantId}
          stock={stock}
          open={adjustOpen}
          onOpenChange={setAdjustOpen}
          sizeLabel={size}
        />
      ) : null}
    </>
  )
}

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
