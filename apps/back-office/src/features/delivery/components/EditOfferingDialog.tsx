import { useState } from "react";

import { useForm } from "@tanstack/react-form";

import type { DeliveryMethod, DeliveryStatus } from "@effy/shared-types";
import { DELIVERY_METHODS, DELIVERY_STATUSES } from "@effy/shared-types";
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

import { deliveryMutationError } from "../errorText";
import type { DeliveryZone, Offering } from "../model";
import { useCreateOffering, useUpdateOffering } from "../queries";

const METHOD_LABELS: Record<DeliveryMethod, string> = {
  same_day: "Same-day",
  scheduled: "Scheduled",
  standard: "Standard",
};

// Define a rate (POST /admin/v1/delivery-offerings) OR edit one (PATCH, edit mode when `offering` is
// passed). The (origin → destination, method) key is immutable, so edit mode locks those three and
// exposes price / window / cutoff / status. Availability of a method for a package follows from this
// per-(origin zone → destination zone) rate, never from shop identity (FR-015).
export interface EditOfferingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zones: DeliveryZone[];
  offering?: Offering; // present → edit mode
}

export function EditOfferingDialog({ open, onOpenChange, zones, offering }: EditOfferingDialogProps) {
  const isEdit = Boolean(offering);
  const createOffering = useCreateOffering();
  const updateOffering = useUpdateOffering(offering?.id ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      originZoneId: offering?.originZoneId ?? "",
      destinationZoneId: offering?.destinationZoneId ?? "",
      method: (offering?.method ?? "standard") as DeliveryMethod,
      priceAmount: offering?.priceAmount ?? "",
      leadDaysMin: String(offering?.leadDaysMin ?? 0),
      leadDaysMax: String(offering?.leadDaysMax ?? 0),
      sameDayCutoff: offering?.sameDayCutoff ?? "",
      status: (offering?.status ?? "active") as DeliveryStatus,
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      const cutoff = value.method === "same_day" && value.sameDayCutoff.trim()
        ? value.sameDayCutoff.trim()
        : null;
      try {
        if (isEdit) {
          await updateOffering.mutateAsync({
            priceAmount: value.priceAmount.trim(),
            leadDaysMin: Number(value.leadDaysMin),
            leadDaysMax: Number(value.leadDaysMax),
            sameDayCutoff: cutoff,
            status: value.status,
          });
        } else {
          if (!value.originZoneId || !value.destinationZoneId) {
            setFormError("Choose an origin and a destination zone.");
            return;
          }
          await createOffering.mutateAsync({
            originZoneId: value.originZoneId,
            destinationZoneId: value.destinationZoneId,
            method: value.method,
            priceAmount: value.priceAmount.trim(),
            leadDaysMin: Number(value.leadDaysMin),
            leadDaysMax: Number(value.leadDaysMax),
            sameDayCutoff: cutoff,
          });
        }
        form.reset();
        onOpenChange(false);
      } catch (err) {
        setFormError(
          deliveryMutationError(err, "A rate for that origin, destination, and method already exists."),
        );
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit rate" : "Add rate"}</DialogTitle>
          <DialogDescription>
            A price and arrival window for one (origin → destination, method) leg.
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
          <div className="grid grid-cols-2 gap-3">
            <form.Field name="originZoneId">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="rate-origin">Origin zone</Label>
                  <Select
                    value={field.state.value}
                    onValueChange={(v) => field.handleChange(v)}
                    disabled={isEdit}
                  >
                    <SelectTrigger id="rate-origin">
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      {zones.map((z) => (
                        <SelectItem key={z.id} value={z.id}>
                          {z.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </form.Field>
            <form.Field name="destinationZoneId">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="rate-dest">Destination zone</Label>
                  <Select
                    value={field.state.value}
                    onValueChange={(v) => field.handleChange(v)}
                    disabled={isEdit}
                  >
                    <SelectTrigger id="rate-dest">
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      {zones.map((z) => (
                        <SelectItem key={z.id} value={z.id}>
                          {z.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </form.Field>
          </div>

          <form.Field name="method">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="rate-method">Method</Label>
                <Select
                  value={field.state.value}
                  onValueChange={(v) => field.handleChange(v as DeliveryMethod)}
                  disabled={isEdit}
                >
                  <SelectTrigger id="rate-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DELIVERY_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {METHOD_LABELS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>

          <div className="grid grid-cols-3 gap-3">
            <form.Field name="priceAmount">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="rate-price">Price (AUD)</Label>
                  <Input
                    id="rate-price"
                    required
                    inputMode="decimal"
                    placeholder="5.00"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                </div>
              )}
            </form.Field>
            <form.Field name="leadDaysMin">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="rate-min">Lead days min</Label>
                  <Input
                    id="rate-min"
                    type="number"
                    min={0}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                </div>
              )}
            </form.Field>
            <form.Field name="leadDaysMax">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="rate-max">Lead days max</Label>
                  <Input
                    id="rate-max"
                    type="number"
                    min={0}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                </div>
              )}
            </form.Field>
          </div>

          <form.Subscribe selector={(s) => s.values.method}>
            {(method) =>
              method === "same_day" ? (
                <form.Field name="sameDayCutoff">
                  {(field) => (
                    <div className="space-y-2">
                      <Label htmlFor="rate-cutoff">Same-day cutoff (HH:mm)</Label>
                      <Input
                        id="rate-cutoff"
                        placeholder="14:00"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                      />
                    </div>
                  )}
                </form.Field>
              ) : null
            }
          </form.Subscribe>

          {isEdit ? (
            <form.Field name="status">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="rate-status">Status</Label>
                  <Select
                    value={field.state.value}
                    onValueChange={(v) => field.handleChange(v as DeliveryStatus)}
                  >
                    <SelectTrigger id="rate-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DELIVERY_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </form.Field>
          ) : null}

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <form.Subscribe selector={(s) => s.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Saving…" : isEdit ? "Save" : "Add rate"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
