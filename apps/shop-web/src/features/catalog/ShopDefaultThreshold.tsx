import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import {
  Button,
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  Input,
  Label,
} from "@effy/design-system/ui";

import { stockErrorText } from "./stockErrorText";
import { stockSettingsQuery, useSetStockSettings } from "./stockQueries";

/**
 * The shop-wide default low-stock threshold.
 *
 * Why a shop-wide default exists at all. A shop with hundreds of products would have to set a
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
            // Blank clears to null, never zero. Zero would mean "warn me at zero", which would make
            // every product permanently low — a different instruction entirely.
            setSettings.mutate({ defaultThreshold: value.trim() === "" ? null : Number(value) })
          }
        >
          Save
        </Button>
      </div>
      {setSettings.isError ? (
        <p role="alert" className="text-sm font-medium">
          {stockErrorText(setSettings.error)}
        </p>
      ) : null}
    </section>
  );
}

/**
 * The catalog's stock settings, opened from the catalog toolbar. In Catalog, not Management (which is
 * manager-only), because both shop roles manage stock.
 */
export function StockSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange}>
      <ResponsiveModalContent className="max-md:max-h-[92dvh] max-md:overflow-y-auto max-md:pb-[env(safe-area-inset-bottom)] max-md:[&>*:not([data-slot])]:px-4 sm:max-w-md">
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>Stock settings</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            Shop-wide defaults for tracked products. A product&apos;s own inventory rules override them.
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>
        <ShopDefaultThresholdControl />
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
