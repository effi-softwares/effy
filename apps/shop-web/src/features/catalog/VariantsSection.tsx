import { useState } from "react";

import { Badge, Button } from "@effy/design-system/ui";
import { UNIT_BASIS_LABELS, unitPrice, unitPriceText, type ShopVariantDTO } from "@effy/shared-types";

import { DetailSection, SectionAction, TableFrame, Td, Th } from "@/components/console/primitives";
import { track } from "@/lib/telemetry";

import { formatMoney } from "./detailFormat";
import { productMutationError } from "./errorText";
import type { ProductDetail } from "./model";
import { useSetVariantState } from "./queries";
import { isApproved } from "./review";

/**
 * Sizes and prices — every variant the product is sold as, one row each.
 *
 * The prices here are the live ones. A pending change is shown by the review panel above, and the
 * sizes editor opens on it; this table answers "what is on sale right now, at what price".
 *
 * On / off sale is immediate. Taking a size off sale never waits on Effy's review — the
 * row action does it at once, and the server keeps at least one size on sale.
 */
export function VariantsSection({ detail, onEdit }: { detail: ProductDetail; onEdit: () => void }) {
  const approved = isApproved(detail);
  const setState = useSetVariantState(detail.id);
  const [error, setError] = useState<string | null>(null);
  const live = detail.variants.filter((v) => v.state !== "removed");
  const removed = detail.variants.filter((v) => v.state === "removed");
  const hasOptions = detail.options.length > 0;
  const activeCount = live.filter((v) => v.state === "active").length;

  async function change(v: ShopVariantDTO, state: ShopVariantDTO["state"]) {
    setError(null);
    try {
      await setState.mutateAsync({ variantId: v.id, state });
      track({ name: "product_variant_state_changed", productId: detail.id, state });
    } catch (err) {
      setError(productMutationError(err));
    }
  }

  return (
    <DetailSection
      title="Sizes and prices"
      subtitle={
        approved
          ? "What you are paid for each size, and what customers pay. A new size or price is reviewed by Effy before it applies; taking a size off sale is immediate."
          : "What you are paid for each size. Effy sets what customers pay when it approves the product."
      }
      action={<SectionAction onClick={onEdit}>Edit</SectionAction>}
    >
      <div className="grid gap-3 pt-[18px]">
        {detail.unitBasis ? (
          <p className="text-muted-foreground text-[13px]">Unit pricing: {UNIT_BASIS_LABELS[detail.unitBasis]}</p>
        ) : null}
        <TableFrame>
          <thead className="bg-muted">
            <tr>
              <Th>{hasOptions ? "Variant" : "Item"}</Th>
              <Th align="right">Your price</Th>
              <Th align="right">Customers pay</Th>
              <Th>Effy code</Th>
              <Th>Your code</Th>
              <Th>Barcode</Th>
              <Th align="right">Weight</Th>
              <Th align="right">In stock</Th>
              <Th>Sale</Th>
              {hasOptions ? <Th /> : null}
            </tr>
          </thead>
          <tbody>
            {live.map((v) => {
              const unit = unitPrice(v.customerPriceAmount, v.packQuantity, v.packUnit, detail.unitBasis);
              return (
                <tr key={v.id} className="border-border border-t">
                  <Td>
                    <span className="font-medium">{v.label ?? detail.name}</span>
                    {v.packQuantity ? (
                      <span className="text-muted-foreground block text-[12px]">
                        {Number(v.packQuantity)} {v.packUnit}
                      </span>
                    ) : null}
                  </Td>
                  <Td align="right" className="tabular-nums">
                    {formatMoney(v.shopPriceAmount, detail.currency)}
                    {v.shopCompareAtAmount ? (
                      <span className="text-muted-foreground block text-[12px] line-through">{formatMoney(v.shopCompareAtAmount, detail.currency)}</span>
                    ) : null}
                  </Td>
                  <Td align="right" className="tabular-nums">
                    {/* Both prices, never the margin: before approval there is no customer price. */}
                    {approved && v.customerPriceAmount ? formatMoney(v.customerPriceAmount, detail.currency) : "Set when approved"}
                    {unit ? <span className="text-muted-foreground block text-[12px]">{unitPriceText(unit)}</span> : null}
                  </Td>
                  <Td className="font-mono text-[12.5px]">{v.code}</Td>
                  <Td className="font-mono text-[12.5px]">{v.sku ?? "—"}</Td>
                  <Td className="font-mono text-[12.5px]">{v.gtin ?? "—"}</Td>
                  <Td align="right" className="tabular-nums">
                    {v.weightGrams} g{v.weightIsAssumed ? <span className="text-muted-foreground block text-[12px]">assumed</span> : null}
                  </Td>
                  <Td align="right" className="tabular-nums">
                    {v.stock.tracked ? (v.stock.onHand ?? 0) : "Not counted"}
                  </Td>
                  <Td>
                    {v.state === "active" ? (
                      v.stock.outOfStock ? <Badge variant="warning">Sold out</Badge> : <Badge variant="success">On sale</Badge>
                    ) : (
                      <Badge variant="muted">Off sale</Badge>
                    )}
                  </Td>
                  {hasOptions ? (
                    <Td>
                      <div className="flex justify-end gap-1">
                        {v.state === "active" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={setState.isPending || activeCount <= 1}
                            title={activeCount <= 1 ? "The last size on sale — make the product unavailable instead" : undefined}
                            onClick={() => void change(v, "inactive")}
                          >
                            Off sale
                          </Button>
                        ) : (
                          <Button type="button" variant="ghost" size="sm" disabled={setState.isPending} onClick={() => void change(v, "active")}>
                            On sale
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="destructive-ghost"
                          size="sm"
                          disabled={setState.isPending || (v.state === "active" && activeCount <= 1)}
                          onClick={() => {
                            if (window.confirm(`Remove ${v.label ?? "this size"}? It stops being sold at once. Past orders keep it.`)) void change(v, "removed");
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    </Td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </TableFrame>
        {removed.length > 0 ? (
          <p className="text-muted-foreground text-[12.5px]">
            Removed: {removed.map((v) => v.label ?? "a size").join(", ")} — kept for past orders and stock history.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
      </div>
    </DetailSection>
  );
}
