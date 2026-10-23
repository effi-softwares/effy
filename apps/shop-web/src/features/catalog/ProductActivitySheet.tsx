import { useQuery } from "@tanstack/react-query";

import type { StockMovementDTO } from "@effy/shared-types";
import {
  LoadingArea,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@effy/design-system/ui";

import { MicroLabel, Pill, RailRow } from "@/components/console/primitives";
import { cn } from "@/lib/utils";

import type { ProductDetail } from "./model";
import { actorLabel, stockChangeTitle } from "./stockMovementText";
import { variantStockQuery } from "./stockQueries";

/**
 * The product's Activity sheet, opened from the header: a full-height scrollable log, so every entry
 * shows. The entries are `stock_movement` rows, the only per-product audit trail. No "Last 30 days" block:
 * there is no per-product sales history; it shows the product's lifecycle facts instead.
 */
export function ProductActivitySheet({
  detail,
  variantId,
  open,
  onOpenChange,
}: {
  detail: ProductDetail;
  /** The size whose stock changes are listed (the one the Inventory tab shows). */
  variantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Shares the Inventory tab's cache entry rather than issuing a second read (Principle VI).
  const stock = useQuery(variantStockQuery(variantId));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* The shared SheetContent already supports `side="right"`; the width, square corners and
          flush padding are this surface's, passed as classes so the centred-modal and bottom-drawer
          variants (`ResponsiveModal`) are untouched. */}
      <SheetContent side="right" className="w-full gap-0 rounded-none sm:max-w-[440px]">
        <SheetHeader className="border-border gap-1 border-b px-5 py-4 pr-12">
          <SheetTitle className="text-[15.5px] tracking-[-.015em]">Activity</SheetTitle>
          <SheetDescription className="text-[13px] leading-[1.55]">
            Where this product stands, and every change made to its stock.
          </SheetDescription>
        </SheetHeader>

        <div className="grid min-h-0 flex-1 content-start gap-7 overflow-y-auto px-5 py-5">
          <div className="grid gap-0.5">
            <MicroLabel className="pb-2">Summary</MicroLabel>
            <RailRow label="Status" value={<Pill variant="quiet">{detail.status}</Pill>} />
            <RailRow label="Sections" value={detail.sections.length} />
            <RailRow label="Images" value={detail.media.length} />
            <RailRow
              label="Updated"
              value={new Date(detail.updatedAt).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            />
          </div>

          <div className="grid gap-0.5">
            <MicroLabel className="pb-2">Change log</MicroLabel>
            {stock.isPending ? (
              <LoadingArea variant="sheet" title="Loading change log" description="Fetching every change to this product’s stock." />
            ) : stock.isError ? (
              <p className="text-muted-foreground border-border border-t py-2.5 text-[13px]">
                The change log couldn&apos;t be loaded.
              </p>
            ) : stock.data.movements.length === 0 ? (
              <p className="text-muted-foreground border-border border-t py-2.5 text-[13px]">
                No changes recorded yet. Every change to the stock count appears here, with who made
                it.
              </p>
            ) : (
              <ol className="grid">
                {stock.data.movements.map((m) => (
                  <ChangeLogEntry key={m.id} movement={m} />
                ))}
              </ol>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * One change-log entry: a status dot, what happened, and "<when> · <who>".
 *
 * The dot is monochrome. The mockup colours it green / amber / red by kind; amber is a third UI hue
 * and `--success` may not sit beside text as its only carrier of meaning. A reduction gets the full
 * foreground, an increase the muted tone — and the signed count in the title says which, so the dot
 * is never the only thing telling them apart.
 */
function ChangeLogEntry({ movement }: { movement: StockMovementDTO }) {
  const who = actorLabel(movement);
  const when = new Date(movement.createdAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <li className="border-border flex items-start gap-[11px] border-t py-[11px]">
      <span
        aria-hidden="true"
        className={cn(
          "mt-[7px] size-[5px] shrink-0 rounded-full",
          movement.quantityDelta < 0 ? "bg-foreground" : "bg-muted-foreground",
        )}
      />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-[13.5px] leading-[1.5]">{stockChangeTitle(movement)}</span>
        <span className="text-muted-foreground text-[12px]">
          {who && who !== "—" ? `${when} · ${who}` : when}
        </span>
      </span>
    </li>
  );
}
