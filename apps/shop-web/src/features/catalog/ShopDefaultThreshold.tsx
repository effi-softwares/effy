import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@effy/design-system/ui";

import { stockErrorText } from "./stockErrorText";
import { stockSettingsQuery, useSetStockSettings } from "./stockQueries";

/**
 * The shop-wide default low-stock threshold (054 FR-005).
 *
 * ⚠ WHY A SHOP-WIDE DEFAULT EXISTS AT ALL. A shop with hundreds of products would have to set a
 * threshold one product at a time, so in practice nothing would be reported as running low for a long
 * while after shipping — precision nobody has time to enter is the same as no feature. One number, set
 * once, with a per-product override for the items that genuinely need their own.
 */
export function ShopDefaultThresholdControl() {
  const { data } = useQuery(stockSettingsQuery);
  const setSettings = useSetStockSettings();
  const [value, setValue] = useState("");

  // Seed the field once the server value arrives, without fighting the operator's typing.
  useEffect(() => {
    if (data) setValue(data.defaultThreshold === null ? "" : String(data.defaultThreshold));
  }, [data]);

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">Default low-stock threshold</h2>
      <p className="text-sm text-muted-foreground">
        Applies to every tracked product without its own threshold. Leave blank to clear it — nothing
        is then reported as running low, though a product that reaches zero is still reported as out
        of stock.
      </p>
      <div className="flex items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="default-threshold">Threshold</Label>
          <Input
            id="default-threshold"
            inputMode="numeric"
            className="w-32"
            placeholder="None"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          disabled={setSettings.isPending}
          onClick={() =>
            // ⚠ Blank clears to NULL, never zero. Zero would mean "warn me at zero", which would make
            // every product permanently low — a different instruction entirely (FR-005a).
            setSettings.mutate({ defaultThreshold: value.trim() === "" ? null : Number(value) })
          }
        >
          Save
        </Button>
      </div>
      {setSettings.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {stockErrorText(setSettings.error)}
        </p>
      ) : null}
    </section>
  );
}

/**
 * The catalog's stock settings, opened from the catalog toolbar beside "Manage sections".
 *
 * ⚠ IT LIVES IN CATALOG, NOT MANAGEMENT, although the design's "Shop settings" list is on Management.
 * Management is manager-only in the nav, and this setting is not: both shop roles manage stock (054
 * FR-010, A7) and the backend admits both. Putting it behind the manager rail would hide a control
 * from the people the backend says may use it. It used to sit on the Restock screen, which the
 * 2026-09-10 design revision removed; inventory management stays in Catalog.
 */
export function StockSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Stock settings</DialogTitle>
          <DialogDescription>
            Shop-wide defaults for tracked products. A product&apos;s own inventory rules override them.
          </DialogDescription>
        </DialogHeader>
        <ShopDefaultThresholdControl />
      </DialogContent>
    </Dialog>
  );
}
