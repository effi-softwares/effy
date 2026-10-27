import type { ReactNode } from "react";

import { Input, Label, Textarea } from "@effy/design-system/ui";

import type { ProductDraft } from "./draft";
import type { ShopTaxonomy } from "./model";
import { CategoryPicker, type CategoryPickerEvent } from "./CategoryPicker";

interface Props {
  draft: ProductDraft;
  taxonomy: ShopTaxonomy;
  onField: (
    patch: Partial<Pick<ProductDraft, "name" | "brand" | "shortDescription">>,
  ) => void;
  /** Choosing a leaf; the flow warns first when details would be dropped. */
  onCategory: (leafId: string) => void;
  disabled?: boolean;
  onPickerEvent?: (event: CategoryPickerEvent) => void;
}

export function NameCategoryStep({
  draft,
  taxonomy,
  onField,
  onCategory,
  disabled,
  onPickerEvent,
}: Props) {
  return (
    <div className="space-y-5">
      <Field id="p-name" label="Name" required>
        <Input
          id="p-name"
          value={draft.name}
          disabled={disabled}
          onChange={(e) => onField({ name: e.target.value })}
        />
      </Field>

      <div className="space-y-2">
        <p className="text-sm font-medium">
          Category<span className="ml-1 text-muted-foreground">*</span>
        </p>
        <CategoryPicker
          categories={taxonomy.categories}
          recentLeafIds={taxonomy.recentLeafIds}
          productName={draft.name}
          value={draft.primaryCategoryId}
          onChange={onCategory}
          disabled={disabled}
          onEvent={onPickerEvent}
        />
      </div>

      <Field id="p-brand" label="Brand (optional)">
        <Input
          id="p-brand"
          value={draft.brand}
          disabled={disabled}
          onChange={(e) => onField({ brand: e.target.value })}
        />
      </Field>

      <Field id="p-short" label="Short description" required>
        <Textarea
          id="p-short"
          value={draft.shortDescription}
          disabled={disabled}
          onChange={(e) => onField({ shortDescription: e.target.value })}
        />
      </Field>
    </div>
  );
}

function Field({
  id,
  label,
  required,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span className="ml-1 text-muted-foreground">*</span>
        ) : null}
      </Label>
      {children}
    </div>
  );
}
