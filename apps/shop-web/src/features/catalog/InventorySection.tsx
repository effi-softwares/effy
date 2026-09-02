import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { Button, Skeleton } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { DetailRow, MicroLabel, Section, SectionAction } from "@/components/console/primitives";

import type { ProductDetail } from "./model";
import { AdjustStockDialog } from "./StockDialogs";
import { InventoryRulesDialog } from "./InventoryRulesDialog";
import { StockHistory } from "./StockHistory";
import { productStockQuery } from "./stockQueries";

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
 *   • BY-VARIANT BREAKDOWN + "Manage variants". THE PLATFORM HAS NO VARIANTS. `public.product` is one
 *     row per sellable thing; there is no variant table, no variant column, and no code path anywhere
 *     that groups products under a parent. A per-variant stock table would need a data model invented
 *     for it, and inventing one to satisfy a mockup is how a console grows a concept the storefront,
 *     the cart, the picker and the driver app all know nothing about.
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
export function InventorySection({ detail }: { detail: ProductDetail }) {
  const { data, isPending, isError, error, refetch } = useQuery(productStockQuery(detail.id));
  const [rulesOpen, setRulesOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);

  if (isError) {
    return (
      <Section title="Inventory">
        <div className="pt-4">
          <ErrorState
            error={error}
            onRetry={() => void refetch()}
            forbiddenMessage="You don't have permission to see stock for this product."
          />
        </div>
      </Section>
    );
  }
  if (isPending) {
    return (
      <Section title="Inventory">
        <div className="pt-4">
          <Skeleton className="h-32 w-full" />
        </div>
      </Section>
    );
  }

  const stock = data.stock;

  return (
    <>
      <Section
        title="Inventory"
        action={<SectionAction onClick={() => setRulesOpen(true)}>Edit rules</SectionAction>}
      >
        {/* ⚠ NO COLOUR ANYWHERE IN HERE. The mockup tints an empty shelf red, a thin one amber and a
            healthy one green; amber is a third UI hue the constitution does not have, and 041
            specifically stripped one out of these very screens. "Out of stock" and "Running low" are
            carried by WORDS AND WEIGHT, which is also what works on a shop floor in bright light. */}
        <DetailRow
          label="Stock tracking"
          value={stock.tracked ? "On" : "Off — this product can be bought without limit"}
        />

        {stock.tracked ? (
          <>
            <DetailRow
              label="Units on hand"
              value={`${stock.onHand} ${stock.onHand === 1 ? "unit" : "units"}`}
              emphasis={stock.outOfStock}
            />
            <DetailRow
              label="Low-stock threshold"
              value={thresholdText(
                stock.threshold,
                stock.effectiveThreshold,
              )}
            />
          </>
        ) : null}

        <DetailRow
          label="Default supplier"
          value={detail.supplierName ?? "Not set"}
        />

        {/* The one line that needs a person, set in semibold — the section's only emphasis. */}
        {stock.tracked && (stock.outOfStock || stock.low) ? (
          <p className="pt-3.5 text-[13.5px] font-semibold">
            {stock.outOfStock
              ? "Out of stock — shoppers cannot buy this right now."
              : `Running low — ${stock.onHand} left. It is on the Restock screen.`}
          </p>
        ) : null}

        {/* ⚠ The mockup's sub-block here is "BY VARIANT / Manage variants". The platform has no
            variants (see the docblock), so the slot carries the thing it does have and that an
            operator actually needs beside a count: every movement of it, and who caused each one. */}
        <div className="grid gap-0 pt-5">
          <div className="border-border flex items-baseline justify-between gap-3 border-b pb-2.5">
            <MicroLabel>Stock movements</MicroLabel>
            <SectionAction onClick={() => setAdjustOpen(true)} disabled={!stock.tracked}>
              Adjust stock
            </SectionAction>
          </div>

          {stock.tracked ? (
            <div className="pt-3.5">
              <StockHistory movements={data.movements} />
            </div>
          ) : (
            <p className="text-muted-foreground py-3.5 text-[13px]">
              Nothing is recorded while stock is not tracked. Turn tracking on in Edit rules to start
              keeping a count and a history.
            </p>
          )}
        </div>
      </Section>

      <InventoryRulesDialog
        detail={detail}
        stock={stock}
        open={rulesOpen}
        onOpenChange={setRulesOpen}
      />
      {/* ⚠ Only rendered while tracking is on. `AdjustStockDialog` writes a count, and a count does
          not exist for an untracked product — the server refuses it with a 409, so offering the
          dialog would be offering a guaranteed refusal. */}
      {stock.tracked ? (
        <AdjustStockDialog
          productId={detail.id}
          stock={stock}
          open={adjustOpen}
          onOpenChange={setAdjustOpen}
        />
      ) : null}
    </>
  );
}

/**
 * ⚠ THE ROW SAYS WHERE THE NUMBER CAME FROM, not just what it is. A shop default and a per-product
 * override produce the same figure and mean different things: change the shop default and one of them
 * moves. An operator who cannot tell which they are looking at cannot predict either.
 */
function thresholdText(own: number | null, effective: number | null): string {
  if (own !== null) return `${own} — set for this product`;
  if (effective !== null) return `${effective} — the shop default`;
  return "Not set — only an empty shelf is reported";
}

/**
 * The header's Receive-stock affordance, which needs the same stock read this section makes and so
 * shares its cache entry rather than issuing a second one.
 *
 * ⚠ IT IS DISABLED, NOT HIDDEN, WHEN STOCK IS UNTRACKED — and it says why. A control that vanishes
 * leaves the operator hunting for it; one that refuses out loud teaches the rule once. This is the
 * same reason 033's guest save cap refuses deliberately instead of quietly doing nothing.
 */
export function ReceiveStockButton({
  detail,
  onReceive,
}: {
  detail: ProductDetail;
  onReceive: () => void;
}) {
  const { data } = useQuery(productStockQuery(detail.id));
  const tracked = data?.stock.tracked ?? false;

  return (
    <Button
      size="sm"
      onClick={onReceive}
      disabled={!tracked}
      title={
        tracked
          ? undefined
          : "Stock isn't tracked for this product. Turn tracking on under Inventory first."
      }
    >
      Receive stock
    </Button>
  );
}
