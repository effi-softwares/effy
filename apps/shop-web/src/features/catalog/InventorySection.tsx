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
 * The Inventory section of the product detail screen, rebuilt to the imported mockup (057).
 *
 * ⚠ WHAT THIS REPLACES, AND WHY. Until now this section embedded the whole 054 Inventory TAB: a
 * tracking switch, a three-field "update the count" form, a two-field threshold form and a history
 * table, all permanently open. That was the right shape for a tab whose only job was stock; it is the
 * wrong shape for one section of a scrolling product page, where the operator's question is "how many
 * have we got" and four forms stand between them and the answer. The mockup states the numbers as
 * plain rows and puts every write behind a named verb — which is also what makes the count the thing
 * the eye lands on.
 *
 * ⚠ THREE OF THE MOCKUP'S INVENTORY FEATURES ARE REFUSED, and each is refused on a fact about this
 * platform rather than on effort. A source guard (`__tests__/inventory-guard.test.ts`) holds them out
 * of this directory and fails naming the file, because the next person to read the mockup will find
 * all three perfectly reasonable:
 *
 *   • (LIFTED BY 098) BY-VARIANT STOCK. Variants now exist and stock is counted per variant: this
 *     section shows ONE size at a time, chosen with the Size picker (and opened on a size by Today's
 *     `?size=`); every stock dialog names the size in its title.
 *   • RESERVED UNITS. Nothing reserves stock. 054's A6 recorded this in writing as an ACCEPTED
 *     residual: between creating a payment and it succeeding another shopper can take the last unit,
 *     and closing that window would need a reservation table plus an abandoned-checkout sweep the
 *     platform does not have. So "Reserved: 2 units" would be a number nothing computes — and worse
 *     than absent, because an operator would subtract it before deciding to reorder.
 *   • "DAYS COVER" BARS. They need a sales velocity, and the platform stores no per-product sales
 *     history — the same fact that already refuses the mockup's "Last 30 days" rail. A bar drawn from
 *     an invented velocity is the defect this feature deleted from the dashboard, where a fake chart
 *     shipped as if it were real.
 */
export function InventorySection({
  detail,
  variantId,
  onVariantChange,
}: {
  detail: ProductDetail;
  /** 098 — the size whose history (and rules dialog) is shown below the table. */
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
      {/* 098 — every size's stock in one table, one Save (add a delivery, or record a stocktake). */}
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
      {/* ⚠ Only while tracking is on: a count does not exist for an uncounted size (the server 409s). */}
      {stock?.tracked ? (
        <AdjustStockDialog variantId={variantId} stock={stock} open={adjustOpen} onOpenChange={setAdjustOpen} sizeLabel={size} />
      ) : null}
    </>
  );
}

/**
 * 098 — which size's stock the tab shows. Each size is its own shelf with its own count, rules and
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
 * The header's stock affordance — `Receive stock` on a tracked product, `Add stock` on one that is
 * not counted yet. It needs the same stock read this section makes and so shares its cache entry
 * rather than issuing a second one.
 *
 * ⚠ IT USED TO BE DISABLED WHENEVER TRACKING WAS OFF, which before 098 was most products (tracking
 * defaulted to off; since 098 a new size is counted from the start), so the default put a dead control in the header
 * of nearly every product page, explaining itself only in a `title` attribute a touch device never
 * shows. The refusal was TRUE — there is no count to receive into — but it answered a question the
 * operator was not asking. "We just got 24 of these" is the same intent whether or not a count
 * exists; the only difference is that one of them has to start the count first, and the platform can
 * do that in the same request (see `StartTrackingDialog`).
 *
 * ⚠ THE LABEL IS WHAT CARRIES THE DIFFERENCE, and it changes for a reason rather than for variety:
 * receiving ADDS to a number that exists, adding stock ESTABLISHES one. An operator who reads
 * "Receive stock" on an uncounted product would reasonably expect a running total behind it.
 *
 * ⚠ WHILE THE READ IS IN FLIGHT THE BUTTON IS DISABLED AND KEEPS THE TRACKED LABEL. Defaulting to
 * `Add stock` would flip the wording under the operator's cursor a moment later — and on a tracked
 * product, offer the wrong dialog to a fast click.
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
