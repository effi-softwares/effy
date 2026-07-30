import { useState } from "react";

import { useForm } from "@tanstack/react-form";

import type { PromoKind } from "@effy/shared-types";
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
} from "@effy/design-system/ui";

import { DUPLICATE_CODE_CONFLICT, promotionMutationError, USED_CODE_CONFLICT } from "../errorText";
import { isValueEditable, type PromoCode } from "../model";
import { useCreatePromo, useUpdatePromo } from "../queries";

/**
 * Create a promotional code, or edit an existing one (edit mode when `promo` is passed).
 *
 * ⚠ On a code that has been redeemed, the VALUE fields are disabled and the window/caps are not
 * (FR-068). The disabling is a courtesy that keeps the operator from typing something that will be
 * refused; the platform re-counts redemptions inside the writing transaction, because a code can be
 * redeemed between this dialog opening and Save being pressed.
 *
 * Empty strings mean "no bound" / "uncapped" and are sent as `null`, not omitted — an operator
 * clearing a cap must be able to, and `undefined` would mean "leave it alone".
 */
export interface PromoCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  promo?: PromoCode; // present → edit mode
}

/** An <input type="datetime-local"> wants `YYYY-MM-DDTHH:mm` in LOCAL time; the wire is ISO/UTC. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}
function optionalInt(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

export function PromoCodeDialog({ open, onOpenChange, promo }: PromoCodeDialogProps) {
  const isEdit = Boolean(promo);
  const valueEditable = !promo || isValueEditable(promo);
  const createPromo = useCreatePromo();
  const updatePromo = useUpdatePromo(promo?.id ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      code: promo?.code ?? "",
      kind: (promo?.kind ?? "percentage") as PromoKind,
      percentOff: promo?.percentOff != null ? String(promo.percentOff) : "",
      amountOff: promo?.amountOff ?? "",
      minimumSubtotalAmount: promo?.minimumSubtotalAmount ?? "0.00",
      startsAt: toLocalInput(promo?.startsAt),
      endsAt: toLocalInput(promo?.endsAt),
      maxRedemptions: promo?.maxRedemptions != null ? String(promo.maxRedemptions) : "",
      maxPerCustomer: promo?.maxPerCustomer != null ? String(promo.maxPerCustomer) : "",
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      const window = {
        startsAt: fromLocalInput(value.startsAt),
        endsAt: fromLocalInput(value.endsAt),
        maxRedemptions: optionalInt(value.maxRedemptions),
        maxPerCustomer: optionalInt(value.maxPerCustomer),
      };
      const definition = {
        code: value.code.trim(),
        kind: value.kind,
        ...(value.kind === "percentage"
          ? { percentOff: Number(value.percentOff) }
          : { amountOff: value.amountOff.trim() }),
        minimumSubtotalAmount: value.minimumSubtotalAmount.trim() || "0.00",
      };
      try {
        if (isEdit) {
          // A used code sends ONLY the window and caps — sending an unchanged value field would still
          // be a value rewrite as far as the platform is concerned, and would be refused.
          await updatePromo.mutateAsync(valueEditable ? { ...definition, ...window } : window);
        } else {
          await createPromo.mutateAsync({ ...definition, ...window });
        }
        form.reset();
        onOpenChange(false);
      } catch (err) {
        setFormError(promotionMutationError(err, isEdit ? USED_CODE_CONFLICT : DUPLICATE_CODE_CONFLICT));
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit code" : "Create code"}</DialogTitle>
          <DialogDescription>
            {isEdit && !valueEditable
              ? "This code has been redeemed, so its value is fixed. Its window, caps and status can still change."
              : "Define what the code takes off, when it runs, and how often it can be used."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="space-y-4"
          noValidate
        >
          <form.Field name="code">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="promo-code">Code</Label>
                <Input
                  id="promo-code"
                  autoFocus={!isEdit}
                  required
                  disabled={!valueEditable}
                  placeholder="SPRING20"
                  className="font-mono"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value.toUpperCase())}
                  onBlur={field.handleBlur}
                />
                <p className="text-xs text-muted-foreground">
                  Shoppers may type it in any case — it is matched without regard to case.
                </p>
              </div>
            )}
          </form.Field>

          <form.Field name="kind">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="promo-kind">Takes off</Label>
                <Select
                  value={field.state.value}
                  disabled={!valueEditable}
                  onValueChange={(v) => field.handleChange(v as PromoKind)}
                >
                  <SelectTrigger id="promo-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">A percentage</SelectItem>
                    <SelectItem value="fixed">A fixed amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>

          <form.Subscribe selector={(s) => s.values.kind}>
            {(kind) =>
              kind === "percentage" ? (
                <form.Field name="percentOff">
                  {(field) => (
                    <div className="space-y-2">
                      <Label htmlFor="promo-percent">Percent off</Label>
                      <Input
                        id="promo-percent"
                        type="number"
                        min={1}
                        max={100}
                        required
                        disabled={!valueEditable}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                      />
                    </div>
                  )}
                </form.Field>
              ) : (
                <form.Field name="amountOff">
                  {(field) => (
                    <div className="space-y-2">
                      <Label htmlFor="promo-amount">Amount off</Label>
                      <Input
                        id="promo-amount"
                        inputMode="decimal"
                        placeholder="10.00"
                        required
                        disabled={!valueEditable}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                      />
                      <p className="text-xs text-muted-foreground">
                        Never takes a cart below zero — a larger amount simply zeroes the items.
                      </p>
                    </div>
                  )}
                </form.Field>
              )
            }
          </form.Subscribe>

          <form.Field name="minimumSubtotalAmount">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="promo-minimum">Minimum spend</Label>
                <Input
                  id="promo-minimum"
                  inputMode="decimal"
                  placeholder="0.00"
                  disabled={!valueEditable}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
                <p className="text-xs text-muted-foreground">0.00 for no minimum.</p>
              </div>
            )}
          </form.Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <form.Field name="startsAt">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="promo-starts">Starts</Label>
                  <Input
                    id="promo-starts"
                    type="datetime-local"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </form.Field>
            <form.Field name="endsAt">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="promo-ends">Ends</Label>
                  <Input
                    id="promo-ends"
                    type="datetime-local"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </form.Field>
          </div>
          <p className="text-xs text-muted-foreground">Leave a date empty for no bound.</p>

          <div className="grid gap-4 sm:grid-cols-2">
            <form.Field name="maxRedemptions">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="promo-max">Total uses</Label>
                  <Input
                    id="promo-max"
                    type="number"
                    min={1}
                    placeholder="Uncapped"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </form.Field>
            <form.Field name="maxPerCustomer">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="promo-per-customer">Uses per shopper</Label>
                  <Input
                    id="promo-per-customer"
                    type="number"
                    min={1}
                    placeholder="Uncapped"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </form.Field>
          </div>

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <form.Subscribe selector={(s) => s.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Saving…" : isEdit ? "Save" : "Create code"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
