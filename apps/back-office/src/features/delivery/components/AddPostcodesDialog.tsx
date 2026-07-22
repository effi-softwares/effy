import { useState } from "react";

import { useForm } from "@tanstack/react-form";

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
} from "@effy/design-system/ui";

import { deliveryMutationError } from "../errorText";
import { useAddPostcodes } from "../queries";

// Assign one or more postcodes to a zone (POST /admin/v1/delivery-zones/{id}/postcodes). Accepts a
// comma/space/newline-separated list; a postcode already zoned elsewhere → 409 (a postcode belongs
// to at most one zone).
export interface AddPostcodesDialogProps {
  zoneId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function parsePostcodes(raw: string): string[] {
  return Array.from(new Set(raw.split(/[\s,]+/).map((p) => p.trim()).filter(Boolean)));
}

export function AddPostcodesDialog({ zoneId, open, onOpenChange }: AddPostcodesDialogProps) {
  const addPostcodes = useAddPostcodes(zoneId);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { postcodes: "" },
    onSubmit: async ({ value }) => {
      setFormError(null);
      const postcodes = parsePostcodes(value.postcodes);
      if (postcodes.length === 0) {
        setFormError("Enter at least one postcode.");
        return;
      }
      try {
        await addPostcodes.mutateAsync({ postcodes });
        form.reset();
        onOpenChange(false);
      } catch (err) {
        setFormError(
          deliveryMutationError(err, "One of those postcodes already belongs to another zone."),
        );
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add postcodes</DialogTitle>
          <DialogDescription>
            One or more 4-digit postcodes, separated by spaces, commas, or new lines.
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
          <form.Field name="postcodes">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="zone-postcodes">Postcodes</Label>
                <Input
                  id="zone-postcodes"
                  autoFocus
                  required
                  placeholder="3000, 3001, 3002"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              </div>
            )}
          </form.Field>
          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <form.Subscribe selector={(s) => s.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Adding…" : "Add postcodes"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
