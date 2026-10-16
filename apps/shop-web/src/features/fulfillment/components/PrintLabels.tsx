import { useState } from "react";

import type { ShopOrderDetailDTO } from "@effy/shared-types";
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@effy/design-system/ui";

import { track } from "@/lib/telemetry";

import { LABEL_LAYOUTS, printLabels, type LabelLayout } from "../labels/labels";

/** The printer's label size, remembered on this browser — a convenience, never required. */
const LAYOUT_KEY = "effy.shop.labelLayout";

function rememberedLayout(): LabelLayout {
  try {
    const v = window.localStorage.getItem(LAYOUT_KEY);
    return LABEL_LAYOUTS.some((l) => l.id === v) ? (v as LabelLayout) : "roll62";
  } catch {
    return "roll62";
  }
}

/**
 * 089 — "Print labels": the package's label, for the bag, at the shop's label size. Reprint any time;
 * the code never changes.
 */
export function PrintLabels({ detail }: { detail: ShopOrderDetailDTO }) {
  const [layout, setLayout] = useState<LabelLayout>(rememberedLayout);
  const [blocked, setBlocked] = useState(false);

  function onPrint() {
    const sent = printLabels([{ orderNumber: detail.orderNumber, deliveredBy: detail.deliveredBy, label: detail.label }], layout);
    setBlocked(sent === 0);
    if (sent > 0) track({ name: "shop_labels_printed", fulfillmentId: detail.id, layout, count: sent });
  }

  return (
    <div className="grid gap-2">
      <Select
        value={layout}
        onValueChange={(v) => {
          setLayout(v as LabelLayout);
          try {
            window.localStorage.setItem(LAYOUT_KEY, v);
          } catch {
            // a browser that refuses storage simply asks again next time
          }
        }}
      >
        <SelectTrigger aria-label="Label size">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LABEL_LAYOUTS.map((l) => (
            <SelectItem key={l.id} value={l.id}>
              {l.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="outline" onClick={onPrint}>
        Print label
      </Button>
      {blocked ? (
        <p className="text-destructive text-[12.5px]">The browser blocked the print window. Allow pop-ups for this site and try again.</p>
      ) : null}
    </div>
  );
}
