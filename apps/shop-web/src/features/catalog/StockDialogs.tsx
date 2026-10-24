import { useEffect, useState, type ReactNode } from "react";

import type { OperatorStockReason, ProductStockDTO } from "@effy/shared-types";
import { OPERATOR_STOCK_REASONS } from "@effy/shared-types";
import {
  Button,
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
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
import { useAdjustStock, useSetStockCount, useSetStockTracking } from "./stockQueries";

/**
 * The product page's stock writes, as dialogs behind named verbs. "RECEIVE" is its own dialog rather than
 * an adjust mode: it is the most frequent stock event and always additive, so it gets the short path.
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
    <p role="alert" className="text-sm font-medium">
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
  variantId: string;
  stock: ProductStockDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The size this count belongs to ("1 kg"), named in the title; null for a product sold one way. */
  sizeLabel?: string | null;
  /** A size chooser, shown first, when the dialog was opened without one (the page header). */
  sizeControl?: ReactNode;
}

/** "Receive stock — 1 kg": stock is counted per size, so every stock dialog says which. */
const titled = (title: string, sizeLabel: string | null | undefined) => (sizeLabel ? `${title} — ${sizeLabel}` : title);

// Receive stock

/**
 * Receive stock: `POST …/adjustments` with reason `received`. No supplier or reference fields: those
 * belong to purchasing, which does not exist yet; the note carries the context.
 */
export function ReceiveStockDialog({ variantId, stock, open, onOpenChange, sizeLabel, sizeControl }: DialogProps) {
  const adjust = useAdjustStock(variantId);
  const [units, setUnits] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setUnits("");
      setNote("");
      adjust.reset();
    }
    // Reset on open only — reset is a new identity every render.
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
    <ResponsiveModal open={open} onOpenChange={onOpenChange}>
      <ResponsiveModalContent className="max-md:max-h-[92dvh] max-md:overflow-y-auto max-md:pb-[env(safe-area-inset-bottom)] max-md:[&>*:not([data-slot])]:px-4">
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>{titled("Receive stock", sizeLabel)}</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            Add counted units to the shelf. Nothing else about the product changes.
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        <div className="grid gap-4">
          {sizeControl}
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

          {/* The arithmetic is shown before the write, not after. The mockup does the same, and it
              is the only thing standing between a mistyped 240 and a shelf count nobody questions. */}
          <div className="border-border flex items-baseline justify-between border-t pt-3.5">
            <span className="text-muted-foreground text-[13px]">On hand after this</span>
            <span className="text-base font-semibold tabular-nums">
              {valid ? `${onHand} → ${onHand + parsed}` : onHand}
            </span>
          </div>

          {adjust.isError ? <Refusal error={adjust.error} /> : null}
        </div>

        <ResponsiveModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={adjust.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || adjust.isPending}>
            {adjust.isPending ? "Adding…" : "Add to stock"}
          </Button>
        </ResponsiveModalFooter>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}

// Add stock (start counting)

/**
 * Add stock on an uncounted product: one request (`PUT …/stock/tracking` with the opening count), so the
 * server writes one `tracking_enabled` movement and a failure cannot leave the product counted at zero
 * (unbuyable). It says what changes: from then on paid orders deduct units and the product stops selling
 * at zero.
 */
export function StartTrackingDialog({
  variantId,
  open,
  onOpenChange,
  sizeLabel,
  sizeControl,
}: Omit<DialogProps, "stock">) {
  const setTracking = useSetStockTracking(variantId);
  const [units, setUnits] = useState("");

  useEffect(() => {
    if (open) {
      setUnits("");
      setTracking.reset();
    }
    // Reset on open only — reset is a new identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const parsed = wholeNumber(units);
  const valid = parsed !== null;

  function submit() {
    if (!valid) return;
    setTracking.mutate(
      { tracked: true, onHand: parsed },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange}>
      <ResponsiveModalContent className="max-md:max-h-[92dvh] max-md:overflow-y-auto max-md:pb-[env(safe-area-inset-bottom)] max-md:[&>*:not([data-slot])]:px-4">
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>{titled("Add stock", sizeLabel)}</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            This isn&apos;t counted yet. Enter how many you have and Effy starts keeping
            count from there.
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        <div className="grid gap-4">
          {sizeControl}
          <div className="grid gap-1.5">
            <Label htmlFor="start-units">Units in stock now</Label>
            <Input
              id="start-units"
              inputMode="numeric"
              autoComplete="off"
              className="w-32"
              placeholder="0"
              value={units}
              onChange={(e) => setUnits(e.target.value)}
            />
            <p className="text-muted-foreground text-[12.5px]">
              Required — counting cannot start from an unknown number.
            </p>
          </div>

          {/* The consequence, stated before the write and not after it. This one action changes how
              the product behaves for shoppers, and the operator only sees the words "Add stock". */}
          <div className="border-border border-t pt-3.5">
            <p className="text-muted-foreground text-[12.5px]">
              Stock tracking will be turned on: each paid order deducts a unit, and the product stops
              selling at zero. You can turn it off again, or set a low-stock threshold, under Edit
              rules.
            </p>
          </div>

          {setTracking.isError ? <Refusal error={setTracking.error} /> : null}
        </div>

        <ResponsiveModalFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={setTracking.isPending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || setTracking.isPending}>
            {setTracking.isPending ? "Adding…" : "Add stock"}
          </Button>
        </ResponsiveModalFooter>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}

// Adjust stock

/**
 * The correcting write: set the count to what was actually counted, or move it by a known amount.
 *
 * Both modes are kept, because they answer different questions and one cannot do the other's job
 * honestly. "We counted 9" is an absolute fact about the shelf and must not require the operator to
 * do subtraction against a number they already believe is wrong. "Three were dropped" is a delta and
 * must not require them to know the current count at all — which they may not, if a sale landed while
 * they were walking back from the aisle.
 */
export function AdjustStockDialog({ variantId, stock, open, onOpenChange, sizeLabel, sizeControl }: DialogProps) {
  const setCount = useSetStockCount(variantId);
  const adjust = useAdjustStock(variantId);

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
    <ResponsiveModal open={open} onOpenChange={onOpenChange}>
      <ResponsiveModalContent className="max-md:max-h-[92dvh] max-md:overflow-y-auto max-md:pb-[env(safe-area-inset-bottom)] max-md:[&>*:not([data-slot])]:px-4">
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>{titled("Adjust stock", sizeLabel)}</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            Correct the counted quantity. Every change is recorded with who made it and why.
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        <div className="grid gap-4">
          {sizeControl}
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

        <ResponsiveModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={parsed === null || pending}>
            {pending ? "Saving…" : "Save adjustment"}
          </Button>
        </ResponsiveModalFooter>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}
