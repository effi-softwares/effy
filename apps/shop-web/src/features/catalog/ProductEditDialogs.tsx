import { useEffect, useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@effy/design-system/ui";
import { GST_STATUS_WORDS, type GstStatus } from "@effy/shared-types";

import { AttributeField } from "./AttributeField";
import { FocusedEditDialog } from "./FocusedEditDialog";
import { orderCategories } from "./categories";
import type { AttributeDraftValue } from "./draft";
import {
  buildAttributeUpdate,
  buildProductUpdate,
  diffScalarFields,
  seedAttributeDraft,
} from "./focusedEdit";
import { isApproved } from "./review";
import type { ProductDetail, ProductType } from "./model";
import { catalogSchemaQuery } from "./queries";
import { useFocusedEdit } from "./useFocusedEdit";
import { attributeErrors, attributesValid } from "./validation";
import { VariantEditor } from "./VariantEditor";
import { draftFromDetail, toInputs, variantSetErrors, type VariantSetDraft } from "./variants";
import { track } from "@/lib/telemetry";

// The four focused-edit dialogs. Each is scoped to one section, seeds its local form state from
// the loaded detail, PATCHes only its changed subset (diffScalarFields) with the detail's `updatedAt`
// as `expectedUpdatedAt`, and on a 409 shows "reload" instead of a doomed retry (FR-023a, via
// useFocusedEdit + FocusedEditDialog). No cards — plain form rows (doctrine-2).

interface EditProps {
  detail: ProductDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Re-seed local state when the dialog opens or the underlying row actually changes (updatedAt moves),
 *  never mid-typing — so a stale reload shows the latest values while normal editing is never clobbered. */
function useSeedKey(detail: ProductDetail, open: boolean) {
  return `${open ? "open" : "closed"}:${detail.updatedAt}`;
}

// Basics (name / brand / GST / descriptions)

export function BasicsEditDialog({ detail, open, onOpenChange }: EditProps) {
  const edit = useFocusedEdit(detail.id);
  const seedKey = useSeedKey(detail, open);

  const [name, setName] = useState(detail.name);
  const [brand, setBrand] = useState(detail.brand ?? "");
  const [shortDescription, setShort] = useState(detail.shortDescription);
  const [longDescription, setLong] = useState(detail.longDescription ?? "");
  // "" when the product predates GST status: the operator chooses, nothing is assumed.
  const [gstStatus, setGst] = useState<"" | GstStatus>(detail.gstStatus ?? "");

  useEffect(() => {
    setName(detail.name);
    setBrand(detail.brand ?? "");
    setShort(detail.shortDescription);
    setLong(detail.longDescription ?? "");
    setGst(detail.gstStatus ?? "");
    edit.reset();
    // Seed by open/updatedAt only — see useSeedKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  const canSave = name.trim().length > 0 && shortDescription.trim().length > 0;

  function onSave() {
    const changed = diffScalarFields(detail, {
      name: name.trim(),
      brand: brand.trim() || null,
      shortDescription: shortDescription.trim(),
      longDescription: longDescription.trim() || null,
      gstStatus: gstStatus || undefined,
    });
    void edit.save(buildProductUpdate(detail.updatedAt, changed), () => onOpenChange(false));
  }

  return (
    <FocusedEditDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit basics"
      description={reviewNote(detail, "Name, brand, GST and descriptions. Prices, codes and weights are each size's — under Sizes and prices.")}
      canSave={canSave}
      saving={edit.saving}
      error={edit.error}
      stale={edit.stale}
      onReload={edit.reload}
      onSave={onSave}
      size="wide"
    >
      {/* Identity on one band: the name takes two columns, brand one; the three identifiers below. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Field id="e-name" label="Name" required>
            <Input id="e-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
        <Field id="e-brand" label="Brand">
          <Input id="e-brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
        </Field>
        <Field id="e-gst" label="GST">
          <Select value={gstStatus} onValueChange={(v) => setGst(v as GstStatus)}>
            <SelectTrigger id="e-gst">
              <SelectValue placeholder="Not set — choose" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gst_free">{GST_STATUS_WORDS.gst_free}</SelectItem>
              <SelectItem value="taxable">{GST_STATUS_WORDS.taxable}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field id="e-short" label="Short description" required>
        <Textarea id="e-short" value={shortDescription} onChange={(e) => setShort(e.target.value)} />
      </Field>
      <Field id="e-long" label="Long description">
        <Textarea
          id="e-long"
          rows={6}
          value={longDescription}
          onChange={(e) => setLong(e.target.value)}
        />
      </Field>
    </FocusedEditDialog>
  );
}

// Sizes and prices (098 — options, and each variant's price, codes, weight and pack size)

export function SizesEditDialog({ detail, open, onOpenChange }: EditProps) {
  const edit = useFocusedEdit(detail.id);
  const seedKey = useSeedKey(detail, open);
  // Opens on the shop's own latest version: the pending proposal when there is one.
  const [set, setSet] = useState<VariantSetDraft>(() => draftFromDetail(detail));
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    setSet(draftFromDetail(detail));
    setTouched(false);
    edit.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  const errors = variantSetErrors(set);
  const valid = Object.keys(errors).length === 0;

  function onSave() {
    setTouched(true);
    if (!valid) return;
    const inputs = toInputs(set);
    // The whole set travels: the server compares it with the live one and proposes only a difference.
    void edit.save(
      { expectedUpdatedAt: detail.updatedAt, options: inputs.options, variants: inputs.variants, unitBasis: inputs.unitBasis },
      () => {
        track({ name: "product_variants_saved", productId: detail.id, variantCount: inputs.variants.length });
        onOpenChange(false);
      },
    );
  }

  return (
    <FocusedEditDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit sizes and prices"
      description={reviewNote(
        detail,
        "What you are paid for each size, and its codes, weight and pack size. Turning a size off is immediate — use the Off sale action on the size's row.",
      )}
      canSave={!touched || valid}
      saving={edit.saving}
      error={edit.error}
      stale={edit.stale}
      onReload={edit.reload}
      onSave={onSave}
      size="full"
    >
      <VariantEditor
        value={set}
        onChange={setSet}
        errors={errors}
        // Every refusal once Save is pressed; before that, only a cell the operator has left.
        showErrors={touched}
        media={(detail.pendingChange?.media ?? detail.media).map((m) => ({ storageKey: m.storageKey, url: m.url, altText: m.altText }))}
        disabled={edit.saving}
      />
    </FocusedEditDialog>
  );
}

// Categorization (product type / primary category)

export function CategorizationEditDialog({ detail, open, onOpenChange }: EditProps) {
  const edit = useFocusedEdit(detail.id);
  const seedKey = useSeedKey(detail, open);
  const schema = useQuery(catalogSchemaQuery);

  const [productTypeId, setTypeId] = useState(detail.productTypeId);
  const [primaryCategoryId, setCategoryId] = useState(detail.primaryCategoryId);

  useEffect(() => {
    setTypeId(detail.productTypeId);
    setCategoryId(detail.primaryCategoryId);
    edit.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  const types = schema.data?.productTypes ?? [];
  const orderedCategories = useMemo(
    () => orderCategories(schema.data?.categories ?? []),
    [schema.data],
  );
  const canSave = !!productTypeId && !!primaryCategoryId;

  function onSave() {
    const changed = diffScalarFields(detail, { productTypeId, primaryCategoryId });
    void edit.save(buildProductUpdate(detail.updatedAt, changed), () => onOpenChange(false));
  }

  return (
    <FocusedEditDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit categorization"
      description={reviewNote(detail, "Changing the type may change which attributes apply.")}
      canSave={canSave}
      saving={edit.saving}
      error={edit.error}
      stale={edit.stale}
      onReload={edit.reload}
      onSave={onSave}
    >
      <Field id="e-type" label="Product type" required>
        <Select value={productTypeId} onValueChange={setTypeId}>
          <SelectTrigger id="e-type">
            <SelectValue placeholder="Choose a type…" />
          </SelectTrigger>
          <SelectContent>
            {types.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field id="e-category" label="Category" required>
        <Select value={primaryCategoryId} onValueChange={setCategoryId}>
          <SelectTrigger id="e-category">
            <SelectValue placeholder="Choose a category…" />
          </SelectTrigger>
          <SelectContent>
            {orderedCategories.map(({ category, depth }) => (
              <SelectItem key={category.id} value={category.id}>
                {`${" ".repeat(depth * 2)}${category.name}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </FocusedEditDialog>
  );
}

// Attributes (the type's EAV fields, reusing AttributeField)

export function AttributesEditDialog({ detail, open, onOpenChange }: EditProps) {
  const edit = useFocusedEdit(detail.id);
  const seedKey = useSeedKey(detail, open);
  const schema = useQuery(catalogSchemaQuery);

  const type: ProductType | undefined = schema.data?.productTypes.find(
    (t) => t.id === detail.productTypeId,
  );

  const [values, setValues] = useState<Record<string, AttributeDraftValue>>(() =>
    seedAttributeDraft(detail),
  );

  useEffect(() => {
    setValues(seedAttributeDraft(detail));
    edit.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  const errors = type ? attributeErrors(type, values) : {};
  const canSave = !!type && attributesValid(type, values);

  function onSave() {
    if (!type) return;
    void edit.save(buildAttributeUpdate(detail.updatedAt, type, values), () =>
      onOpenChange(false),
    );
  }

  return (
    <FocusedEditDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit attributes"
      description={reviewNote(detail, "The details specific to this product's type.")}
      canSave={canSave}
      saving={edit.saving}
      error={edit.error}
      stale={edit.stale}
      onReload={edit.reload}
      onSave={onSave}
      size="wide"
    >
      {!type ? (
        <p className="text-sm text-muted-foreground">Loading attributes…</p>
      ) : type.attributes.length === 0 ? (
        <p className="text-sm text-muted-foreground">This product type has no extra attributes.</p>
      ) : (
        <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
          {[...type.attributes]
            .sort((a, b) => a.displayOrder - b.displayOrder)
            .map((attr) => (
              // Prose and checkbox groups take the full width; a half-width column would wrap a
              // paragraph into a sliver and stack every checkbox on its own line.
              <div
                key={attr.attributeId}
                className={
                  attr.dataType === "long_text" || attr.dataType === "multi_select"
                    ? "sm:col-span-2"
                    : undefined
                }
              >
                <AttributeField
                  attr={attr}
                  value={values[attr.attributeId]}
                  error={errors[attr.attributeId]}
                  onChange={(next) =>
                    setValues((v) => ({ ...v, [attr.attributeId]: next }))
                  }
                />
              </div>
            ))}
        </div>
      )}
    </FocusedEditDialog>
  );
}

// Shared field row

function Field({
  id,
  label,
  required,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required ? <span className="ml-0.5 text-muted-foreground">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

/**
 * What saving does, said before the shop saves. Editing a product Effy has approved does not
 * change the storefront; it sends a change for review. A dialog that saved silently into a queue
 * would leave the shop wondering why its storefront still shows the old name.
 */
function reviewNote(detail: ProductDetail, description: string): string {
  return isApproved(detail)
    ? `${description} This product is approved, so your change goes to Effy for review — customers see it once it is approved.`
    : description;
}
