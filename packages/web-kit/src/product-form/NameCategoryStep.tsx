import { useState } from "react";
import { ChevronRight } from "lucide-react";

import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Textarea,
} from "@effy/design-system/ui";

import type { ProductDraft } from "./draft";
import type { ShopTaxonomy } from "./model";
import { CategoryPicker, type CategoryPickerEvent } from "./CategoryPicker";
import { EditorSection, FieldError, FormField } from "./fields";

export interface BasicsErrors {
  name?: string;
  category?: string;
  shortDescription?: string;
}

interface Props {
  draft: ProductDraft;
  taxonomy: ShopTaxonomy;
  onField: (
    patch: Partial<
      Pick<ProductDraft, "name" | "brand" | "shortDescription" | "longDescription">
    >,
  ) => void;
  /** Choosing a leaf; the flow warns first when details would be dropped. */
  onCategory: (leafId: string) => void;
  /** Shown once the step has been tried, or the field left empty. */
  errors?: BasicsErrors;
  disabled?: boolean;
  onPickerEvent?: (event: CategoryPickerEvent) => void;
}

/** What the product is called, where shoppers find it, and the line they read first. */
export function NameCategoryStep({
  draft,
  taxonomy,
  onField,
  onCategory,
  errors = {},
  disabled,
  onPickerEvent,
}: Props) {
  const [left, setLeft] = useState<ReadonlySet<keyof BasicsErrors>>(new Set());
  const leave = (k: keyof BasicsErrors) => () =>
    setLeft((s) => (s.has(k) ? s : new Set(s).add(k)));
  // An empty field says so once it has been left, or once Next was tried.
  const own: BasicsErrors = {
    name: draft.name.trim() ? undefined : "Give it a name",
    shortDescription: draft.shortDescription.trim() ? undefined : "Write a line or two for shoppers",
  };
  const err = (k: keyof BasicsErrors) => errors[k] ?? (left.has(k) ? own[k] : undefined);

  return (
    <div className="ef-editor__body">
      <EditorSection>
        <FormField
          id="p-name"
          label="Product name"
          required
          help="Say what it is, the way a shopper would. Leave the size out; that comes later."
          error={err("name")}
        >
          <Input
            id="p-name"
            value={draft.name}
            placeholder="e.g. Greek yoghurt, natural"
            autoComplete="off"
            disabled={disabled}
            aria-invalid={!!err("name")}
            onBlur={leave("name")}
            onChange={(e) => onField({ name: e.target.value })}
          />
        </FormField>
        <FormField id="p-brand" label="Brand" optional>
          <Input
            id="p-brand"
            value={draft.brand}
            placeholder="e.g. Jalna"
            disabled={disabled}
            onChange={(e) => onField({ brand: e.target.value })}
          />
        </FormField>
      </EditorSection>

      <EditorSection
        title={
          <>
            Category <span className="text-destructive">*</span>
          </>
        }
        description="Where shoppers find it. It also decides the details asked for later."
      >
        <div className="grid gap-2" data-invalid={errors.category ? "true" : undefined}>
          <CategoryPicker
            categories={taxonomy.categories}
            recentLeafIds={taxonomy.recentLeafIds}
            productName={draft.name}
            value={draft.primaryCategoryId}
            onChange={onCategory}
            disabled={disabled}
            invalid={!!errors.category}
            onEvent={onPickerEvent}
          />
          <FieldError text={errors.category} />
        </div>
      </EditorSection>

      <EditorSection>
        <FormField
          id="p-short"
          label="Short description"
          required
          help="Shown under the name on the product page."
          error={err("shortDescription")}
        >
          <Textarea
            id="p-short"
            rows={3}
            value={draft.shortDescription}
            placeholder="One or two lines shoppers read first."
            disabled={disabled}
            aria-invalid={!!err("shortDescription")}
            onBlur={leave("shortDescription")}
            onChange={(e) => onField({ shortDescription: e.target.value })}
          />
        </FormField>
        <Collapsible defaultOpen={draft.longDescription.trim() !== ""}>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="link" className="group/more h-auto px-0">
              <ChevronRight
                aria-hidden="true"
                className="transition-transform group-data-[state=open]/more:rotate-90"
              />
              Add a longer description
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4">
            <FormField id="p-long" label="Longer description" optional>
              <Textarea
                id="p-long"
                rows={5}
                value={draft.longDescription}
                placeholder="Taste, texture, how to use it, what makes it good."
                disabled={disabled}
                onChange={(e) => onField({ longDescription: e.target.value })}
              />
            </FormField>
          </CollapsibleContent>
        </Collapsible>
      </EditorSection>
    </div>
  );
}
