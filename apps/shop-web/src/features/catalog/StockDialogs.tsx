import { useEffect, useState } from "react";

import type { OperatorStockReason, ProductStockDTO } from "@effy/shared-types";
import { OPERATOR_STOCK_REASONS } from "@effy/shared-types";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@effy/design-system/ui";

import { stockErrorText } from "./stockErrorText";
import { useAdjustStock, useSetStockCount } from "./stockQueries";

/**
 * The two stock WRITES the redesigned product page offers (057) — the mockup's `receive` and
 * `variant` sheets, each landed on the model this platform actually has.
 *
 * ⚠ WHY THEY ARE DIALOGS AND NOT THE INLINE FORMS THEY REPLACE. The pre-redesign Inventory tab put a
 * switch, a two-field count form, a threshold form and a history table permanently on the page. That
 * is four write affordances an operator must read past to answer "how many have we got" — the
 * question the section exists for. The mockup states the numbers and puts every change behind a named
 * verb, which is also what makes the count the thing the eye lands on.
 *
 * ⚠ AND WHY "RECEIVE" IS ITS OWN DIALOG RATHER THAN "ADJUST WITH REASON = RECEIVED". Receiving is the
 * single most frequent stock event in a grocery shop and it is always ADDITIVE — a delivery arrives,
 * the shelf gains units. Making it a mode of a general adjust form asks the operator to choose
 * "add or remove" and then a reason, twice a day, for an action that can only ever be one of each.
 * It is the same reasoning 020 used for the pick screen: the frequent action gets the short path.
 */

const REASON_LABELS: Record<OperatorStockReason, string> = {
  received: "Stock received",
  correction: "Correction",
  damage: "Damaged",
  expiry: "Expired",
};

/** The server's own words, keyed off structure — never a generic sentence (053's lesson). */
function Refusal({ error }: { error: unknown }) {
  return (
    <p role="alert" className="text-destructive text-sm">
      {stockErrorText(error)}
    </p>
  );
}

/** A whole number, zero or more. Rejects "", "1.5", "-2", "12abc" — `Number("")` is 0, which is why
 *  the blank check is separate rather than folded into the numeric one. */
function wholeNumber(raw: string): number | null {
  const text = raw.trim();
  if (text === "") return null;
  if (!/^\d+$/.test(text)) return null;
  return Number(text);
}

/** A signed whole number, never zero — a movement that moves nothing is a record with no fact behind
 *  it (the contract says so, and the server refuses it). */
function signedNumber(raw: string): number | null {
  const text = raw.trim();
  if (!/^[+-]?\d+$/.test(text)) return null;
  const n = Number(text);
  return n === 0 ? null : n;
}

interface DialogProps {
  productId: string;
  stock: ProductStockDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ── Receive stock ────────────────────────────────────────────────────────────────────────────────

/**
 * The mockup's primary header action, landed on `POST .../adjustments` with reason `received`.
 *
 * ⚠ THE MOCKUP'S SUPPLIER AND REFERENCE FIELDS ARE NOT HERE, and that is deliberate rather than an
 * omission. 057 already built the honest version of that: a purchase order names its supplier, its
 * reference and its lines, and receiving against it writes `stock_movement.purchase_order_line_id` —
 * the paper trail whose whole point is that "why do we have 48 of these" stays answerable months
 * later. Two free-text boxes here would record the same intent as unjoinable prose, and an operator
 * who filled them in would reasonably believe the order had been reconciled when nothing had. So this
 * dialog says where the reconciled path is instead of imitating it.
 */
export function ReceiveStockDialog({ productId, stock, open, onOpenChange }: DialogProps) {
  const adjust = useAdjustStock(productId);
  const [units, setUnits] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setUnits("");
      setNote("");
      adjust.reset();
    }
    // Reset on open only — reset() is a new identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const parsed = wholeNumber(units);
  const valid = parsed !== null && parsed > 0;
  const onHand = stock.onHand ?? 0;

  function submit() {
    if (!valid) return;
    adjust.mutate(
      { delta: parsed, reason: "received", note: note.trim() === "" ? undefined : note.trim() },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receive stock</DialogTitle>
          <DialogDescription>
            Add counted units to the shelf. Nothing else about the product changes.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="receive-units">Units received</Label>
            <Input
              id="receive-units"
              inputMode="numeric"
              autoComplete="off"
              className="w-32"
              placeholder="0"
              value={units}
              onChange={(e) => setUnits(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="receive-note">Note (optional)</Label>
            <Textarea
              id="receive-note"
              rows={2}
              placeholder="Anything worth remembering about this delivery."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {/* ⚠ The arithmetic is shown BEFORE the write, not after. The mockup does the same, and it
              is the only thing standing between a mistyped 240 and a shelf count nobody questions. */}
          <div className="border-border flex items-baseline justify-between border-t pt-3.5">
            <span className="text-muted-foreground text-[13px]">On hand after this</span>
            <span className="text-base font-semibold tabular-nums">
              {valid ? `${onHand} → ${onHand + parsed}` : onHand}
            </span>
          </div>

          <p className="text-muted-foreground text-[12.5px]">
            Received a whole purchase order? Record it on the Restock screen instead — receiving there
            ties the units to the order and the supplier they came from.
          </p>

          {adjust.isError ? <Refusal error={adjust.error} /> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={adjust.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || adjust.isPending}>
            {adjust.isPending ? "Adding…" : "Add to stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Adjust stock ─────────────────────────────────────────────────────────────────────────────────

/**
 * The correcting write: set the count to what was actually counted, or move it by a known amount.
 *
 * ⚠ BOTH MODES ARE KEPT, because they answer different questions and one cannot do the other's job
 * honestly. "We counted 9" is an absolute fact about the shelf and must not require the operator to
 * do subtraction against a number they already believe is wrong. "Three were dropped" is a delta and
 * must not require them to know the current count at all — which they may not, if a sale landed while
 * they were walking back from the aisle.
 */
export function AdjustStockDialog({ productId, stock, open, onOpenChange }: DialogProps) {
  const setCount = useSetStockCount(productId);
  const adjust = useAdjustStock(productId);

  const [mode, setMode] = useState<"set" | "adjust">("set");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState<OperatorStockReason>("correction");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setMode("set");
      setValue("");
      setReason("correction");
      setNote("");
      setCount.reset();
      adjust.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const parsed = mode === "set" ? wholeNumber(value) : signedNumber(value);
  const onHand = stock.onHand ?? 0;
  const after = parsed === null ? null : mode === "set" ? parsed : Math.max(0, onHand + parsed);

  const pending = setCount.isPending || adjust.isPending;
  const failure = setCount.error ?? adjust.error;

  function submit() {
    if (parsed === null) return;
    const trimmed = note.trim();
    const done = { onSuccess: () => onOpenChange(false) };
    if (mode === "set") {
      setCount.mutate({ onHand: parsed, reason, note: trimmed === "" ? undefined : trimmed }, done);
    } else {
      adjust.mutate({ delta: parsed, reason, note: trimmed === "" ? undefined : trimmed }, done);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            Correct the counted quantity. Every change is recorded with who made it and why.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="adjust-mode">Change</Label>
              <Select
                value={mode}
                onValueChange={(v) => {
                  setMode(v as "set" | "adjust");
                  setValue("");
                }}
              >
                <SelectTrigger id="adjust-mode" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="set">Set exact count</SelectItem>
                  <SelectItem value="adjust">Add or remove</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="adjust-value">{mode === "set" ? "New count" : "Change by"}</Label>
              <Input
                id="adjust-value"
                inputMode={mode === "set" ? "numeric" : "text"}
                autoComplete="off"
                className="w-32"
                placeholder={mode === "set" ? "0" : "e.g. 24 or -3"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="adjust-reason">Reason</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as OperatorStockReason)}>
                <SelectTrigger id="adjust-reason" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERATOR_STOCK_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {REASON_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="adjust-note">Note (optional)</Label>
            <Textarea
              id="adjust-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="border-border flex items-baseline justify-between border-t pt-3.5">
            <span className="text-muted-foreground text-[13px]">On hand after this</span>
            <span className="text-base font-semibold tabular-nums">
              {after === null ? onHand : `${onHand} → ${after}`}
            </span>
          </div>

          {failure ? <Refusal error={failure} /> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={parsed === null || pending}>
            {pending ? "Saving…" : "Save adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
