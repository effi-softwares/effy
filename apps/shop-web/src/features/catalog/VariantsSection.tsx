import { useState } from "react"

import { PackageX } from "lucide-react"

import {
  Badge,
  Button,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@effy/design-system/ui"
import { UNIT_BASIS_LABELS, unitPrice, unitPriceText, type ShopVariantDTO } from "@effy/shared-types"

import { DesignSheet } from "@/components/console/DesignSheet"
import { DetailSection, SectionAction } from "@/components/console/primitives"
import { track } from "@/lib/telemetry"

import { formatMoney } from "./detailFormat"
import { productMutationError } from "./errorText"
import type { ProductDetail } from "./model"
import { useSetVariantState } from "./queries"
import { isApproved } from "./review"

export function VariantsSection({ detail, onEdit }: { detail: ProductDetail; onEdit?: () => void }) {
  const approved = isApproved(detail)
  const setState = useSetVariantState(detail.id)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<ShopVariantDTO | null>(null)
  const live = detail.variants.filter((v) => v.state !== "removed")
  const removed = detail.variants.filter((v) => v.state === "removed")
  const hasOptions = detail.options.length > 0
  const activeCount = live.filter((v) => v.state === "active").length

  async function change(v: ShopVariantDTO, state: ShopVariantDTO["state"]) {
    setError(null)
    try {
      await setState.mutateAsync({ variantId: v.id, state })
      track({ name: "product_variant_state_changed", productId: detail.id, state })
    } catch (err) {
      setError(productMutationError(err))
    }
  }

  return (
    <DetailSection
      flush
      title="Sizes and prices"
      subtitle={
        approved
          ? "A new size or price is reviewed by Effy before it applies. Switching a size off sale is immediate."
          : "What you are paid for each size. Effy sets what customers pay when it approves the product."
      }
      action={onEdit ? <SectionAction onClick={onEdit}>Edit sizes</SectionAction> : undefined}
    >
      {detail.unitBasis ? (
        <p className="px-5 pt-3 text-sm text-muted-foreground">Unit pricing: {UNIT_BASIS_LABELS[detail.unitBasis]}</p>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{hasOptions ? "Size" : "Item"}</TableHead>
            <TableHead numeric>Your price</TableHead>
            <TableHead numeric>Customers pay</TableHead>
            <TableHead>Your code</TableHead>
            <TableHead>Barcode</TableHead>
            <TableHead numeric>Weight</TableHead>
            <TableHead numeric>In stock</TableHead>
            <TableHead>On sale</TableHead>
            {hasOptions ? <TableHead className="text-right" /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {live.map((v) => {
            const unit = unitPrice(v.customerPriceAmount, v.packQuantity, v.packUnit, detail.unitBasis)
            const last = v.state === "active" && activeCount <= 1
            return (
              <TableRow key={v.id}>
                <TableCell>
                  <span className="font-medium">{v.label ?? detail.name}</span>
                  <span className="mt-0.5 block text-muted-foreground">
                    {v.packQuantity ? `${Number(v.packQuantity)} ${v.packUnit} · ` : ""}
                    <span className="font-mono">{v.code}</span>
                  </span>
                </TableCell>
                <TableCell numeric>
                  {formatMoney(v.shopPriceAmount, detail.currency)}
                  {v.shopCompareAtAmount ? (
                    <span className="mt-0.5 block text-muted-foreground line-through">
                      {formatMoney(v.shopCompareAtAmount, detail.currency)}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell numeric>
                  {approved && v.customerPriceAmount ? (
                    formatMoney(v.customerPriceAmount, detail.currency)
                  ) : (
                    <span className="text-muted-foreground">Set when approved</span>
                  )}
                  {unit ? <span className="mt-0.5 block text-muted-foreground">{unitPriceText(unit)}</span> : null}
                </TableCell>
                <TableCell mono>{v.sku ?? "—"}</TableCell>
                <TableCell mono>{v.gtin ?? "—"}</TableCell>
                <TableCell numeric className="whitespace-nowrap">
                  {v.weightGrams} g
                  {v.weightIsAssumed ? <span className="mt-0.5 block text-muted-foreground">assumed</span> : null}
                </TableCell>
                <TableCell numeric>
                  {v.stock.tracked ? (
                    v.stock.outOfStock ? (
                      <Badge variant="destructive">
                        <PackageX aria-hidden="true" />0
                      </Badge>
                    ) : (
                      (v.stock.onHand ?? 0)
                    )
                  ) : (
                    <span className="text-muted-foreground">Not counted</span>
                  )}
                </TableCell>
                <TableCell>
                  {hasOptions ? (
                    <Switch
                      checked={v.state === "active"}
                      aria-label={`${v.label ?? "This size"} on sale`}
                      // Held by Effy (102): a size may come off sale, never back on. Read-only while Effy sets it up.
                      disabled={setState.isPending || last || !onEdit || (detail.hold !== null && v.state !== "active")}
                      title={
                        detail.hold !== null && v.state !== "active"
                          ? "Effy is holding this product — no size can go back on sale until Effy releases it"
                          : last
                            ? "The last size on sale — make the product unavailable instead"
                            : undefined
                      }
                      onCheckedChange={(on) => void change(v, on ? "active" : "inactive")}
                    />
                  ) : v.state === "active" ? (
                    <Badge variant="success">On sale</Badge>
                  ) : (
                    <Badge variant="quiet">Off sale</Badge>
                  )}
                </TableCell>
                {hasOptions ? (
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={setState.isPending || last}
                      onClick={() => setRemoving(v)}
                    >
                      Remove
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {removed.length > 0 || error ? (
        <div className="grid gap-1 border-t px-5 py-3">
          {removed.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              Removed: {removed.map((v) => v.label ?? "a size").join(", ")} — kept for past orders and stock history.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm font-medium">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      <DesignSheet
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.label ?? "this size"}?`}
        description="It stops being sold at once. Past orders and its stock history keep it."
        saveLabel="Remove size"
        destructive
        saving={setState.isPending}
        onSave={() => {
          if (!removing) return
          void change(removing, "removed").then(() => setRemoving(null))
        }}
      >
        <p className="text-sm text-muted-foreground">To sell it again later, add it back as a new size.</p>
      </DesignSheet>
    </DetailSection>
  )
}
