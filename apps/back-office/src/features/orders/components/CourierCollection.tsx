import { useState } from "react";

import type { AdminOrderDetailDTO } from "@effy/shared-types";
import { Button, Input } from "@effy/design-system/ui";

import { consignmentError } from "../errorText";
import { useCourierCollection } from "../queries";

const MODE_LABEL = { hub: "Via the hub", supplier: "Pickup from the supplier" } as const;
const MODE_HELP = {
  hub: "Effy's drivers collect the parcels and the hub hands them to the courier.",
  supplier: "The courier collects each parcel from the supplier that packed it.",
} as const;

/**
 * How this courier order's parcels reach the courier (080 US3) — and the switch, until the first parcel
 * leaves Effy's or a supplier's hands. The server refuses after that (`collection_locked`), and refuses
 * a switch to the supplier while a driver is assigned to collect (`collection_assigned`).
 *
 * ⚠ Rows, not a card (Principle V). The history is oldest first, as the server keeps it.
 */
type Props = {
  order: Pick<AdminOrderDetailDTO, "id" | "courierCollection" | "courierCollectionHistory">;
  canChange: boolean;
  formatDateTime: (iso: string) => string;
};

export function CourierCollection(props: Props) {
  // Nothing for an order Effy delivers, or one placed before 080.
  const mode = props.order.courierCollection;
  return mode ? <CourierCollectionRows {...props} mode={mode} /> : null;
}

function CourierCollectionRows({ order, canChange, formatDateTime, mode }: Props & { mode: "hub" | "supplier" }) {
  const change = useCourierCollection(order.id);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const other = mode === "hub" ? "supplier" : "hub";

  async function switchMode() {
    setError(null);
    try {
      await change.mutateAsync({ mode: other, note: note.trim() || null });
      setNote("");
    } catch (err) {
      setError(consignmentError(err));
    }
  }

  return (
    <div className="space-y-2" data-testid="courier-collection">
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
        <dt className="text-muted-foreground">Reaches the courier</dt>
        <dd>
          <span className="font-medium">{MODE_LABEL[mode]}</span>
          <span className="text-muted-foreground"> — {MODE_HELP[mode]}</span>
        </dd>
      </dl>
      {(order.courierCollectionHistory ?? []).length > 0 ? (
        <ol className="space-y-0.5 text-sm text-muted-foreground" aria-label="How it reaches the courier — changes">
          {order.courierCollectionHistory.map((h, i) => (
            <li key={`${h.at}-${i}`}>
              <span className="tabular-nums">{formatDateTime(h.at)}</span> · {MODE_LABEL[h.from]} → {MODE_LABEL[h.to]}
              {h.note ? ` — ${h.note}` : ""}
            </li>
          ))}
        </ol>
      ) : null}
      {canChange ? (
        <div className="flex flex-wrap items-end gap-2">
          <Input aria-label="Why (optional)" placeholder="Why (optional)" className="w-64" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button variant="outline" size="sm" disabled={change.isPending} onClick={() => void switchMode()}>
            Switch to {MODE_LABEL[other].toLowerCase()}
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
