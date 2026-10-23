import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { Button, Label, LoadingArea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { DetailSection, SectionAction } from "@/components/console/primitives";

import type { ProductDetail } from "./model";
import { AdjustStockDialog } from "./StockDialogs";
import { InventoryRulesDialog } from "./InventoryRulesDialog";
import { StockHistory } from "./StockHistory";
import { StockTable } from "./StockTable";
import { variantStockQuery } from "./stockQueries";
import { sizeLabelOf } from "./variants";

/**
 * The Inventory section of the product detail screen: the numbers as plain rows, every write behind a
 * named verb. Stock is per variant, shown one size at a time (the Size picker; Today opens it with
 * `?size=`), and every stock dialog names the size.
 *
 * Refused, and held out by `__tests__/inventory-guard.test.ts`: reserved units (nothing reserves stock,
 * so the number would be invented) and "DAYS COVER" bars (there is no per-product sales history).
 */
export function InventorySection({
  detail,
  variantId,
  onVariantChange,
}: {
  detail: ProductDetail;
  /** The size whose history (and rules dialog) is shown below the table. */
  variantId: string;
  onVariantChange: (variantId: string) => void;
}) {
  const { data, isPending, isError, error, refetch } = useQuery(variantStockQuery(variantId));
  const [rulesOpen, setRulesOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const size = sizeLabelOf(detail, variantId);
  // The query follows the chosen size; a dialog opens only once that size's own count has landed.
  const stock = data && data.stock.variantId === variantId ? data.stock : null;

  return (
    <>
      {/* Every size's stock in one table, one Save (add a delivery, or record a stocktake). */}
      <StockTable
        detail={detail}
        onRules={(id) => {
          onVariantChange(id);
          setRulesOpen(true);
        }}
        onHistory={onVariantChange}
      />

      {/* One size's movements: every change to its count, who caused it, and the correction write
          (damage, expiry, a miscount) that keeps a reason. */}
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
          <div className="pt-[18px]">
            <ErrorState
              error={error}
              onRetry={() => void refetch()}
              forbiddenMessage="You don't have permission to see stock for this product."
            />
          </div>
        ) : isPending || !stock ? (
          <div className="pt-[18px]">
            <LoadingArea variant="sheet" title="Loading stock" description="Fetching this size's count and history." />
          </div>
        ) : stock.tracked ? (
          <div className="pt-2">
            <StockHistory movements={data!.movements} />
          </div>
        ) : (
          <p className="text-muted-foreground pt-[18px] text-[13px]">
            This size is not counted, so nothing is recorded. Enter a number for it in the table above to
            start keeping a count and a history.
          </p>
        )}
      </DetailSection>

      {stock ? (
        <InventoryRulesDialog detail={detail} variantId={variantId} stock={stock} open={rulesOpen} onOpenChange={setRulesOpen} />
      ) : null}
      {/* Only while tracking is on: a count does not exist for an uncounted size (the server 409s). */}
      {stock?.tracked ? (
        <AdjustStockDialog variantId={variantId} stock={stock} open={adjustOpen} onOpenChange={setAdjustOpen} sizeLabel={size} />
      ) : null}
    </>
  );
}

/**
 * Which size's stock the tab shows. Each size is its own shelf with its own count, rules and
 * history; a product sold in one size shows no picker at all.
 */
/**
 * Which size a count belongs to — on the Inventory section, and inside a stock dialog opened from the
 * page header. Nothing for a product sold one way.
 */
export function SizePicker({
  detail,
  variantId,
  onChange,
  id = "stock-size",
}: {
  detail: ProductDetail;
  variantId: string;
  onChange: (id: string) => void;
  id?: string;
}) {
  const live = detail.variants.filter((v) => v.state !== "removed");
  if (live.length <= 1) return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Label htmlFor={id}>Size</Label>
      <Select value={variantId} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-[240px]">
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
  );
}

/**
 * The header's stock action: `Receive stock` on a counted product, `Add stock` on one not counted yet
 * (which starts the count in the same request: `StartTrackingDialog`). It shares this section's stock
 * read. While the read is in flight it is disabled with the counted label, so the wording never flips
 * under the cursor.
 */
export function ReceiveStockButton({
  variantId,
  onReceive,
}: {
  variantId: string;
  onReceive: () => void;
}) {
  const { data } = useQuery(variantStockQuery(variantId));
  const loading = data === undefined;
  const tracked = data?.stock.tracked ?? false;

  return (
    <Button size="sm" onClick={onReceive} disabled={loading}>
      {loading || tracked ? "Receive stock" : "Add stock"}
    </Button>
  );
}
