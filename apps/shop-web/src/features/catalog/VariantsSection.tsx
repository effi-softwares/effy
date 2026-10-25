import { useState } from "react"

import { PackageX } from "lucide-react"

import { Button, Switch } from "@effy/design-system/ui"
import { UNIT_BASIS_LABELS, unitPrice, unitPriceText, type ShopVariantDTO } from "@effy/shared-types"

import { DesignSheet } from "@/components/console/DesignSheet"
import { DetailSection, SectionAction } from "@/components/console/primitives"
import { track } from "@/lib/telemetry"

import { formatMoney } from "./detailFormat"
import { productMutationError } from "./errorText"
import type { ProductDetail } from "./model"
import { useSetVariantState } from "./queries"
import { isApproved } from "./review"

export function VariantsSection({ detail, onEdit }: { detail: ProductDetail; onEdit: () => void }) {
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
      action={<SectionAction onClick={onEdit}>Edit sizes</SectionAction>}
    >
      {detail.unitBasis ? (
        <p className="px-5 pt-3 text-sm text-muted-foreground">Unit pricing: {UNIT_BASIS_LABELS[detail.unitBasis]}</p>
      ) : null}
      <div className="ef-table-scroll">
        <table className="ef-table ef-table--plain">
          <thead>
            <tr>
              <th>{hasOptions ? "Size" : "Item"}</th>
              <th className="is-num">Your price</th>
              <th className="is-num">Customers pay</th>
              <th>Your code</th>
              <th>Barcode</th>
              <th className="is-num">Weight</th>
              <th className="is-num">In stock</th>
              <th>On sale</th>
              {hasOptions ? <th className="is-actions" /> : null}
            </tr>
          </thead>
          <tbody>
            {live.map((v) => {
              const unit = unitPrice(v.customerPriceAmount, v.packQuantity, v.packUnit, detail.unitBasis)
              const last = v.state === "active" && activeCount <= 1
              return (
                <tr key={v.id}>
                  <td>
                    <span className="font-medium">{v.label ?? detail.name}</span>
                    <span className="ef-sub">
                      {v.packQuantity ? `${Number(v.packQuantity)} ${v.packUnit} · ` : ""}
                      <span className="font-mono">{v.code}</span>
                    </span>
                  </td>
                  <td className="is-num">
                    {formatMoney(v.shopPriceAmount, detail.currency)}
                    {v.shopCompareAtAmount ? (
                      <span className="ef-sub line-through">{formatMoney(v.shopCompareAtAmount, detail.currency)}</span>
                    ) : null}
                  </td>
                  <td className="is-num">
                    {approved && v.customerPriceAmount ? (
                      formatMoney(v.customerPriceAmount, detail.currency)
                    ) : (
                      <span className="text-muted-foreground">Set when approved</span>
                    )}
                    {unit ? <span className="ef-sub">{unitPriceText(unit)}</span> : null}
                  </td>
                  <td className="ef-code">{v.sku ?? "—"}</td>
                  <td className="ef-code">{v.gtin ?? "—"}</td>
                  <td className="is-num whitespace-nowrap">
                    {v.weightGrams} g{v.weightIsAssumed ? <span className="ef-sub">assumed</span> : null}
                  </td>
                  <td className="is-num">
                    {v.stock.tracked ? (
                      v.stock.outOfStock ? (
                        <span className="ef-st ef-st--problem">
                          <PackageX aria-hidden="true" />0
                        </span>
                      ) : (
                        (v.stock.onHand ?? 0)
                      )
                    ) : (
                      <span className="text-muted-foreground">Not counted</span>
                    )}
                  </td>
                  <td>
                    {hasOptions ? (
                      <Switch
                        checked={v.state === "active"}
                        aria-label={`${v.label ?? "This size"} on sale`}
                        disabled={setState.isPending || last}
                        title={last ? "The last size on sale — make the product unavailable instead" : undefined}
                        onCheckedChange={(on) => void change(v, on ? "active" : "inactive")}
                      />
                    ) : v.state === "active" ? (
                      <span className="ef-st ef-st--done">On sale</span>
                    ) : (
                      <span className="ef-st ef-st--quiet">Off sale</span>
                    )}
                  </td>
                  {hasOptions ? (
                    <td className="is-actions">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={setState.isPending || last}
                        onClick={() => setRemoving(v)}
                      >
                        Remove
                      </Button>
                    </td>
                  ) : null}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {removed.length > 0 || error ? (
        <div className="grid gap-1 border-t border-border px-5 py-3">
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
