import { PanelLeft, Table2 } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "@effy/design-system/ui";

export type SizesView = "focus" | "sheet";

const KEY = "effy.product.sizesView";

/** The sizes view a person last chose, remembered on this device; one at a time until they choose. */
export function storedSizesView(): SizesView {
  try {
    return localStorage.getItem(KEY) === "sheet" ? "sheet" : "focus";
  } catch {
    return "focus";
  }
}

export function storeSizesView(view: SizesView) {
  try {
    localStorage.setItem(KEY, view);
  } catch {
    // A private window: the choice lasts until the page is left.
  }
}

/** Switches the sizes between one at a time and the spreadsheet. */
export function SizesViewToggle({ value, onChange }: { value: SizesView; onChange: (view: SizesView) => void }) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      value={value}
      onValueChange={(v) => {
        if (v === "focus" || v === "sheet") onChange(v);
      }}
      aria-label="How sizes are shown"
    >
      <ToggleGroupItem value="focus" aria-label="One at a time" className="px-3">
        <PanelLeft aria-hidden="true" />
        <span className="max-sm:sr-only">One at a time</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="sheet" aria-label="Spreadsheet" className="px-3">
        <Table2 aria-hidden="true" />
        <span className="max-sm:sr-only">Spreadsheet</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
