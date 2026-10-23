import { useEffect, useState } from "react";

import type { ProductStockDTO } from "@effy/shared-types";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Switch,
} from "@effy/design-system/ui";

import type { ProductDetail } from "./model";
import { stockErrorText } from "./stockErrorText";
import { useSetStockThreshold, useSetStockTracking } from "./stockQueries";
import { sizeLabelOf } from "./variants";

/**
 * "Edit rules": the standing facts about how this product's stock behaves.
 *  • Track inventory: `stock_tracked`; off is a real state (an uncounted product).
 *  • Low-stock threshold, not "reorder point": nothing reorders; it marks the product as running low for
 *  a person to decide.
 *  • No location: a shop is the location (no bins or warehouses).
 *  • No barcode: the GTIN is edited under Product details; two editors for one column revert each other.
 */
export function InventoryRulesDialog({
  detail,
  variantId,
  stock,
  open,
  onOpenChange,
}: {
  detail: ProductDetail;
  /** The size whose rules these are. */
  variantId: string;
  stock: ProductStockDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Tracking and the threshold are per size; the title says which.
  const size = sizeLabelOf(detail, variantId);
  const setTracking = useSetStockTracking(variantId);
  const setThreshold = useSetStockThreshold(variantId);

  const [tracked, setTracked] = useState(stock.tracked);
  const [openingCount, setOpeningCount] = useState("");
  const [threshold, setThresholdValue] = useState(
    stock.threshold === null ? "" : String(stock.threshold),
  );

  useEffect(() => {
    if (!open) return;
    setTracked(stock.tracked);
    setOpeningCount("");
    setThresholdValue(stock.threshold === null ? "" : String(stock.threshold));
    setTracking.reset();
    setThreshold.reset();
    // Seed on open only, never mid-typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const turningOn = tracked && !stock.tracked;
  const opening = wholeNumber(openingCount);
  const thresholdValue = threshold.trim() === "" ? null : wholeNumber(threshold);

  // Turning tracking on without a count makes the product instantly unbuyable with no
  // operator intent behind it — a state the shop hears about from a customer rather than from their
  // own action. The server refuses it too; this just stops the round trip.
  const openingValid = !turningOn || (opening !== null && opening >= 0);
  const thresholdValid = threshold.trim() === "" || (thresholdValue !== null && thresholdValue >= 0);
  const canSave = openingValid && thresholdValid;

  const pending = setTracking.isPending || setThreshold.isPending;
  const failure = setTracking.error ?? setThreshold.error;

  /**
   * Two routes, saved in order, and tracking goes first. A threshold is meaningless on an
   * untracked product, and the server refuses a threshold write when tracking is off — so
   * saving them in any other order turns one operator action into a confusing refusal for a product
   * that is, by the time they read it, being tracked perfectly well.
   *
   * Each is sent only if it actually changed. A PATCH that resends untouched fields is how one
   * operator's save silently reverts another's — the same rule the focused-edit dialogs follow.
   */
  async function save() {
    try {
      if (tracked !== stock.tracked) {
        await setTracking.mutateAsync(
          tracked ? { tracked: true, onHand: opening ?? 0 } : { tracked: false },
        );
      }
      if (tracked && thresholdValue !== stock.threshold) {
        await setThreshold.mutateAsync({ threshold: thresholdValue });
      }
      onOpenChange(false);
    } catch {
      // The refusal is rendered from the mutation's own error below. Swallowing it here only stops
      // an unhandled rejection; it never hides it from the operator.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{size ? `Inventory rules — ${size}` : "Inventory rules"}</DialogTitle>
          <DialogDescription>
            How this product&apos;s stock behaves. Changing a rule here never moves the count.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <div className="border-border flex items-start justify-between gap-4 border-b pb-4">
            <div className="grid gap-1">
              <Label htmlFor="rules-tracked" className="text-[13.5px] font-medium">
                Track stock
              </Label>
              <p className="text-muted-foreground text-[12.5px]">
                Deduct units on every paid order, and stop selling at zero.
              </p>
            </div>
            <Switch
              id="rules-tracked"
              checked={tracked}
              aria-label="Track stock for this product"
              onCheckedChange={setTracked}
            />
          </div>

          {turningOn ? (
            <div className="grid gap-1.5">
              <Label htmlFor="rules-opening">Opening count</Label>
              <Input
                id="rules-opening"
                inputMode="numeric"
                autoComplete="off"
                className="w-32"
                placeholder="0"
                value={openingCount}
                onChange={(e) => setOpeningCount(e.target.value)}
              />
              <p className="text-muted-foreground text-[12.5px]">
                How many you have right now. Required — tracking cannot start from an unknown count.
              </p>
            </div>
          ) : null}

          {tracked ? (
            <div className="grid gap-1.5">
              <Label htmlFor="rules-threshold">Low-stock threshold</Label>
              <Input
                id="rules-threshold"
                inputMode="numeric"
                autoComplete="off"
                className="w-32"
                placeholder="Shop default"
                value={threshold}
                onChange={(e) => setThresholdValue(e.target.value)}
              />
              <p className="text-muted-foreground text-[12.5px]">
                {threshold.trim() === ""
                  ? stock.effectiveThreshold === null
                    ? "Leave blank to use the shop default. Nothing is set for this shop yet, so only products that reach zero are reported."
                    : `Leave blank to use the shop default of ${stock.effectiveThreshold}.`
                  : "At or below this count, the product is reported as running low. It stays on sale."}
              </p>
            </div>
          ) : null}

          {failure ? (
            <p role="alert" className="text-destructive text-sm">
              {stockErrorText(failure)}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!canSave || pending}>
            {pending ? "Saving…" : "Save rules"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function wholeNumber(raw: string): number | null {
  const text = raw.trim();
  if (text === "" || !/^\d+$/.test(text)) return null;
  return Number(text);
}
