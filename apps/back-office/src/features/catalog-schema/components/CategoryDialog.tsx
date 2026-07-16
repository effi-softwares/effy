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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@effy/design-system/ui";

import { catalogMutationError } from "../errorText";
import type { Category } from "../model";
import { useCreateCategory, useUpdateCategory } from "../queries";

// Create or edit a taxonomy node. `parentId` builds the tree (the backend rejects self/descendant
// parents — no cycles, FR-006); on create the `key` is set once. `categories` is the full list, so
// the parent select can offer every other node without a second fetch.
const NO_PARENT = "__root";

export interface CategoryDialogProps {
  category?: Category;
  categories: Category[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CategoryDialog({
  category,
  categories,
  open,
  onOpenChange,
}: CategoryDialogProps) {
  const isEdit = Boolean(category);
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory(category?.id ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  // A node cannot parent itself; the backend additionally blocks descendants (cycle guard).
  const parentOptions = categories.filter((c) => c.id !== category?.id);

  const form = useForm({
    defaultValues: {
      key: category?.key ?? "",
      name: category?.name ?? "",
      parentId: category?.parentId ?? NO_PARENT,
      displayOrder: category ? String(category.displayOrder) : "0",
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      const parentId = value.parentId === NO_PARENT ? null : value.parentId;
      try {
        if (category) {
          await updateCategory.mutateAsync({
            name: value.name.trim(),
            parentId,
            displayOrder: Number(value.displayOrder) || 0,
          });
        } else {
          await createCategory.mutateAsync({
            key: value.key.trim(),
            name: value.name.trim(),
            parentId,
            displayOrder: Number(value.displayOrder) || 0,
          });
        }
        form.reset();
        onOpenChange(false);
      } catch (err) {
        setFormError(catalogMutationError(err, "A category with that key already exists."));
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit category" : "Create category"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the category. The key cannot change."
              : "A node in the product category taxonomy."}
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
          {isEdit ? (
            <div className="space-y-2">
              <Label htmlFor="cat-key">Key</Label>
              <Input id="cat-key" value={category?.key ?? ""} disabled readOnly />
            </div>
          ) : (
            <form.Field name="key">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="cat-key">Key</Label>
                  <Input
                    id="cat-key"
                    autoFocus
                    required
                    placeholder="prepared_meals"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                </div>
              )}
            </form.Field>
          )}
          <form.Field name="name">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="cat-name">Name</Label>
                <Input
                  id="cat-name"
                  autoFocus={isEdit}
                  required
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              </div>
            )}
          </form.Field>
          <div className="grid grid-cols-2 gap-3">
            <form.Field name="parentId">
              {(field) => (
                <div className="space-y-2">
                  <Label>Parent</Label>
                  <Select value={field.state.value} onValueChange={field.handleChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_PARENT}>None (top level)</SelectItem>
                      {parentOptions.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </form.Field>
            <form.Field name="displayOrder">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="cat-order">Display order</Label>
                  <Input
                    id="cat-order"
                    type="number"
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
                  {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Create category"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
